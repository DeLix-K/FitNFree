import { Alert, Platform } from 'react-native';

// A yes/no question with a named action button ("End link", "Delete"), on the phone or in a browser.
export function confirmAction(title: string, message: string, actionLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: actionLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
