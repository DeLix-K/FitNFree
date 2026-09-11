import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import App from './App';

// SafeAreaProvider wraps the true root (not just AppShell) so every screen
// -- including AuthScreen and the loading spinner, before a session exists
// -- can read real device insets via useSafeAreaInsets() if it ever needs
// to, not just the ones rendered inside AppShell.
function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
