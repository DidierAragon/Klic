import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, ActivityIndicator, RefreshControl, FlatList
} from 'react-native';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

const TABS = ['Fotos', 'Opiniones', 'Videos'];

export default function HomeScreen({ navigation }) {
  const { palette } = useTema();
  const [tabActiva, setTabActiva] = useState('Fotos');
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cargarFotos = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('fotos_perfil')
        .select('*, users(nombre, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(30);
      setFotos(data || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargarFotos(); }, [cargarFotos]);

  const onRefresh = () => { setRefreshing(true); cargarFotos(); };

  const styles = makeStyles(palette);

  const renderFoto = ({ item }) => (
    <View style={styles.postCard}>
      {/* Header del post */}
      <View style={styles.postHeader}>
        <View style={styles.postAvatar}>
          {item.users?.avatar_url ? (
            <Image source={{ uri: item.users.avatar_url }} style={styles.postAvatarImg} />
          ) : (
            <View style={[styles.postAvatarPlaceholder, { backgroundColor: palette.primary + '33' }]}>
              <Text style={[styles.postAvatarInitial, { color: palette.primary }]}>
                {item.users?.nombre?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postNombre}>{item.users?.nombre || 'Usuario'}</Text>
          <Text style={styles.postFecha}>
            {new Date(item.created_at).toLocaleDateString('es-CO', {
              day: 'numeric', month: 'short'
            })}
          </Text>
        </View>
        <TouchableOpacity style={[styles.klicBtn, { borderColor: palette.primary }]}>
          <Text style={[styles.klicBtnText, { color: palette.primary }]}>⚡ Klic</Text>
        </TouchableOpacity>
      </View>

      {/* Foto */}
      <Image
        source={{ uri: item.url }}
        style={styles.postImage}
        resizeMode="cover"
      />

      {/* Reacciones */}
      <View style={styles.postActions}>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>🔥</Text>
          <Text style={styles.actionCount}>{item.likes || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>👋</Text>
          <Text style={styles.actionCount}>Parcero</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>Comentar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>➤</Text>
          <Text style={styles.actionCount}>Compartir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderVacio = (msg) => (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyIcon}>✨</Text>
      <Text style={styles.emptyText}>{msg}</Text>
      <Text style={styles.emptySubtext}>Sé el primero en publicar</Text>
    </View>
  );

  return (
    <View style={styles.wrapper}>

      {/* Header fijo */}
      <View style={styles.topBar}>
        <Text style={[styles.logo, { color: palette.primary }]}>⚡ KLIC</Text>
        <TouchableOpacity style={styles.notifBtn}>
          <Text style={styles.notifIcon}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, tabActiva === tab && { borderBottomColor: palette.primary, borderBottomWidth: 2 }]}
            onPress={() => setTabActiva(tab)}
          >
            <Text style={[styles.tabText, tabActiva === tab && { color: palette.primary, fontWeight: '700' }]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Contenido según tab */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : tabActiva === 'Fotos' ? (
        <FlatList
          data={fotos}
          keyExtractor={item => item.id}
          renderItem={renderFoto}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
          ListEmptyComponent={renderVacio('No hay fotos aún')}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      ) : tabActiva === 'Opiniones' ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
        >
          {renderVacio('No hay opiniones aún')}
        </ScrollView>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
        >
          {renderVacio('No hay videos aún')}
        </ScrollView>
      )}

      <MainMenu navigation={navigation} active="Home" />
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Top bar
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 52, paddingBottom: 10,
    backgroundColor: palette.bg,
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  logo: { fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  notifBtn: { padding: 4 },
  notifIcon: { fontSize: 20 },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: palette.bg,
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  tab: {
    flex: 1, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { color: palette.textMuted, fontSize: 14, fontWeight: '600' },

  // Post card
  postCard: {
    backgroundColor: palette.panel,
    borderBottomWidth: 1, borderBottomColor: palette.border,
    marginBottom: 2,
  },
  postHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, gap: 10,
  },
  postAvatar: { width: 40, height: 40 },
  postAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  postAvatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  postAvatarInitial: { fontSize: 18, fontWeight: '800' },
  postNombre: { color: palette.text, fontWeight: '700', fontSize: 14 },
  postFecha: { color: palette.textMuted, fontSize: 12 },
  klicBtn: {
    borderWidth: 1, borderRadius: radii.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  klicBtnText: { fontSize: 12, fontWeight: '700' },
  postImage: { width: '100%', height: 320 },
  postActions: {
    flexDirection: 'row', paddingHorizontal: 12,
    paddingVertical: 10, gap: 4,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4, paddingVertical: 6,
  },
  actionIcon: { fontSize: 16 },
  actionCount: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },

  // Empty
  emptyBox: {
    alignItems: 'center', padding: 48,
    margin: 20,
    backgroundColor: palette.panel,
    borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: palette.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptySubtext: { color: palette.textMuted, fontSize: 13 },
});