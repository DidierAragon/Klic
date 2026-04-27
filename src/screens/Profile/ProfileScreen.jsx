import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Image, ScrollView, Alert, RefreshControl
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

export default function ProfileScreen({ navigation }) {
  const { palette, glow } = useTema();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [fotos, setFotos] = useState([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const calcularEdad = (fecha) => {
    if (!fecha) return null;
    const hoy = new Date();
    const nac = new Date(fecha);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  };

  const cargarPerfil = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      setEmail(user.email || '');
      const [{ data: profileData }, { data: fotosData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('fotos_perfil').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);
      setProfile(profileData || null);
      setFotos(fotosData || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargarPerfil(); }, [cargarPerfil]);

  const onRefresh = () => { setRefreshing(true); cargarPerfil(); };

  const cambiarAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled) return;
    setUploadingAvatar(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const fileName = `avatars/${user.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('fotos')
        .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
      const { error: updateError } = await supabase
        .from('users').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (updateError) throw updateError;
      setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
      Alert.alert('✓ Listo', 'Foto de perfil actualizada');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const eliminarFoto = async (fotoId) => {
    Alert.alert('Eliminar foto', '¿Seguro que quieres eliminarla?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('fotos_perfil').delete().eq('id', fotoId);
          if (error) Alert.alert('Error', error.message);
          else setFotos(prev => prev.filter(f => f.id !== fotoId));
        }
      }
    ]);
  };

  const styles = makeStyles(palette);
  const edad = calcularEdad(profile?.fecha_nacimiento);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={cambiarAvatar} disabled={uploadingAvatar}>
            <View style={styles.avatarWrapper}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={[styles.avatar, { borderColor: palette.primary }]} />
              ) : (
                <View style={[styles.avatarPlaceholder, { borderColor: palette.primary }]}>
                  <Text style={[styles.avatarInitial, { color: palette.primary }]}>
                    {profile?.nombre?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={[styles.avatarBadge, { backgroundColor: palette.primary }]}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color={palette.text} />
                  : <Text style={styles.avatarBadgeText}>📷</Text>
                }
              </View>
            </View>
          </TouchableOpacity>

          <Text style={styles.nombre}>{profile?.nombre || 'Usuario'}</Text>
          {edad !== null && (
            <Text style={[styles.edad, { color: palette.secondary }]}>{edad} años</Text>
          )}
          <Text style={styles.emailText}>{email}</Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: palette.primary }]}>{fotos.length}</Text>
              <Text style={styles.statLabel}>Fotos</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: palette.primary }]}>—</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: palette.primary }]}>—</Text>
              <Text style={styles.statLabel}>Votos</Text>
            </View>
          </View>
        </View>

        {/* Botón subir foto */}
        <TouchableOpacity
          style={[styles.uploadBtn, { borderColor: palette.primary }]}
          onPress={() => navigation.navigate('UploadPhoto')}
        >
          <Text style={[styles.uploadBtnText, { color: palette.primary }]}>＋ Subir nueva foto</Text>
        </TouchableOpacity>

        {/* Grid de fotos */}
        {fotos.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📷</Text>
            <Text style={styles.emptyText}>Aún no has subido fotos</Text>
            <Text style={styles.emptySubtext}>Sube tu primera foto para aparecer en el feed</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Mis fotos</Text>
            <View style={styles.grid}>
              {fotos.map((foto) => (
                <TouchableOpacity
                  key={foto.id}
                  style={styles.gridItem}
                  onLongPress={() => eliminarFoto(foto.id)}
                >
                  <Image source={{ uri: foto.url }} style={styles.gridImage} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>Mantén presionada una foto para eliminarla</Text>
          </>
        )}

        {/* Info de cuenta */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Información de cuenta</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Edad verificada</Text>
            <Text style={styles.infoValue}>{profile?.verificado_edad ? '✅ Sí' : '❌ No'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Términos aceptados</Text>
            <Text style={styles.infoValue}>{profile?.acepto_terminos ? '✅ Sí' : '❌ No'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Fecha nacimiento</Text>
            <Text style={styles.infoValue}>{profile?.fecha_nacimiento || '—'}</Text>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <MainMenu navigation={navigation} active="Profile" />
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg, justifyContent: 'space-between' },
  center: { flex: 1, backgroundColor: palette.bg, justifyContent: 'center', alignItems: 'center' },
  container: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  header: { alignItems: 'center', marginBottom: 20 },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3 },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: palette.panel,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 40, fontWeight: '800' },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    borderRadius: 12, width: 26, height: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: palette.bg,
  },
  avatarBadgeText: { fontSize: 12 },
  nombre: { fontSize: 26, fontWeight: '800', color: palette.text, marginBottom: 2 },
  edad: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  emailText: { fontSize: 13, color: palette.textMuted, marginBottom: 16 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: palette.panel,
    borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border,
    paddingVertical: 14, paddingHorizontal: 20,
    width: '100%', justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: palette.textMuted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: palette.border },
  uploadBtn: {
    borderWidth: 1, borderRadius: radii.md,
    borderStyle: 'dashed', padding: 14,
    alignItems: 'center', marginBottom: 20,
  },
  uploadBtnText: { fontWeight: '700', fontSize: 15 },
  sectionTitle: { color: palette.text, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  gridItem: { width: '32%', aspectRatio: 1, borderRadius: radii.sm, overflow: 'hidden' },
  gridImage: { width: '100%', height: '100%' },
  hint: { color: palette.textMuted, fontSize: 11, textAlign: 'center', marginBottom: 20 },
  emptyBox: {
    alignItems: 'center', padding: 32,
    backgroundColor: palette.panel,
    borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border,
    marginBottom: 20,
  },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: palette.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptySubtext: { color: palette.textMuted, fontSize: 13, textAlign: 'center' },
  infoCard: {
    backgroundColor: palette.panel, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.border, padding: 16,
  },
  infoTitle: { color: palette.text, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  infoLabel: { color: palette.textMuted, fontSize: 13 },
  infoValue: { color: palette.text, fontSize: 13, fontWeight: '600' },
});