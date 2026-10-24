// Connects "start the subscription purchase" (lib/billing.ts) to the screen that
// shows Apple/Google's required subscription information first
// (components/SubscriptionPaywall.tsx).
//
// App Review Guideline 3.1.2(c): before the purchase starts, the app itself has
// to show the subscription's title, length and price, plus working links to the
// Privacy Policy and Terms of Use. Every "Upgrade" button in the app goes
// through startCheckout(), so putting the screen in that one place covers all
// of them -- including buttons that sit inside other modals.

export type PaywallMode = 'subscribe' | 'details';

type Presenter = (decide: (confirmed: boolean) => void, mode: PaywallMode) => void;

let presenter: Presenter | null = null;

// The paywall component registers itself on mount and unregisters on unmount.
export function registerPaywallPresenter(next: Presenter): () => void {
  presenter = next;
  return () => {
    if (presenter === next) presenter = null;
  };
}

// Resolves true if the person chose to subscribe, false if they backed out (or
// restored an existing subscription instead). Fails closed: if the screen isn't
// mounted we refuse to start a purchase rather than skip the disclosure.
export function confirmSubscription(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!presenter) {
      reject(new Error('The subscription screen is not available. Please restart the app and try again.'));
      return;
    }
    presenter(resolve, 'subscribe');
  });
}

// The same screen without the Subscribe button, for people who already have
// Premium (and for App Review, whose demo account does): their plan, price,
// renewal terms, legal links and a way to manage it. Resolves when closed.
export function showSubscriptionDetails(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!presenter) {
      reject(new Error('The subscription screen is not available. Please restart the app and try again.'));
      return;
    }
    presenter(() => resolve(), 'details');
  });
}
