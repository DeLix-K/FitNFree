import { Platform } from 'react-native';

// Apple (guideline 3.1.1) and Google Play both require digital content and
// features unlocked inside their apps to be sold through their own billing
// systems. Courses and guides are therefore not sold per item at all any more:
// they are free starters or included with the Premium subscription, which
// already goes through Apple / Google billing on mobile (see iap.ts).
//
// What is still sold outside store billing -- one-off custom trainer plans and
// session packages -- stays hidden on the iOS and Android apps, and only the web
// app can sell it. Physical goods (merch) and live one-to-one training sessions
// are exempt and stay on every platform.
export const CAN_SELL_DIGITAL_CONTENT = Platform.OS === 'web';
