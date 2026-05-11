import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';
import { useStats } from '../../hooks/useStats';
import { enviarSolicitudAmistad } from '../../utils/amigos';
import KlicCoin from '../../components/KlicCoin';

export default function PublicProfileScreen({ route, navigation }) {
  const { userId } = route.params || {};
  const { palette } = useTema();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [siguiendo, setSiguiendo] = useState(false);
  const [amigoEstado, setAmigoEstado] = useState(null); // 'aceptado' | 'pendiente' | 'recibida' | null
  const [busySocial, setBusySocial] = useState(false);

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

  const cargarRelacion = useCallback(async (me, target) => {
    if (!me || !target || me === target) {
      setSiguiendo(false);
      setAmigoEstado(null);
      return;
    }

    const uLow = me < target ? me : target;
    const uHigh = me < target ? target : me;

    const [{ data: seg }, { data: ami }] = await Promise.all([
      supabase
        .from('seguidores')
        .select('id')
        .eq('seguidor_id', me)
        .eq('seguido_id', target)
        .maybeSingle(),
      supabase
        .from('amigos')
        .select('id, estado, solicitante_id')
        .eq('user1_id', uLow)
        .eq('user2_id', uHigh)
        .maybeSingle(),
    ]);

    setSiguiendo(!!seg);

    if (!ami) {
      setAmigoEstado(null);
      return;
    }
    if (ami.estado === 'aceptado') setAmigoEstado('aceptado');
    else if (ami.estado === 'pendiente') {
      setAmigoEstado(ami.solicitante_id === me ? 'pendiente' : 'recibida');
    } else setAmigoEstado(null);
  }, []);

  const cargar = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      if (user?.id === userId) {
        setLoading(false);
        navigation.replace('Profile');
        return;
      }

      const [{ data: profileData }, { data: fotosData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).maybeSingle(),
        supabase
          .from('fotos_perfil')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ]);

      setProfile(profileData || null);
      setFotos(fotosData || []);

      if (user?.id) await cargarRelacion(user.id, userId);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, navigation, cargarRelacion]);

  useEffect(() => {
    setLoading(true);
    cargar();
  }, [cargar]);

  const onRefresh = () => {
    setRefreshing(true);
    cargar();
  };

  const toggleSeguir = async () => {
    if (!currentUser?.id) {
      Alert.alert('Sesión', 'Inicia sesión para seguir usuarios');
      return;
    }
    setBusySocial(true);
    try {
      if (siguiendo) {
        const { error } = await supabase
          .from('seguidores')
          .delete()
          .eq('seguidor_id', currentUser.id)
          .eq('seguido_id', userId);
        if (error) throw error;
        setSiguiendo(false);
      } else {
        const { error } = await supabase.from('seguidores').insert({
          seguidor_id: currentUser.id,
          seguido_id: userId,
        });
        if (error) throw error;
        setSiguiendo(true);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo actualizar');
    } finally {
      setBusySocial(false);
    }
  };

  const onSolicitarAmistad = async () => {
    if (!currentUser?.id) return;
    setBusySocial(true);
    try {
      const res = await enviarSolicitudAmistad(supabase, currentUser.id, userId);
      if (!res.ok) {
        Alert.alert('Amigos', res.message);
        return;
      }
      Alert.alert('Listo', res.action === 'resent' ? 'Solicitud reenviada' : 'Solicitud enviada');
      await cargarRelacion(currentUser.id, userId);
    } finally {
      setBusySocial(false);
    }
  };

  const styles = makeStyles(palette);
  const edad = calcularEdad(profile?.fecha_nacimiento);

  if (!userId) {
    return (
      <View style={styles.center}>
        <Text style={{ color: palette.textMuted }}>Perfil no disponible</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Ionicons name="person-outline" size={48} color={palette.textMuted} />
        <Text style={[styles.emptyTitle, { color: palette.text }]}>Usuario no encontrado</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={{ color: palette.primary, fontWeight: '700' }}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const esMio = currentUser?.id === userId;

  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: palette.text }]} numberOfLines={1}>
          {profile.nombre || 'Perfil'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.avatarWrapper}>
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={[styles.avatar, { borderColor: palette.primary }]}
              />
            ) : (
              <View
                style={[
                  styles.avatarPlaceholder,
                  { borderColor: palette.primary, backgroundColor: palette.primary + '22' },
                ]}
              >
                <Text style={[styles.avatarInitial, { color: palette.primary }]}>
                  {profile.nombre?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.nombre}>{profile.nombre || 'Usuario'}</Text>
          {edad !== null && (
            <Text style={[styles.edad, { color: palette.secondary }]}>{edad} años</Text>
          )}
          {profile.alias ? (
            <Text style={[styles.alias, { color: palette.textMuted }]}>@{profile.alias}</Text>
          ) : null}
          {profile.descripcion ? (
            <Text style={[styles.descripcion, { color: palette.textMuted }]}>
              {profile.descripcion}
            </Text>
          ) : null}

          {!esMio && currentUser ? (
            <View style={styles.accionesRow}>
              <TouchableOpacity
                style={[
                  styles.accionBtn,
                  {
                    borderColor: palette.primary,
                    backgroundColor: siguiendo ? palette.panelSoft : palette.primary,
                  },
                ]}
                onPress={toggleSeguir}
                disabled={busySocial}
              >
                <Ionicons
                  name={siguiendo ? 'checkmark' : 'person-add-outline'}
                  size={18}
                  color={siguiendo ? palette.textMuted : '#fff'}
                />
                <Text
                  style={[
                    styles.accionBtnText,
                    { color: siguiendo ? palette.textMuted : '#fff' },
                  ]}
                >
                  {siguiendo ? 'Siguiendo' : 'Seguir'}
                </Text>
              </TouchableOpacity>

              {amigoEstado === 'aceptado' ? (
                <View style={[styles.accionBtn, styles.accionMuted, { borderColor: palette.border }]}>
                  <Ionicons name="people" size={18} color={palette.secondary} />
                  <Text style={[styles.accionBtnText, { color: palette.secondary }]}>Amigos</Text>
                </View>
              ) : amigoEstado === 'pendiente' ? (
                <View style={[styles.accionBtn, styles.accionMuted, { borderColor: palette.border }]}>
                  <Ionicons name="time-outline" size={18} color={palette.textMuted} />
                  <Text style={[styles.accionBtnText, { color: palette.textMuted }]}>Solicitud enviada</Text>
                </View>
              ) : amigoEstado === 'recibida' ? (
                <TouchableOpacity
                  style={[styles.accionBtn, { borderColor: palette.secondary, backgroundColor: palette.secondary + '18' }]}
                  onPress={() => {
                    Alert.alert(
                      'Solicitud pendiente',
                      'Tienes una invitación de esta persona. Ve a Social → pestaña Amigos para aceptarla.',
                    );
                  }}
                >
                  <Ionicons name="mail-unread-outline" size={18} color={palette.secondary} />
                  <Text style={[styles.accionBtnText, { color: palette.secondary }]}>Te invitó</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.accionBtn, { borderColor: palette.secondary, backgroundColor: palette.secondary + '12' }]}
                  onPress={onSolicitarAmistad}
                  disabled={busySocial}
                >
                  <Ionicons name="hand-left-outline" size={18} color={palette.secondary} />
                  <Text style={[styles.accionBtnText, { color: palette.secondary }]}>Ser amigos</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

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

        {fotos.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: palette.border, backgroundColor: palette.panel }]}>
            <Ionicons name="images-outline" size={40} color={palette.textMuted} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>Sin fotos públicas</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Fotos</Text>
            <View style={styles.grid}>
              {fotos.map((foto) => (
                <View key={foto.id} style={styles.gridItem}>
                  <Image source={{ uri: foto.url }} style={styles.gridImage} />
                  {foto.precio > 0 && (
                    <View style={styles.gridPriceBadge}>
                      <KlicCoin size={12} />
                      <Text style={styles.gridPriceText}>{Math.round(foto.precio * 100)}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (palette) =>
  StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: palette.bg },
    center: { flex: 1, backgroundColor: palette.bg, justifyContent: 'center', alignItems: 'center', padding: 24 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingTop: 52,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    backBtn: { padding: 4 },
    topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
    container: { paddingHorizontal: 20, paddingBottom: 24 },
    header: { alignItems: 'center', marginTop: 20, marginBottom: 16 },
    avatarWrapper: { marginBottom: 12 },
    avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3 },
    avatarPlaceholder: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { fontSize: 40, fontWeight: '800' },
    nombre: { fontSize: 26, fontWeight: '800', color: palette.text, marginBottom: 2 },
    edad: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    alias: { fontSize: 13, marginBottom: 8 },
    descripcion: { fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16, marginBottom: 12 },
    accionesRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' },
    accionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radii.pill,
      borderWidth: 1.5,
    },
    accionMuted: { backgroundColor: palette.panelSoft },
    accionBtnText: { fontWeight: '700', fontSize: 13 },
    statsRow: {
      flexDirection: 'row',
      backgroundColor: palette.panel,
      borderRadius: radii.lg,
      borderWidth: 1,
      paddingVertical: 14,
      paddingHorizontal: 20,
      width: '100%',
      justifyContent: 'space-around',
    },
    statItem: { alignItems: 'center' },
    statNum: { fontSize: 22, fontWeight: '800' },
    statLabel: { fontSize: 11, color: palette.textMuted, marginTop: 2 },
    statDivider: { width: 1, backgroundColor: palette.border },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    gridItem: { width: '32%', aspectRatio: 1, borderRadius: radii.sm, overflow: 'hidden' },
    gridImage: { width: '100%', height: '100%' },
    gridPriceBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    gridPriceText: { color: '#fff', fontSize: 9, fontWeight: '800', marginLeft: 4 },
    emptyBox: {
      alignItems: 'center',
      padding: 28,
      gap: 8,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginTop: 8,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700' },
    backLink: { marginTop: 16 },
  });
