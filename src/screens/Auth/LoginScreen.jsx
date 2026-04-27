import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { supabase } from '../../services/supabase';
import { glow, palette, radii } from '../../theme/ui';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      Alert.alert('Campos vacíos', 'Completa email y contraseña');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        if (error.message.includes('Invalid login')) {
          Alert.alert('Credenciales incorrectas', 'Email o contraseña equivocados.');
        } else if (error.message.includes('Email not confirmed')) {
          Alert.alert('Email no confirmado', 'Revisa tu correo y confirma tu cuenta.');
        } else {
          Alert.alert('Error', error.message);
        }
      }
    } catch {
      Alert.alert('Error', 'No pudimos iniciar sesión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>⚡ KLIC</Text>
          </View>
          <Text style={styles.title}>Bienvenido{'\n'}de vuelta</Text>
          <Text style={styles.subtitle}>Conecta, vota y haz match con tu vibra.</Text>
        </View>

        {/* Formulario */}
        <View style={styles.form}>
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            style={styles.input}
            placeholder="tu@email.com"
            placeholderTextColor={palette.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="••••••••"
              placeholderTextColor={palette.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(v => !v)}
            >
              <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Entrando...' : 'Entrar al radar ⚡'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.secondaryText}>Crear nueva cuenta</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Solo para mayores de 18 años 🔞
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: palette.bg },
  hero: { marginBottom: 32 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.panelSoft,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  badgeText: { color: palette.secondary, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { fontSize: 40, fontWeight: '800', color: palette.text, lineHeight: 46, marginBottom: 8 },
  subtitle: { color: palette.textMuted, fontSize: 15, lineHeight: 22 },
  form: {
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    padding: 20,
    marginBottom: 20,
  },
  label: { color: palette.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 },
  input: {
    backgroundColor: palette.panelSoft,
    color: palette.text,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  eyeBtn: {
    backgroundColor: palette.panelSoft,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    padding: 14,
  },
  eyeText: { fontSize: 16 },
  button: {
    backgroundColor: palette.primary,
    borderRadius: radii.md,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    ...glow,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: palette.border },
  dividerText: { color: palette.textMuted, fontSize: 13 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
  },
  secondaryText: { color: palette.text, fontWeight: '600', fontSize: 15 },
  footer: { color: palette.textMuted, fontSize: 12, textAlign: 'center' },
});