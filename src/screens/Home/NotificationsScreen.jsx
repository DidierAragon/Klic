import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

export default function NotificationsScreen({ navigation }) {
  const { palette } = useTema();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [solicitudes, setSolicitudes] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  const cargar = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: solData }, { data: amistades }, { data: notifData }] = await Promise.all([
        supabase
          .from('amigos')
          .select(`
            id,
            solicitante:solicitante_id(id, nombre, avatar_url)
          `)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .eq('estado', 'pendiente')
          .neq('solicitante_id', user.id),
        supabase
          .from('amigos')
          .select('id')
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .eq('estado', 'aceptado'),
        supabase
          .from('notificaciones')
          .select(`
            id,
            tipo,
            mensaje,
            leido,
            created_at,
            actor:actor_id(nombre, avatar_url)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      setSolicitudes(solData || []);
      setNotificaciones(notifData || []);

      const ids = (amistades || []).map((a) => a.id);
      if (ids.length === 0) {
        setUnreadMsgs(0);
        return;
      }

      const { count } = await supabase
        .from('mensajes_amigos')
        .select('*', { count: 'exact', head: true })
        .in('amistad_id', ids)
        .eq('leido', false)
        .neq('sender_id', user.id);

      setUnreadMsgs(count || 0);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      cargar();
    }, [cargar])
  );

  const aceptar = async (amistadId) => {
    const { error } = await supabase
      .from('amigos')
      .update({ estado: 'aceptado' })
      .eq('id', amistadId);
    if (error) Alert.alert('Error', error.message);
    else {
      setSolicitudes((p) => p.filter((s) => s.id !== amistadId));
      cargar();
    }
  };

  const rechazar = async (amistadId) => {
    const { error } = await supabase
      .from('amigos')
      .update({ estado: 'rechazado' })
      .eq('id', amistadId);
    if (error) Alert.alert('Error', error.message);
    else setSolicitudes((p) => p.filter((s) => s.id !== amistadId));
  };

  const styles = makeStyles(palette);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: palette.text }]}>Notificaciones</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={palette.primary} />
        }
      >
        <TouchableOpacity
          style={[styles.banner, { backgroundColor: palette.panel, borderColor: palette.primary + '44' }]}
          onPress={() => navigation.navigate('Social')}
          activeOpacity={0.85}
        >
          <View style={[styles.bannerIcon, { backgroundColor: palette.primary + '22' }]}>
            <Ionicons name="chatbubbles" size={26} color={palette.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: palette.text }]}>Mensajes y amigos</Text>
            <Text style={[styles.bannerSub, { color: palette.textMuted }]}>
              {unreadMsgs > 0
                ? `Tienes ${unreadMsgs} mensaje${unreadMsgs === 1 ? '' : 's'} sin leer`
                : 'Abre Social para ver tus chats'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={palette.textMuted} />
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
          Solicitudes de amistad
        </Text>

        {solicitudes.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: palette.border, backgroundColor: palette.panel }]}>
            <Ionicons name="notifications-off-outline" size={40} color={palette.textMuted} />
            <Text style={[styles.emptyText, { color: palette.text }]}>No hay solicitudes nuevas</Text>
            <Text style={[styles.emptySub, { color: palette.textMuted }]}>
              Cuando alguien quiera conectar contigo, aparecerá aquí.
            </Text>
          </View>
        ) : (
          solicitudes.map((s) => (
            <View
              key={s.id}
              style={[styles.reqCard, { backgroundColor: palette.panel, borderColor: palette.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.reqName, { color: palette.text }]}>
                  {s.solicitante?.nombre || 'Usuario'}
                </Text>
                <Text style={[styles.reqHint, { color: palette.textMuted }]}>
                  Quiere ser tu amigo en Klic
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.reqBtn, { backgroundColor: palette.primary }]}
                onPress={() => aceptar(s.id)}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reqBtn, { backgroundColor: palette.panelSoft, borderWidth: 1, borderColor: palette.border }]}
                onPress={() => rechazar(s.id)}
              >
                <Ionicons name="close" size={18} color={palette.textMuted} />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Notificaciones generales (como las de propinas de Klic Coins) */}
        <Text style={[styles.sectionLabel, { color: palette.textMuted, marginTop: 28 }]}>
          Novedades y Regalos
        </Text>

        {notificaciones.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: palette.border, backgroundColor: palette.panel }]}>
            <Ionicons name="sparkles-outline" size={40} color={palette.textMuted} />
            <Text style={[styles.emptyText, { color: palette.text }]}>Sin novedades</Text>
            <Text style={[styles.emptySub, { color: palette.textMuted }]}>
              Aquí aparecerán las propinas, regalos e interacciones de tus fans.
            </Text>
          </View>
        ) : (
          notificaciones.map((n) => (
            <View
              key={n.id}
              style={[styles.reqCard, { backgroundColor: palette.panel, borderColor: palette.border, paddingVertical: 16 }]}
            >
              <View style={[styles.bannerIcon, { backgroundColor: palette.primary + '1a', width: 44, height: 44, borderRadius: 22 }]}>
                <Ionicons name="gift" size={22} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reqName, { color: palette.text, fontSize: 14, fontWeight: '600', lineHeight: 18 }]}>
                  {n.mensaje}
                </Text>
                <Text style={[styles.reqHint, { color: palette.textMuted, fontSize: 11, marginTop: 4 }]}>
                  {new Date(n.created_at).toLocaleDateString('es-CO', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </Text>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (palette) =>
  StyleSheet.create({
    wrapper: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingTop: 52,
      paddingBottom: 14,
      borderBottomWidth: 1,
    },
    backBtn: { padding: 8 },
    title: { fontSize: 18, fontWeight: '800' },
    scroll: { padding: 16 },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: 24,
    },
    bannerIcon: {
      width: 52,
      height: 52,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerTitle: { fontSize: 16, fontWeight: '800' },
    bannerSub: { fontSize: 13, marginTop: 4 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    emptyCard: {
      alignItems: 'center',
      padding: 28,
      borderRadius: radii.lg,
      borderWidth: 1,
      gap: 8,
    },
    emptyText: { fontSize: 16, fontWeight: '700' },
    emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
    reqCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginBottom: 10,
    },
    reqName: { fontSize: 15, fontWeight: '700' },
    reqHint: { fontSize: 12, marginTop: 2 },
    reqBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
