import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView, Switch, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MainMenu from '../../components/MainMenu';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

export default function SettingsScreen({ navigation }) {
  const { temaActual, setTemaActual, temas, palette } = useTema();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [notificaciones, setNotificaciones] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      setEmail(user.email || '');
      const { data } = await supabase
        .from('users')
        .select('nombre, fecha_nacimiento, verificado_edad, acepto_terminos')
        .eq('id', user.id)
        .maybeSingle();
      setProfile(data);
      setLoading(false);
    };
    cargar();
  }, []);

  const cerrarSesion = async () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          const { error } = await supabase.auth.signOut();
          if (error) {
            Alert.alert('Error', error.message);
            setSigningOut(false);
          }
        }
      }
    ]);
  };

  const eliminarCuenta = () => {
    Alert.alert(
      '⚠️ Eliminar cuenta',
      'Esta acción es permanente. Se eliminarán todos tus datos, fotos y matches.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: () => Alert.alert('Próximamente', 'Esta función estará disponible pronto.')
        }
      ]
    );
  };

  const styles = makeStyles(palette);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Ajustes</Text>

        {/* CUENTA */}
        <Text style={styles.sectionLabel}>CUENTA</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="person-outline" size={18} color={palette.textMuted} />
            <Text style={styles.cardLabel}>Nombre</Text>
            <Text style={styles.cardValue}>{profile?.nombre || '—'}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.cardRow}>
            <Ionicons name="mail-outline" size={18} color={palette.textMuted} />
            <Text style={styles.cardLabel}>Correo</Text>
            <Text style={styles.cardValue} numberOfLines={1}>{email}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.cardRow}>
            <Ionicons name="calendar-outline" size={18} color={palette.textMuted} />
            <Text style={styles.cardLabel}>Nacimiento</Text>
            <Text style={styles.cardValue}>{profile?.fecha_nacimiento || '—'}</Text>
          </View>
        </View>

        {/* VERIFICACIÓN */}
        <Text style={styles.sectionLabel}>VERIFICACIÓN</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={palette.textMuted} />
            <Text style={styles.cardLabel}>Edad verificada</Text>
            <View style={[styles.pill, { backgroundColor: profile?.verificado_edad ? '#0a2a1a' : '#2a0a0a' }]}>
              <Text style={[styles.pillText, { color: profile?.verificado_edad ? '#22d3ee' : '#fb7185' }]}>
                {profile?.verificado_edad ? '✓ Verificado' : '✗ Sin verificar'}
              </Text>
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.cardRow}>
            <Ionicons name="document-text-outline" size={18} color={palette.textMuted} />
            <Text style={styles.cardLabel}>Términos</Text>
            <View style={[styles.pill, { backgroundColor: profile?.acepto_terminos ? '#0a2a1a' : '#2a0a0a' }]}>
              <Text style={[styles.pillText, { color: profile?.acepto_terminos ? '#22d3ee' : '#fb7185' }]}>
                {profile?.acepto_terminos ? '✓ Aceptados' : '✗ Pendiente'}
              </Text>
            </View>
          </View>
        </View>

        {/* APARIENCIA */}
        <Text style={styles.sectionLabel}>APARIENCIA</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="color-palette-outline" size={18} color={palette.textMuted} />
            <Text style={styles.cardLabel}>Color de la app</Text>
          </View>
          <View style={styles.temasGrid}>
            {Object.entries(temas).map(([key, tema]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.temaBtn,
                  { borderColor: temaActual === key ? tema.primary : palette.border },
                  temaActual === key && { backgroundColor: tema.primary + '22' }
                ]}
                onPress={() => setTemaActual(key)}
                activeOpacity={0.7}
              >
                <View style={[styles.temaCircle, { backgroundColor: tema.primary }]} />
                <Text style={styles.temaNombre}>{tema.emoji} {tema.nombre}</Text>
                {temaActual === key
                  ? <Ionicons name="checkmark-circle" size={18} color={tema.primary} />
                  : <Ionicons name="ellipse-outline" size={18} color={palette.border} />
                }
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* PREFERENCIAS */}
        <Text style={styles.sectionLabel}>PREFERENCIAS</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="notifications-outline" size={18} color={palette.textMuted} />
            <Text style={styles.cardLabel}>Notificaciones</Text>
            <Switch
              value={notificaciones}
              onValueChange={setNotificaciones}
              trackColor={{ false: palette.border, true: palette.primary }}
              thumbColor={palette.text}
            />
          </View>
        </View>

        {/* PERFIL */}
        <Text style={styles.sectionLabel}>PERFIL</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.cardBtn}
            onPress={() => navigation.navigate('UploadPhoto')}
            activeOpacity={0.7}
          >
            <Ionicons name="camera-outline" size={18} color={palette.primary} />
            <Text style={styles.cardBtnText}>Subir nueva foto</Text>
            <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity
            style={styles.cardBtn}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={18} color={palette.primary} />
            <Text style={styles.cardBtnText}>Ver mi perfil</Text>
            <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
          </TouchableOpacity>
        </View>

        {/* SESIÓN */}
        <Text style={styles.sectionLabel}>SESIÓN</Text>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={cerrarSesion}
          disabled={signingOut}
          activeOpacity={0.7}
        >
          {signingOut ? (
            <ActivityIndicator color={palette.text} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={palette.text} />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ZONA DE PELIGRO */}
        <Text style={styles.sectionLabel}>ZONA DE PELIGRO</Text>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={eliminarCuenta}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color="#fb7185" />
          <Text style={styles.deleteText}>Eliminar cuenta permanentemente</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Klic v1.0.0 · Solo +18</Text>
        <View style={{ height: 20 }} />
      </ScrollView>

      <MainMenu navigation={navigation} active="Settings" />
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg, justifyContent: 'space-between' },
  center: { flex: 1, backgroundColor: palette.bg, justifyContent: 'center', alignItems: 'center' },
  container: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  title: { fontSize: 34, fontWeight: '800', color: palette.text, marginBottom: 24 },

  sectionLabel: {
    color: palette.textMuted, fontSize: 11,
    fontWeight: '700', letterSpacing: 1.2,
    marginBottom: 8, marginTop: 20, marginLeft: 4,
  },
  card: {
    backgroundColor: palette.panel,
    borderRadius: radii.lg, borderWidth: 1,
    borderColor: palette.border, overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  cardLabel: { flex: 1, color: palette.textMuted, fontSize: 14 },
  cardValue: { color: palette.text, fontSize: 14, fontWeight: '600', maxWidth: 160, textAlign: 'right' },
  cardBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  cardBtnText: { flex: 1, color: palette.text, fontSize: 14, fontWeight: '600' },
  separator: { height: 1, backgroundColor: palette.border, marginHorizontal: 16 },

  pill: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '700' },

  temasGrid: { padding: 12, gap: 8 },
  temaBtn: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: radii.md,
    borderWidth: 1.5, gap: 10,
  },
  temaCircle: { width: 18, height: 18, borderRadius: 9 },
  temaNombre: { flex: 1, color: palette.text, fontSize: 14, fontWeight: '600' },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    backgroundColor: palette.panelSoft,
    borderRadius: radii.lg, borderWidth: 1,
    borderColor: palette.border, padding: 16,
  },
  logoutText: { color: palette.text, fontWeight: '700', fontSize: 15 },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    backgroundColor: '#1a0505',
    borderRadius: radii.lg, borderWidth: 1,
    borderColor: '#fb7185', padding: 16,
  },
  deleteText: { color: '#fb7185', fontWeight: '700', fontSize: 14 },

  version: { color: palette.textMuted, fontSize: 11, textAlign: 'center', marginTop: 24 },
});