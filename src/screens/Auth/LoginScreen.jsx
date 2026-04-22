import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../../services/supabase';
import { glow, palette, radii } from '../../theme/ui';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      Alert.alert('Error', 'Completa email y contraseña');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      // El App root cambia de stack automáticamente cuando existe sesión.
    } catch (_error) {
      Alert.alert('Error', 'No pudimos iniciar sesión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.tag}>SOCIAL GAME</Text>
        <Text style={styles.title}>RedSocial</Text>
        <Text style={styles.subtitle}>Conecta, vota y haz match con tu vibra.</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={palette.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={palette.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.button, (!email.trim() || !password || loading) && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading || !email.trim() || !password}
        >
          <Text style={styles.buttonText}>{loading ? 'Entrando...' : 'Entrar al radar'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.link}>No tienes cuenta? Crear perfil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg, justifyContent: 'center', padding: 24 },
  hero: { marginBottom: 28 },
  tag: {
    color: palette.secondary,
    fontSize: 12,
    letterSpacing: 1.3,
    fontWeight: '700',
    marginBottom: 8,
  },
  title: { fontSize: 42, fontWeight: '800', color: palette.text, marginBottom: 6 },
  subtitle: { color: palette.textMuted, fontSize: 15, lineHeight: 22, maxWidth: 280 },
  form: {
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    padding: 18,
  },
  input: {
    backgroundColor: palette.panelSoft,
    color: palette.text,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: palette.primary,
    borderRadius: radii.md,
    padding: 16,
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 14,
    ...glow,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: palette.secondary, textAlign: 'center', fontSize: 14, fontWeight: '600' },
});