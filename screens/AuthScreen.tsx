import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { dark } from '../lib/theme';

// Real photo (Victor Freitas, free under the Pexels License, no attribution
// required) -- first-impression hero background, not a solid white screen.
const AUTH_HERO = require('../assets/photos/auth_hero.jpg');

type Mode = 'signIn' | 'signUp' | 'forgotPassword';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);

    if (mode === 'forgotPassword') {
      if (!email) {
        setError('Please enter your email.');
        return;
      }
      setLoading(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Platform.OS === 'web' ? window.location.origin : undefined,
      });
      setLoading(false);

      if (resetError) {
        setError(resetError.message);
        return;
      }
      setMessage("If an account exists for that email, we've sent a password reset link.");
      return;
    }

    if (!email || !password) {
      setError('Please enter both an email and a password.');
      return;
    }

    if (mode === 'signUp' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { error: authError } =
      mode === 'signUp'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === 'signUp') {
      setMessage('Account created! Check your email to confirm, then log in.');
    }
  };

  const title =
    mode === 'signIn' ? 'Log In' : mode === 'signUp' ? 'Sign Up' : 'Reset Password';
  const buttonLabel =
    mode === 'signIn' ? 'Log In' : mode === 'signUp' ? 'Sign Up' : 'Send Reset Link';

  return (
    <ImageBackground source={AUTH_HERO} style={styles.bg} resizeMode="cover">
      <LinearGradient
        colors={['rgba(10,10,10,0.35)', 'rgba(10,10,10,0.75)', '#0a0a0a']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Text style={styles.title}>FitNFree</Text>
        <Text style={styles.tagline}>Train smarter. See it through.</Text>

        <View style={styles.card}>
          <Text style={styles.subtitle}>{title}</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#8a8a8a"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {mode !== 'forgotPassword' && (
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#8a8a8a"
              secureTextEntry
              autoCapitalize="none"
              importantForAutofill="no"
              value={password}
              onChangeText={setPassword}
            />
          )}

          {error && <Text style={styles.error}>{error}</Text>}
          {message && <Text style={styles.message}>{message}</Text>}

          <Pressable style={styles.button} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#0a0a0a" /> : <Text style={styles.buttonText}>{buttonLabel}</Text>}
          </Pressable>

          {mode === 'signIn' && (
            <Pressable onPress={() => switchMode('forgotPassword')}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          )}

          {mode === 'forgotPassword' ? (
            <Pressable onPress={() => switchMode('signIn')}>
              <Text style={styles.switchText}>Back to log in</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
              <Text style={styles.switchText}>
                {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
    color: dark.text,
  },
  tagline: {
    fontSize: 15,
    textAlign: 'center',
    color: dark.textMuted,
    marginTop: 6,
    marginBottom: 28,
  },
  card: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 20,
    padding: 22,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    color: dark.text,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surfaceElevated,
    color: dark.text,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '700',
  },
  switchText: {
    textAlign: 'center',
    color: dark.accent,
    fontWeight: '600',
    marginTop: 16,
  },
  forgotText: {
    textAlign: 'center',
    color: dark.textMuted,
    marginTop: 12,
    fontSize: 13,
  },
  error: {
    color: dark.danger,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: dark.accent,
    marginBottom: 12,
    textAlign: 'center',
  },
});
