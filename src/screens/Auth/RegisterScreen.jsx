import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { supabase } from '../../services/supabase';
import { glow, palette, radii } from '../../theme/ui';

export default function RegisterScreen({ navigation }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [loading, setLoading] = useState(false);

  const calcularEdad = (fecha) => {
    const hoy = new Date();
    const nacimiento = new Date(fecha);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
  };

  const emailEsValido = (value) => /\S+@\S+\.\S+/.test(value);
  const fechaEsValida = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());

  const handleRegister = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedNombre = nombre.trim();

    if (!trimmedNombre || !normalizedEmail || !password || !fechaNacimiento) {
      Alert.alert('Error', 'Completa todos los campos');
      return;
    }

    if (!emailEsValido(normalizedEmail)) {
      Alert.alert('Error', 'Ingresa un email válido');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (!fechaEsValida(fechaNacimiento)) {
      Alert.alert('Error', 'La fecha debe tener formato YYYY-MM-DD');
      return;
    }

    const edad = calcularEdad(fechaNacimiento);
    if (edad < 18) {
      Alert.alert('Acceso denegado', 'Debes ser mayor de 18 años');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (!data.user) {
        Alert.alert('Revisa tu correo', 'Te enviamos un enlace de confirmación para continuar.');
        return;
      }

      const { error: profileError } = await supabase.from('users').insert({
        id: data.user.id,
        email: normalizedEmail,
        nombre: trimmedNombre,
        fecha_nacimiento: fechaNacimiento,
        verificado_edad: true,
      });

      if (profileError) {
        Alert.alert('Error', `Cuenta creada, pero no pudimos guardar el perfil: ${profileError.message}`);
        await supabase.auth.signOut();
        return;
      }

      Alert.alert('¡Listo!', 'Cuenta creada. Entrando...');
    } catch (_error) {
      Alert.alert('Error', 'No pudimos completar el registro. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Crea tu identidad</Text>
      <Text style={styles.subtitle}>Activa tu perfil para entrar al circuito social.</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Nombre"
          placeholderTextColor={palette.textMuted}
          value={nombre}
          onChangeText={setNombre}
          autoCorrect={false}
        />

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

        <TextInput
          style={styles.input}
          placeholder="Fecha nacimiento (YYYY-MM-DD)"
          placeholderTextColor={palette.textMuted}
          value={fechaNacimiento}
          onChangeText={setFechaNacimiento}
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.button, (loading || !nombre.trim() || !email.trim() || !password || !fechaNacimiento) && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading || !nombre.trim() || !email.trim() || !password || !fechaNacimiento}
        >
          <Text style={styles.buttonText}>{loading ? 'Creando...' : 'Activar perfil'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Ya tengo cuenta</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: palette.bg, justifyContent: 'center', padding: 24 },
  title: { fontSize: 36, fontWeight: '800', color: palette.text, marginBottom: 6 },
  subtitle: { color: palette.textMuted, marginBottom: 20, fontSize: 14, lineHeight: 20 },
  form: {
    backgroundColor: palette.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
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
    marginBottom: 14,
    ...glow,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: palette.secondary, textAlign: 'center', fontSize: 14, fontWeight: '600' },
});