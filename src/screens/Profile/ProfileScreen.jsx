import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Image, ScrollView, Alert, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';
import { useStats } from '../../hooks/useStats';

export default function ProfileScreen({ navigation }) {
  const { palette } = useTema();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [fotos, setFotos] = useState([]);
  const [userId, setUserId] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { stats } = useStats(userId);

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
      setUserId(user.id);
      const [{ data: profileData }, { data: fotosData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('fotos_perfil').select('*').eq('user_id', user.id)
          .order('created_at', { ascending: false }),
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
      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id);
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={cambiarAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
            <View style={styles.avatarWrapper}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={[styles.avatar, { borderColor: palette.primary }]}
                />
              ) : (
                <View style={[
                  styles.avatarPlaceholder,
                  { borderColor: palette.primary, backgroundColor: palette.primary + '22' }
                ]}>
                  <Text style={[styles.avatarInitial, { color: palette.primary }]}>
                    {profile?.nombre?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={[styles.avatarBadge, { backgroundColor: palette.primary, borderColor: palette.bg }]}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera-outline" size={14} color="#fff" />
                }
              </View>
            </View>
          </TouchableOpacity>

          <Text style={styles.nombre}>{profile?.nombre || 'Usuario'}</Text>
          {edad !== null && (
            <Text style={[styles.edad, { color: palette.secondary }]}>{edad} años</Text>
          )}
          <Text style={styles.emailText}>{email}</Text>

          {/* Badge verificación */}
          <View style={[styles.nivelBadge, {
            backgroundColor: profile?.documento_verificado ? '#0a2a1a' : palette.panelSoft,
            borderColor: profile?.documento_verificado ? '#22d3ee' : palette.border,
          }]}>
            <Ionicons
              name={profile?.documento_verificado ? 'shield-checkmark' : 'shield-outline'}
              size={14}
              color={profile?.documento_verificado ? '#22d3ee' : palette.textMuted}
            />
            <Text style={[
              styles.nivelText,
              { color: profile?.documento_verificado ? '#22d3ee' : palette.textMuted }
            ]}>
              {profile?.documento_verificado ? 'Identidad verificada' : 'Sin verificar identidad'}
            </Text>
          </View>

          {/* Stats reales */}
          <View style={[styles.statsRow, { borderColor: palette.border }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: palette.primary }]}>{stats.fotos}</Text>
              <Text style={styles.statLabel}>Fotos</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: palette.primary }]}>{stats.matches}</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: palette.primary }]}>{stats.votosRecibidos}</Text>
              <Text style={styles.statLabel}>Smash</Text>
            </View>
          </View>
        </View>

        {/* Acciones */}
        <View style={styles.accionesRow}>
          <TouchableOpacity
            style={[styles.accionBtn, { borderColor: palette.primary, flex: 2 }]}
            onPress={() => navigation.navigate('UploadPhoto')}
            activeOpacity={0.7}
          >
            <Ionicons name="camera-outline" size={18} color={palette.primary} />
            <Text style={[styles.accionBtnText, { color: palette.primary }]}>Subir foto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.accionBtn, { borderColor: palette.border, flex: 1 }]}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={18} color={palette.textMuted} />
            <Text style={[styles.accionBtnText, { color: palette.textMuted }]}>Ajustes</Text>
          </TouchableOpacity>
        </View>

        {/* Grid fotos */}
        {fotos.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="images-outline" size={48} color={palette.textMuted} />
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
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: foto.url }} style={styles.gridImage} />
                  {foto.precio > 0 && (
                    <View style={[styles.gridPriceBadge, { backgroundColor: palette.primary }]}>
                      <Ionicons name="pricetag" size={10} color="#fff" />
                      <Text style={styles.gridPriceText}>${foto.precio}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>Mantén presionada una foto para eliminarla</Text>
          </>
        )}

        {/* Info de cuenta */}
        <View style={[styles.infoCard, { borderColor: palette.border }]}>
          <Text style={styles.infoTitle}>Información de cuenta</Text>
          <View style={styles.infoRow}>
            <View style={styles.infoLabelRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={palette.textMuted} />
              <Text style={styles.infoLabel}>Edad verificada</Text>
            </View>
            <Text style={styles.infoValue}>{profile?.verificado_edad ? '✅ Sí' : '❌ No'}</Text>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoLabelRow}>
              <Ionicons name="document-text-outline" size={16} color={palette.textMuted} />
              <Text style={styles.infoLabel}>Términos aceptados</Text>
            </View>
            <Text style={styles.infoValue}>{profile?.acepto_terminos ? '✅ Sí' : '❌ No'}</Text>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoLabelRow}>
              <Ionicons name="card-outline" size={16} color={palette.textMuted} />
              <Text style={styles.infoLabel}>Documento verificado</Text>
            </View>
            <Text style={styles.infoValue}>{profile?.documento_verificado ? '✅ Sí' : '❌ No'}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoLabelRow}>
              <Ionicons name="calendar-outline" size={16} color={palette.textMuted} />
              <Text style={styles.infoLabel}>Nacimiento</Text>
            </View>
            <Text style={styles.infoValue}>{profile?.fecha_nacimiento || '—'}</Text>
          </View>
        </View>

        {/* Banner verificar identidad */}
        {!profile?.documento_verificado && (
          <TouchableOpacity
            style={[styles.verificarBtn, {
              borderColor: palette.primary,
              backgroundColor: palette.primary + '15'
            }]}
            onPress={() => Alert.alert('Próximamente', 'La verificación de identidad estará disponible pronto.')}
            activeOpacity={0.7}
          >
            <Ionicons name="id-card-outline" size={20} color={palette.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.verificarTitle, { color: palette.primary }]}>
                Verificar mi identidad
              </Text>
              <Text style={styles.verificarSub}>
                Necesario para acceder a funciones para adultos
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.primary} />
          </TouchableOpacity>
        )}

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
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 40, fontWeight: '800' },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    borderRadius: 14, width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  nombre: { fontSize: 26, fontWeight: '800', color: palette.text, marginBottom: 2 },
  edad: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  emailText: { fontSize: 13, color: palette.textMuted, marginBottom: 10 },

  nivelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: radii.pill,
    paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16,
  },
  nivelText: { fontSize: 12, fontWeight: '600' },

  statsRow: {
    flexDirection: 'row', backgroundColor: palette.panel,
    borderRadius: radii.lg, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 20,
    width: '100%', justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: palette.textMuted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: palette.border },

  accionesRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  accionBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: radii.md, padding: 12,
  },
  accionBtnText: { fontWeight: '700', fontSize: 14 },

  sectionTitle: { color: palette.text, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  gridItem: { width: '32%', aspectRatio: 1, borderRadius: radii.sm, overflow: 'hidden' },
  gridImage: { width: '100%', height: '100%' },
  gridPriceBadge: {
    position: 'absolute', top: 4, right: 4,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  gridPriceText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  hint: { color: palette.textMuted, fontSize: 11, textAlign: 'center', marginBottom: 20 },

  emptyBox: {
    alignItems: 'center', padding: 32, gap: 8,
    backgroundColor: palette.panel, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.border, marginBottom: 20,
  },
  emptyText: { color: palette.text, fontSize: 16, fontWeight: '700' },
  emptySubtext: { color: palette.textMuted, fontSize: 13, textAlign: 'center' },

  infoCard: {
    backgroundColor: palette.panel, borderRadius: radii.lg,
    borderWidth: 1, padding: 16, marginBottom: 12,
  },
  infoTitle: { color: palette.text, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  infoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoLabel: { color: palette.textMuted, fontSize: 13 },
  infoValue: { color: palette.text, fontSize: 13, fontWeight: '600' },

  verificarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderWidth: 1.5, borderRadius: radii.lg, marginBottom: 12,
  },
  verificarTitle: { fontSize: 14, fontWeight: '700' },
  verificarSub: { fontSize: 12, color: palette.textMuted, marginTop: 2 },
});