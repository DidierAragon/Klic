import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

export default function MatchesScreen({ navigation }) {
  const { palette } = useTema();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const cargarMatches = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      if (!user) return;

      const { data, error } = await supabase
        .from('matches')
        .select(`
          id, created_at,
          user1:user1_id(id, nombre, avatar_url),
          user2:user2_id(id, nombre, avatar_url)
        `)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Para cada match buscar el último mensaje
      const matchesConMensaje = await Promise.all(
        (data || []).map(async (match) => {
          const { data: msgs } = await supabase
            .from('mensajes')
            .select('contenido, created_at, sender_id, leido')
            .eq('match_id', match.id)
            .order('created_at', { ascending: false })
            .limit(1);

          const { count: noLeidos } = await supabase
            .from('mensajes')
            .select('*', { count: 'exact', head: true })
            .eq('match_id', match.id)
            .eq('leido', false)
            .neq('sender_id', user.id);

          return {
            ...match,
            ultimoMensaje: msgs?.[0] || null,
            noLeidos: noLeidos || 0,
          };
        })
      );

      setMatches(matchesConMensaje);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargarMatches(); }, [cargarMatches]);

  // Realtime — actualizar cuando llega mensaje nuevo
  useEffect(() => {
    if (!currentUser) return;
    const channelName = `matches-list-${currentUser.id}`;
    const existing = supabase
      .getChannels()
      .filter((ch) => ch.topic === `realtime:${channelName}`);
    existing.forEach((ch) => {
      supabase.removeChannel(ch);
    });

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes',
      }, () => { cargarMatches(); })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [currentUser, cargarMatches]);

  const onRefresh = () => { setRefreshing(true); cargarMatches(); };

  const getOtroUsuario = (match) => {
    if (!currentUser) return null;
    return match.user1?.id === currentUser.id ? match.user2 : match.user1;
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const d = new Date(fecha);
    const ahora = new Date();
    const diff = Math.floor((ahora - d) / 1000);
    if (diff < 60) return 'Ahora';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  };

  const styles = makeStyles(palette);

  const renderMatch = ({ item }) => {
    const otro = getOtroUsuario(item);
    if (!otro) return null;
    const tieneNoLeidos = item.noLeidos > 0;

    return (
      <TouchableOpacity
        style={styles.matchItem}
        onPress={() => navigation.navigate('Chat', {
          matchId: item.id,
          otroUsuario: otro,
        })}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: palette.primary + '33' }]}>
            {otro.avatar_url
              ? <Image source={{ uri: otro.avatar_url }} style={styles.avatarImg} />
              : <Text style={[styles.avatarInitial, { color: palette.primary }]}>
                  {otro.nombre?.[0]?.toUpperCase() || '?'}
                </Text>
            }
          </View>
          <View style={[styles.onlineDot, { backgroundColor: palette.secondary }]} />
        </View>

        {/* Info */}
        <View style={styles.matchInfo}>
          <View style={styles.matchTop}>
            <Text style={[styles.matchNombre, { color: palette.text },
              tieneNoLeidos && { fontWeight: '800' }
            ]}>
              {otro.nombre || 'Usuario'}
            </Text>
            <Text style={[styles.matchFecha, { color: palette.textMuted }]}>
              {formatearFecha(item.ultimoMensaje?.created_at || item.created_at)}
            </Text>
          </View>
          <View style={styles.matchBottom}>
            <Text
              style={[styles.matchPreview, { color: tieneNoLeidos ? palette.text : palette.textMuted },
                tieneNoLeidos && { fontWeight: '600' }
              ]}
              numberOfLines={1}
            >
              {item.ultimoMensaje
                ? item.ultimoMensaje.sender_id === currentUser?.id
                  ? `Tú: ${item.ultimoMensaje.contenido}`
                  : item.ultimoMensaje.contenido
                : '🔥 ¡Hicieron match! Di hola'
              }
            </Text>
            {tieneNoLeidos && (
              <View style={[styles.badge, { backgroundColor: palette.primary }]}>
                <Text style={styles.badgeText}>
                  {item.noLeidos > 9 ? '9+' : item.noLeidos}
                </Text>
              </View>
            )}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Matches</Text>
        <View style={[styles.countBadge, { backgroundColor: palette.primary + '22' }]}>
          <Text style={[styles.countText, { color: palette.primary }]}>
            {matches.length}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={item => item.id}
          renderItem={renderMatch}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="heart-outline" size={56} color={palette.textMuted} />
              <Text style={[styles.emptyText, { color: palette.text }]}>
                Sin matches aún
              </Text>
              <Text style={[styles.emptySub, { color: palette.textMuted }]}>
                Ve al Klic y haz Smash en los perfiles que te gusten
              </Text>
              <TouchableOpacity
                style={[styles.irBtn, { backgroundColor: palette.primary }]}
                onPress={() => navigation.navigate('SmashOrPass')}
              >
                <Ionicons name="flash-outline" size={18} color="#fff" />
                <Text style={styles.irBtnText}>Ir al Klic</Text>
              </TouchableOpacity>
            </View>
          }
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: palette.border }]} />
          )}
        />
      )}

      <MainMenu navigation={navigation} active="Matches" />
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg, justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  title: { fontSize: 28, fontWeight: '800', color: palette.text },
  countBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radii.pill,
  },
  countText: { fontSize: 13, fontWeight: '700' },

  matchItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    backgroundColor: palette.bg,
  },
  avatarContainer: { position: 'relative' },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarInitial: { fontSize: 20, fontWeight: '800' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: palette.bg,
  },
  matchInfo: { flex: 1, gap: 3 },
  matchTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  matchNombre: { fontSize: 15, fontWeight: '600' },
  matchFecha: { fontSize: 11 },
  matchBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  matchPreview: { flex: 1, fontSize: 13, marginRight: 8 },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  separator: { height: 1, marginLeft: 80 },

  emptyBox: {
    alignItems: 'center', paddingVertical: 80,
    paddingHorizontal: 32, gap: 10,
  },
  emptyText: { fontSize: 20, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  irBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: radii.pill, marginTop: 8,
  },
  irBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});