import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MainMenu from '../../components/MainMenu';
import { supabase } from '../../services/supabase';
import { glow, palette, radii } from '../../theme/ui';

export default function SettingsScreen({ navigation }) {
  const cerrarSesion = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.title}>Configuracion</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Cuenta</Text>
          <Text style={styles.value}>Gestiona sesion y preferencias</Text>
          <TouchableOpacity style={styles.logout} onPress={cerrarSesion}>
            <Text style={styles.logoutText}>Cerrar sesion</Text>
          </TouchableOpacity>
        </View>
      </View>
      <MainMenu navigation={navigation} active="Settings" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  title: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 20,
  },
  card: {
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    padding: 20,
  },
  label: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 8,
  },
  value: {
    color: palette.textMuted,
    marginBottom: 16,
    fontSize: 14,
  },
  logout: {
    backgroundColor: palette.danger,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    ...glow,
  },
  logoutText: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 15,
  },
});
