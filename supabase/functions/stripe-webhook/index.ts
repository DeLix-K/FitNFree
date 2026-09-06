// Supabase Edge Function: receives Stripe webhook events and keeps
// profiles.is_premium in sync with the user's actual subscription status.
// Deploy via the Supabase dashboard: Edge Functions > Create a new function.
// IMPORTANT: turn "Enforce JWT Verification" OFF for this one — Stripe can't
// send a Supabase JWT. Security instead comes from verifying Stripe's own
// signature below, using STRIPE_WEBHOOK_SECRET.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

function printfulHeaders(): Record<string, string> {
  const token = Deno.env.get('PRINTFUL_API_TOKEN')!;
  const storeId = Deno.env.get('PRINTFUL_STORE_ID');
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (storeId) headers['X-PF-Store-Id'] = storeId;
  return headers;
}

// Creates the order in Printful and confirms it for real fulfillment.
// Any failure here leaves the merch_order as 'failed' with a reason saved,
// so a paid order never silently goes unfulfilled without a trace.
async function submitMerchOrderToPrintful(
  adminClient: ReturnType<typeof createClient>,
  orderId: string,
  shipping: {
    name: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    country: string;
    zip: string;
  },
  items: { syncVariantId: number; quantity: number }[]
): Promise<void> {
  const printfulToken = Deno.env.get('PRINTFUL_API_TOKEN');
  if (!printfulToken) {
    await adminClient
      .from('merch_orders')
      .update({ status: 'failed', error_message: 'Printful is not configured.' })
      .eq('id', orderId);
    return;
  }

  try {
    const createResponse = await fetch('https://api.printful.com/orders', {
      method: 'POST',
      headers: { ...printfulHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: {
          name: shipping.name,
          address1: shipping.address1,
          address2: shipping.address2,
          city: shipping.city,
          state_code: shipping.state,
          country_code: shipping.country,
          zip: shipping.zip,
        },
        items: items.map((item) => ({
          sync_variant_id: item.syncVariantId,
          quantity: item.quantity,
        })),
      }),
    });

    const createData = await createResponse.json();
    if (!createResponse.ok) {
      await adminClient
        .from('merch_orders')
        .update({ status: 'failed', error_message: `Printful order creation failed: ${JSON.stringify(createData)}` })
        .eq('id', orderId);
      return;
    }

    const printfulOrderId = createData.result?.id;

    const confirmResponse = await fetch(`https://api.printful.com/orders/${printfulOrderId}/confirm`, {
      method: 'POST',
      headers: printfulHeaders(),
    });

    if (!confirmResponse.ok) {
      const confirmData = await confirmResponse.text();
      await adminClient
        .from('merch_orders')
        .update({
          status: 'failed',
          printful_order_id: String(printfulOrderId),
          error_message: `Printful order confirm failed: ${confirmData}`,
        })
        .eq('id', orderId);
      return;
    }

    await adminClient
      .from('merch_orders')
      .update({ status: 'submitted', printful_order_id: String(printfulOrderId) })
      .eq('id', orderId);
  } catch (err) {
    await adminClient
      .from('merch_orders')
      .update({ status: 'failed', error_message: String(err) })
      .eq('id', orderId);
  }
}

