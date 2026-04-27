import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../../services/supabase';
import { glow, palette, radii } from '../../theme/ui';

// ── Helpers ──────────────────────────────────────────────────────────
function calcularEdad(fecha) {
  const hoy = new Date();
  const nac = new Date(fecha);
  if (isNaN(nac.getTime())) return null;
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

function validarFecha(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  if (isNaN(d.getTime())) return false;
  if (d > new Date()) return false;
  if (d.getFullYear() < 1900) return false;
  return true;
}

function edadStatus(fecha) {
  if (!fecha || !validarFecha(fecha)) return null;
  const edad = calcularEdad(fecha);
  if (edad === null) return null;
  if (edad >= 18) return { ok: true, mensaje: `${edad} años ✓ Acceso permitido`, color: '#22d3ee' };
  if (edad >= 0) return { ok: false, mensaje: `${edad} años ✗ Debes ser mayor de 18`, color: '#fb7185' };
  return { ok: false, mensaje: 'Fecha inválida', color: '#fb7185' };
}

function formatearFechaAuto(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

// ── Componente ────────────────────────────────────────────────────────
export default function RegisterScreen({ navigation }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [fecha, setFecha] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [aceptaEdad, setAceptaEdad] = useState(false);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const status = edadStatus(fecha);

  const handleFecha = useCallback((raw) => {
    setFecha(formatearFechaAuto(raw));
  }, []);

  const canSubmit =
    nombre.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 6 &&
    confirmar === password &&
    status?.ok === true &&
    aceptaEdad &&
    aceptaTerminos &&
    !loading;

  const handleRegister = async () => {
    const trimNombre = nombre.trim();
    const trimEmail = email.trim().toLowerCase();

    if (!trimNombre || !trimEmail || !password || !confirmar || !fecha) {
      Alert.alert('Campos incompletos', 'Completa todos los campos.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(trimEmail)) {
      Alert.alert('Email inválido', 'Ingresa un correo válido.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Contraseña muy corta', 'Mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmar) {
      Alert.alert('Contraseñas distintas', 'Las contraseñas no coinciden.');
      return;
    }
    if (!validarFecha(fecha)) {
      Alert.alert('Fecha inválida', 'Usa el formato YYYY-MM-DD.');
      return;
    }

    const edad = calcularEdad(fecha);

    if (edad === null || edad < 18) {
      Alert.alert(
        '🔞 Acceso denegado',
        `Klic es exclusivo para mayores de 18 años.\n\nTu edad registrada: ${edad ?? '?'} años.\n\nVuelve cuando seas mayor de edad.`,
        [{ text: 'Entendido', style: 'cancel' }]
      );
      return;
    }

    if (!aceptaEdad || !aceptaTerminos) {
      Alert.alert('Declaraciones pendientes', 'Debes aceptar ambas declaraciones para continuar.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimEmail,
        password,
        options: {
          data: { nombre: trimNombre, fecha_nacimiento: fecha }
        }
      });

      if (error) {
        if (error.message.includes('already registered')) {
          Alert.alert('Email en uso', 'Ya existe una cuenta con ese correo.');
        } else {
          Alert.alert('Error', error.message);
        }
        return;
      }

      if (!data.user) {
        Alert.alert(
          'Confirma tu correo',
          'Te enviamos un enlace de verificación. Revisa tu bandeja de entrada.'
        );
        return;
      }

      const { error: profileError } = await supabase.from('users').insert({
        id: data.user.id,
        email: trimEmail,
        nombre: trimNombre,
        fecha_nacimiento: fecha,
        verificado_edad: true,
        acepto_terminos: true,
        fecha_aceptacion: new Date().toISOString(),
      });

      if (profileError && !profileError.message.includes('duplicate')) {
        console.warn('Perfil no guardado:', profileError.message);
      }

    } catch {
      Alert.alert('Error', 'No pudimos completar el registro. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

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
          <Text style={styles.title}>Activa tu{'\n'}perfil</Text>
          <Text style={styles.subtitle}>Solo para mayores de 18 años. Sin excepciones.</Text>
        </View>

        <View style={styles.form}>

          {/* Nombre */}
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="¿Cómo te llamas?"
            placeholderTextColor={palette.textMuted}
            value={nombre}
            onChangeText={setNombre}
            autoCorrect={false}
          />

          {/* Email */}
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

          {/* Contraseña */}
          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Mínimo 6 caracteres"
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

          {/* Barra de fuerza */}
          <View style={styles.strengthRow}>
            {[1, 2, 3, 4].map(i => (
              <View
                key={i}
                style={[
                  styles.strengthBar,
                  password.length >= i * 2 && {
                    backgroundColor: password.length >= 8 ? '#22d3ee' : palette.primary
                  }
                ]}
              />
            ))}
            <Text style={styles.strengthText}>
              {password.length === 0 ? '' : password.length < 6 ? 'Muy corta' : password.length < 8 ? 'Aceptable' : 'Fuerte ✓'}
            </Text>
          </View>

          {/* Confirmar contraseña */}
          <Text style={styles.label}>Confirmar contraseña</Text>
          <TextInput
            style={[
              styles.input,
              confirmar.length > 0 && {
                borderColor: confirmar === password ? '#22d3ee' : '#fb7185'
              }
            ]}
            placeholder="Repite la contraseña"
            placeholderTextColor={palette.textMuted}
            value={confirmar}
            onChangeText={setConfirmar}
            secureTextEntry={!showPassword}
            autoCorrect={false}
          />
          {confirmar.length > 0 && confirmar !== password && (
            <Text style={styles.errorText}>Las contraseñas no coinciden</Text>
          )}

          {/* Fecha de nacimiento */}
          <Text style={styles.label}>Fecha de nacimiento</Text>
          <TextInput
            style={[styles.input, status && { borderColor: status.color }]}
            placeholder="YYYY-MM-DD  ej: 1999-05-20"
            placeholderTextColor={palette.textMuted}
            value={fecha}
            onChangeText={handleFecha}
            keyboardType="numeric"
            autoCorrect={false}
            maxLength={10}
          />

          {/* Indicador de edad */}
          {status && (
            <View style={[
              styles.ageIndicator,
              { borderColor: status.color, backgroundColor: status.ok ? '#0a2a2a' : '#2a0a0a' }
            ]}>
              <Text style={[styles.ageText, { color: status.color }]}>
                {status.ok ? '✅' : '🔞'} {status.mensaje}
              </Text>
              {!status.ok && (
                <Text style={styles.ageSubtext}>
                  Klic es exclusivo para mayores de 18 años.
                </Text>
              )}
            </View>
          )}

          {/* Checkbox edad */}
          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setAceptaEdad(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, aceptaEdad && styles.checkboxActive]}>
              {aceptaEdad && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.checkText}>
              Declaro bajo mi responsabilidad que soy{' '}
              <Text style={styles.checkBold}>mayor de 18 años</Text>
              . Entiendo que proporcionar información falsa puede resultar en la eliminación permanente de mi cuenta.
            </Text>
          </TouchableOpacity>

          {/* Checkbox términos */}
          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setAceptaTerminos(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, aceptaTerminos && styles.checkboxActive]}>
              {aceptaTerminos && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.checkText}>
              Acepto los{' '}
              <Text style={styles.checkLink}>Términos de uso</Text>
              {' '}y la{' '}
              <Text style={styles.checkLink}>Política de privacidad</Text>
              {' '}de Klic.
            </Text>
          </TouchableOpacity>

          {/* Aviso si falta aceptar */}
          {(!aceptaEdad || !aceptaTerminos) && (nombre || email || fecha) ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠️ Debes aceptar ambas declaraciones para continuar.
              </Text>
            </View>
          ) : null}

          {/* Botón */}
          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={!canSubmit}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creando cuenta...' : 'Activar perfil ⚡'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Ya tengo cuenta → Ingresar</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          🔒 Klic verifica tu edad en el registro.{'\n'}No se permite el acceso a menores de 18 años.
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: palette.bg },
  hero: { marginBottom: 28, paddingTop: 40 },
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
  subtitle: { color: palette.textMuted, fontSize: 14, lineHeight: 20 },
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
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  eyeBtn: {
    backgroundColor: palette.panelSoft,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    padding: 14,
  },
  eyeText: { fontSize: 16 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: palette.border },
  strengthText: { color: palette.textMuted, fontSize: 11, marginLeft: 4 },
  errorText: { color: '#fb7185', fontSize: 12, marginTop: -12, marginBottom: 10 },
  ageIndicator: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 16,
  },
  ageText: { fontSize: 14, fontWeight: '700' },
  ageSubtext: { color: palette.textMuted, fontSize: 12, marginTop: 4 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
    padding: 12,
    backgroundColor: palette.panelSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  checkText: { flex: 1, color: palette.textMuted, fontSize: 12, lineHeight: 18 },
  checkBold: { color: palette.text, fontWeight: '700' },
  checkLink: { color: palette.secondary, fontWeight: '600' },
  warningBox: {
    backgroundColor: '#2a1a00',
    borderWidth: 1,
    borderColor: '#fb7185',
    borderRadius: radii.md,
    padding: 10,
    marginBottom: 12,
  },
  warningText: { color: '#fb7185', fontSize: 12, fontWeight: '600' },
  button: {
    backgroundColor: palette.primary,
    borderRadius: radii.md,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 4,
    ...glow,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: palette.secondary, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  footer: { color: palette.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingBottom: 24 },
});