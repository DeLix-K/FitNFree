import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import AppShell, { type Tab } from './components/AppShell';
import { useAuth } from './hooks/useAuth';
import { CartProvider } from './lib/cartContext';
import { exchangeOuraCode } from './lib/oura';
import { supabase } from './lib/supabase';
import AuthScreen from './screens/AuthScreen';
import CoachScreen from './screens/CoachScreen';
import DashboardScreen from './screens/DashboardScreen';
import EquipmentScanScreen from './screens/EquipmentScanScreen';
import ExerciseListScreen from './screens/ExerciseListScreen';
import FormCheckScreen from './screens/FormCheckScreen';
import HistoryScreen from './screens/HistoryScreen';
import ManageVideosScreen from './screens/ManageVideosScreen';
import MoreScreen from './screens/MoreScreen';
import NutritionScreen from './screens/NutritionScreen';
import PlansHubScreen from './screens/PlansHubScreen';
import ProfileScreen from './screens/ProfileScreen';
import ProgressScreen from './screens/ProgressScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import ShopScreen from './screens/ShopScreen';
import TrainerDashboardScreen from './screens/TrainerDashboardScreen';
import WearablesScreen from './screens/WearablesScreen';
import WellnessHubScreen from './screens/WellnessHubScreen';

export default function App() {
  const { session, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Detects the redirect back from a "reset password" email link — this app
  // has detectSessionInUrl: false (to avoid clashing with the Oura callback
  // below), so the recovery link has to be parsed and exchanged manually.
  // Supabase's default (uncustomized) email template lands on this URL with
  // #access_token=&refresh_token=&type=recovery in the hash; some setups use
  // ?token_hash=&type=recovery in the query string instead, so both are
  // handled. Computed synchronously on first render so a recovery visit
  // shows a spinner instead of flashing the normal login screen first.
  const [passwordRecovery, setPasswordRecovery] = useState(() => {
    if (Platform.OS !== 'web') return false;
    return (
      window.location.hash.includes('type=recovery') ||
      window.location.search.includes('type=recovery')
    );
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !passwordRecovery) return;

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const queryParams = new URLSearchParams(window.location.search);
    const tokenHash = queryParams.get('token_hash');

    window.history.replaceState({}, '', window.location.pathname);

    const exchange = accessToken && refreshToken
      ? supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      : tokenHash
        ? supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        : Promise.resolve({ error: new Error('Missing recovery token.') });

    exchange.then(({ error }) => {
      if (error) setPasswordRecovery(false);
    });
  }, [passwordRecovery]);

  // Handles the redirect back from Oura's OAuth consent page. Oura
  // redirects to the app's root URL with ?code=&state=, regardless of which
  // tab was active before the user left — so this runs at the top level,
  // not inside WearablesScreen, and switches to that tab once handled.
  useEffect(() => {
    if (Platform.OS !== 'web' || !session) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const deniedError = params.get('error');

    if (!code && !deniedError) return;

    const expectedState = window.sessionStorage.getItem('oura_oauth_state');
    window.history.replaceState({}, '', window.location.pathname);

    if (deniedError || !code || !state || state !== expectedState) {
      window.sessionStorage.removeItem('oura_oauth_state');
      setActiveTab('wearables');
      return;
    }
    window.sessionStorage.removeItem('oura_oauth_state');

    exchangeOuraCode(code, window.location.origin)
      .then(() => setActiveTab('wearables'))
      .catch(() => setActiveTab('wearables'));
  }, [session]);

  if (passwordRecovery) {
    return (
      <>
        <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />
        <StatusBar style="auto" />
      </>
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      {session ? (
        <CartProvider>
        <AppShell activeTab={activeTab} onChangeTab={setActiveTab}>
          {activeTab === 'dashboard' && <DashboardScreen onNavigate={setActiveTab} />}
          {activeTab === 'coach' && <CoachScreen onNavigate={setActiveTab} />}
          {activeTab === 'wearables' && <WearablesScreen onBack={() => setActiveTab('profile')} />}
          {activeTab === 'wellness' && <WellnessHubScreen />}
          {activeTab === 'exercises' && <ExerciseListScreen onNavigate={setActiveTab} />}
          {activeTab === 'plans' && <PlansHubScreen session={session} />}
          {activeTab === 'outdoor' && <PlansHubScreen session={session} initialSegment="outdoor" />}
          {activeTab === 'scan' && <EquipmentScanScreen onBack={() => setActiveTab('exercises')} />}
          {activeTab === 'formCheck' && <FormCheckScreen onBack={() => setActiveTab('coach')} />}
          {activeTab === 'nutrition' && <NutritionScreen onNavigate={setActiveTab} />}
          {activeTab === 'progress' && <ProgressScreen />}
          {activeTab === 'shop' && <ShopScreen />}
          {activeTab === 'trainerDashboard' && <TrainerDashboardScreen />}
          {activeTab === 'history' && <HistoryScreen onBack={() => setActiveTab('profile')} />}
          {activeTab === 'profile' && <ProfileScreen onNavigate={setActiveTab} />}
          {activeTab === 'videos' && <ManageVideosScreen />}
          {activeTab === 'more' && <MoreScreen session={session} onNavigate={setActiveTab} />}
        </AppShell>
        </CartProvider>
      ) : (
        <AuthScreen />
      )}
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