Deno.serve(async (req) => {
  console.log(`stripe-webhook request received, content-length: ${req.headers.get('content-length')}`);
  try {
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!signature || !webhookSecret || !stripeSecretKey) {
      return new Response('Webhook not configured.', { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
    const body = await req.text();

    // Deno has no Node "crypto" module, which Stripe's SDK uses by default for
    // signature verification — an explicit SubtleCrypto provider is required
    // here, or constructEventAsync fails unpredictably on edge runtimes.
    const cryptoProvider = Stripe.createSubtleCryptoProvider();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        cryptoProvider
      );
    } catch (err) {
      return new Response(`Invalid signature: ${err}`, { status: 400 });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const setPremiumByCustomer = async (
      customerId: string,
      isPremium: boolean,
      subscriptionId: string | null
    ) => {
      const { data, error, count } = await adminClient
        .from('profiles')
        .update({ is_premium: isPremium, stripe_subscription_id: subscriptionId })
        .eq('stripe_customer_id', customerId)
        .select();
      console.log(
        'setPremiumByCustomer',
        JSON.stringify({ customerId, isPremium, subscriptionId, error, count, rows: data?.length })
      );
    };

    console.log(`stripe-webhook event received: ${event.type} (id: ${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.metadata?.fitnfree_order_type === 'trainer_plan') {
          const { data, error, count } = await adminClient
            .from('trainer_orders')
            .update({
              status: 'paid',
              stripe_payment_intent_id: session.payment_intent as string,
            })
            .eq('stripe_checkout_session_id', session.id)
            .eq('status', 'pending')
            .select();
          console.log(
            'trainer order marked paid',
            JSON.stringify({ sessionId: session.id, error, count, rows: data?.length })
          );
          break;
        }

        if (session.metadata?.fitnfree_order_type === 'session_package') {
          const { data, error, count } = await adminClient
            .from('trainer_session_credits')
            .update({ status: 'paid' })
            .eq('stripe_checkout_session_id', session.id)
            .eq('status', 'pending')
            .select();
          console.log(
            'session package credits marked paid',
            JSON.stringify({ sessionId: session.id, error, count, rows: data?.length })
          );
          break;
        }

        if (session.metadata?.fitnfree_order_type === 'course') {
          const { data, error, count } = await adminClient
            .from('course_enrollments')
            .update({ status: 'paid' })
            .eq('stripe_checkout_session_id', session.id)
            .eq('status', 'pending')
            .select();
          console.log(
            'course enrollment marked paid',
            JSON.stringify({ sessionId: session.id, error, count, rows: data?.length })
          );
          break;
        }

        if (session.metadata?.fitnfree_order_type === 'digital_product') {
          const { data, error, count } = await adminClient
            .from('digital_product_purchases')
            .update({ status: 'paid' })
            .eq('stripe_checkout_session_id', session.id)
            .eq('status', 'pending')
            .select();
          console.log(
            'digital product purchase marked paid',
            JSON.stringify({ sessionId: session.id, error, count, rows: data?.length })
          );
          break;
        }

        if (session.metadata?.fitnfree_order_type === 'merch') {
          // Pinned to apiVersion 2024-06-20, so shipping_details is still the
          // flat top-level field — it only moved under collected_information
          // for integrations on the 2025-03-31+ API version.
          const shippingDetails = session.shipping_details;
          const address = shippingDetails?.address;

          const { data: orderRows, error: updateError } = await adminClient
            .from('merch_orders')
            .update({
              status: 'paid',
              shipping_name: shippingDetails?.name ?? null,
              shipping_address1: address?.line1 ?? null,
              shipping_address2: address?.line2 ?? null,
              shipping_city: address?.city ?? null,
              shipping_state: address?.state ?? null,
              shipping_country: address?.country ?? null,
              shipping_zip: address?.postal_code ?? null,
            })
            .eq('stripe_checkout_session_id', session.id)
            .eq('status', 'pending_payment')
            .select();

          console.log(
            'merch order marked paid',
            JSON.stringify({ sessionId: session.id, error: updateError, rows: orderRows?.length })
          );

          const order = orderRows?.[0];
          if (order && address) {
            await submitMerchOrderToPrintful(
              adminClient,
              order.id,
              {
                name: shippingDetails!.name ?? '',
                address1: address.line1 ?? '',
                address2: address.line2 ?? '',
                city: address.city ?? '',
                state: address.state ?? '',
                country: address.country ?? '',
                zip: address.postal_code ?? '',
              },
              (order.items as { syncVariantId: number; quantity: number }[]).map((item) => ({
                syncVariantId: item.syncVariantId,
                quantity: item.quantity,
              }))
            );
          } else if (order) {
            await adminClient
              .from('merch_orders')
              .update({ status: 'failed', error_message: 'No shipping address was collected.' })
              .eq('id', order.id);
          }
          break;
        }

        if (session.customer && session.subscription) {
          await setPremiumByCustomer(
            session.customer as string,
            true,
            session.subscription as string
          );
        } else {
          console.log('checkout.session.completed missing customer/subscription', {
            customer: session.customer,
            subscription: session.subscription,
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const active = subscription.status === 'active' || subscription.status === 'trialing';
        await setPremiumByCustomer(subscription.customer as string, active, subscription.id);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await setPremiumByCustomer(subscription.customer as string, false, null);
        break;
      }
      default:
        // Other event types aren't relevant to premium status; ignore them.
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
