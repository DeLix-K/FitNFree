# FitNFree: switching Stripe from Sandbox to Live

Prepared 2026-10-25. Nothing here has been done. Keys and secrets go only into the Supabase and Stripe dashboards, never into chat,
the repository, or `app.json`.

## What the app uses Stripe for (so you know what must work in Live)

| Feature | Function | Needs in Live |
|---|---|---|
| Web Premium subscription | `create-checkout-session` | a recurring **price** (`STRIPE_PRICE_ID`) |
| Merch (physical goods) | `create-merch-checkout` | shipping address collection, then Printful order |
| Live trainer sessions + payouts | `create-trainer-checkout`, `trainer-connect-onboarding` | **Stripe Connect** (Express accounts), 15% platform fee, `transfer_data` to the trainer |
| Courses, Guides & Plans (web only) | `create-course-checkout`, `create-digital-product-checkout`, `create-package-checkout` | nothing special |
| Everything above reports back | `stripe-webhook` | webhook endpoint + signing secret |

The iPhone Premium subscription is billed by **Apple**, not Stripe, so it is not affected by this switch.
Only three Supabase secrets are involved: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`.
Apart from the Premium price, products are created on the fly (`price_data`), so you do not recreate a product catalogue.

## Read this first: merch orders are real, even in Sandbox

When a merch payment completes, `stripe-webhook` creates **and confirms** a real Printful order (`/orders/{id}/confirm`).
So any merch checkout completed during Sandbox testing may have created a real Printful order that Printful will print and
charge you for. Before and after the switch, open **Printful > Orders** and cancel any test orders that are not yet in production.

## Step by step

### 1. Activate the Stripe account (Live)
1. In Stripe, turn off the **Sandbox / Test** environment (top-left switcher) and open the **Live** one. Click **Activate your account**.
2. Business type (individual/sole trader or company), legal name, address, date of birth and ID of the account holder or directors.
3. **Bank account** for payouts (GBP).
4. Public details: business name as customers see it, support email and phone, **statement descriptor** (for example `FITNFREE`),
   website URL. Stripe checks the website: it should show what you sell, prices, delivery and returns terms, contact details,
   and links to the privacy policy and terms. Use `https://delix-k.github.io/apps/fitnfree/` pages or your web app.
5. Wait for "Charges enabled / Payouts enabled". It can take hours to a few days.

### 2. Live settings that do not carry over from Sandbox
Re-do these in Live mode: **Settings > Branding** (logo, colours), **Customer emails** (receipts on), **Payment methods**
(cards, Apple Pay, Google Pay), **Tax** (VAT: if you are not VAT registered, say so; revisit if you pass the threshold),
**Radar** (leave defaults), and **Notifications** (payment failed, disputes, payouts to your email).

### 3. Connect (trainer payouts), Live
1. **Settings > Connect**: complete the **platform profile** in Live mode (what the platform does, who is responsible for refunds
   and disputes). Stripe reviews this before Express accounts can be created.
2. **Connect > Settings > Express accounts**: add branding, set the return and refresh behaviour, and pick the supported countries.
3. Expect trainers to complete **real** onboarding (ID and bank details). Sandbox trainer accounts do not exist in Live.

### 4. The Premium price
Products > **Add product** `FitNFree Premium`, recurring monthly. Choose the amount and currency you want to charge on the web
(the website currently shows $9.99 with a UK note; Apple's UK price is £8.99). Copy the **Price ID** (`price_...`).

### 5. The webhook
Developers > Webhooks > **Add endpoint** (Live mode):
* URL: `https://fuhvcclwsbltqvribpsq.supabase.co/functions/v1/stripe-webhook`
* Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
* Copy the **Signing secret** (`whsec_...`). A Live endpoint has a different secret from the Sandbox one.

### 6. The API key
Developers > API keys > **Secret key** (`sk_live_...`). A restricted key is safer but must allow Checkout Sessions, Customers,
Accounts and Account Links (write); if in doubt start with the standard secret key and rotate it later.

### 7. Put the three secrets into Supabase (not into chat)
Supabase dashboard > project `fuhvcclwsbltqvribpsq` > **Edge Functions > Secrets**: set `STRIPE_SECRET_KEY` (live key),
`STRIPE_WEBHOOK_SECRET` (live whsec), `STRIPE_PRICE_ID` (live price id). Functions read secrets when they start, so a
redeploy of the Stripe functions after changing them is the safest way to be sure they use the new values. Also check
`ALLOWED_ORIGINS` lists your real web domain.

### 8. Clean up what Sandbox left in the database (review before running; nothing has been run)
Live Stripe knows nothing about Sandbox customers, accounts, sessions or payments:
* `profiles.stripe_customer_id` values from Sandbox are invalid in Live. A Sandbox-subscribed test user keeps `is_premium` but cannot manage billing.
* `trainer_profiles.stripe_account_id` values and `payouts_enabled = true` are Sandbox Express accounts. Live checkout to such a trainer fails
  ("No such destination"). They must re-onboard in Live.
* Pending or paid test rows in `merch_orders`, course and digital-product purchases, and session packages.

Suggested review queries (read-only first):
```sql
select count(*) from public.trainer_profiles where stripe_account_id is not null;
select id, display_name, payouts_enabled from public.trainer_profiles where stripe_account_id is not null;
select count(*) from public.profiles where stripe_customer_id is not null;
select status, count(*) from public.merch_orders group by status;
```
Then, only after you have checked they are all test data, a cleanup such as:
```sql
-- trainers must re-onboard in Live
update public.trainer_profiles set stripe_account_id = null, payouts_enabled = false where stripe_account_id is not null;
-- test customers: forget Sandbox customer ids (and any test-only premium you gave yourself)
update public.profiles set stripe_customer_id = null where stripe_customer_id is not null;
```
Do not clear real users' data. If nobody real has paid through Stripe yet, this is safe; if anyone has, tell me and we will
do it more carefully.

### 9. Test it with real money, small, then refund
1. A web Premium subscription with your own card, check `is_premium` flips, then cancel and refund in Stripe.
2. A cheap merch item to your own address: check the order reaches Printful, then **cancel it in Printful before production**.
3. A trainer session with a real onboarded trainer (or yourself as one), check the platform fee and the transfer.
4. Developers > Webhooks > the Live endpoint: every delivery should show **200**. Anything else, look at the Edge Function logs.

### 10. Afterwards
* Stripe dashboard alerts on for failed payments, disputes and payouts; add a second person to the account if you can.
* Rotate the secret key if it was ever shown on a shared screen.
* Charge currency: trainers, courses and guides are charged in **USD** in code, and merch uses the Printful currency. If you want GBP
  for UK customers, that is a code change for 1.0.1.

## Can you release the iPhone app before this?
Yes. The iPhone Premium subscription does not use Stripe. Merch and trainer purchases will not work for real customers until Live
is set up, so either finish this first or release and open those features when ready.

## What I cannot do from here
I cannot see your Stripe account, your Supabase secrets, or Printful, and I do not use the old access token. Each step above that
needs those is yours. When you have done a step, tell me what you saw and I will check the rest (for example, what each function returns).
