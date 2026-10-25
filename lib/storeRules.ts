import { Platform } from 'react-native';

// Apple (guideline 3.1.1) and Google Play both require digital content and
// features unlocked inside their apps -- courses, guides, custom plans -- to
// be sold through their own billing systems. Those items are still sold
// through Stripe, so on the iOS and Android apps they stay hidden until store
// billing is built for them; the web app can keep selling them. Physical
// goods (merch) and live one-to-one training sessions are exempt and stay.
export const CAN_SELL_DIGITAL_CONTENT = Platform.OS === 'web';

// On the iOS and Android apps only guides that cost nothing are shown. Paid ones stay hidden
// (see above), and a guide bought on the web is not shown either: Apple 3.1.3(b) only allows
// content bought elsewhere if the same content can be bought in the app.
export const SHOW_ONLY_FREE_DIGITAL = !CAN_SELL_DIGITAL_CONTENT;
