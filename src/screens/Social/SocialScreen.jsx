import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, TextInput,
  Animated, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TABS = ['Chats', 'Amigos', 'Seguidores'];

export default function SocialScreen({ navigation }) {
  const { palette } = useTema();
  const [tabIndex, setTabIndex] = useState(0);
  const [amigos, setAmigos] = useState([]);
  const [seguidores, setSeguidores] = useState([]);
  const [siguiendo, setSiguiendo] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [chats, setChats] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const tabIndicatorX = useRef(new Animated.Value(0)).current;

  const animarATab = (idx) => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: -idx * SCREEN_WIDTH,
        useNativeDriver: true, tension: 100, friction: 12,
      }),
      Animated.spring(tabIndicatorX, {
        toValue: idx * (SCREEN_WIDTH / TABS.length),
        useNativeDriver: true, tension: 100, friction: 12,
      }),
    ]).start();
    setTabIndex(idx);
    setBusqueda('');
    setResultados([]);
  };

  const cargarTodo = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      if (!user) return;

      const [
        { data: amigosData },
        { data: seguidoresData },
        { data: siguiendoData },
        { data: solicitudesData },
        { data: chatsData },
      ] = await Promise.all([
        // Amigos aceptados
        supabase.from('amigos')
          .select(`
            id, estado, solicitante_id,
            user1:user1_id(id, nombre, avatar_url),
            user2:user2_id(id, nombre, avatar_url)
          `)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .eq('estado', 'aceptado'),
        // Mis seguidores
        supabase.from('seguidores')
          .select('*, seguidor:seguidor_id(id, nombre, avatar_url)')
          .eq('seguido_id', user.id),
        // A quienes sigo
        supabase.from('seguidores')
          .select('seguido_id')
          .eq('seguidor_id', user.id),
        // Solicitudes pendientes
        supabase.from('amigos')
          .select(`
            id,
            solicitante:solicitante_id(id, nombre, avatar_url)
          `)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .eq('estado', 'pendiente')
          .neq('solicitante_id', user.id),
        // Chats de amigos
        supabase.from('amigos')
          .select(`
            id, created_at,
            user1:user1_id(id, nombre, avatar_url),
            user2:user2_id(id, nombre, avatar_url)
          `)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .eq('estado', 'aceptado'),
      ]);

      // Enriquecer chats con último mensaje
      const chatsConMsg = await Promise.all(
        (chatsData || []).map(async (amistad) => {
          const { data: msgs } = await supabase
            .from('mensajes_amigos')
            .select('contenido, created_at, sender_id, leido')
            .eq('amistad_id', amistad.id)
            .order('created_at', { ascending: false })
            .limit(1);

          const { count: noLeidos } = await supabase
            .from('mensajes_amigos')
            .select('*', { count: 'exact', head: true })
            .eq('amistad_id', amistad.id)
            .eq('leido', false)
            .neq('sender_id', user.id);

          return { ...amistad, ultimoMensaje: msgs?.[0] || null, noLeidos: noLeidos || 0 };
        })
      );

      setAmigos(amigosData || []);
      setSeguidores(seguidoresData || []);
      setSiguiendo((siguiendoData || []).map(s => s.seguido_id));
      setSolicitudes(solicitudesData || []);
      setChats(chatsConMsg);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const onRefresh = () => { setRefreshing(true); cargarTodo(); };

  const buscarUsuarios = async (texto) => {
    setBusqueda(texto);
    if (texto.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    try {
      const { data } = await supabase
        .from('users')
        .select('id, nombre, avatar_url')
        .ilike('nombre', `%${texto}%`)
        .neq('id', currentUser?.id)
        .limit(15);
      setResultados(data || []);
    } catch (e) { console.warn(e); }
    finally { setBuscando(false); }
  };

  const seguir = async (userId) => {
    try {
      await supabase.from('seguidores').insert({
        seguidor_id: currentUser.id,
        seguido_id: userId,
      });
      setSiguiendo(prev => [...prev, userId]);
    } catch (e) { console.warn(e); }
  };

  const dejarDeSeguir = async (userId) => {
    try {
      await supabase.from('seguidores').delete()
        .eq('seguidor_id', currentUser.id)
        .eq('seguido_id', userId);
      setSiguiendo(prev => prev.filter(id => id !== userId));
    } catch (e) { console.warn(e); }
  };

  const enviarSolicitudAmistad = async (userId) => {
    try {
      const u1 = currentUser.id < userId ? currentUser.id : userId;
      const u2 = currentUser.id < userId ? userId : currentUser.id;
      await supabase.from('amigos').insert({
        user1_id: u1, user2_id: u2,
        solicitante_id: currentUser.id,
        estado: 'pendiente',
      });
      alert('Solicitud enviada ✓');
    } catch (e) { console.warn(e); }
  };

  const aceptarSolicitud = async (amistadId) => {
    try {
      await supabase.from('amigos')
        .update({ estado: 'aceptado' })
        .eq('id', amistadId);
      setSolicitudes(prev => prev.filter(s => s.id !== amistadId));
      cargarTodo();
    } catch (e) { console.warn(e); }
  };

  const rechazarSolicitud = async (amistadId) => {
    try {
      await supabase.from('amigos')
        .update({ estado: 'rechazado' })
        .eq('id', amistadId);
      setSolicitudes(prev => prev.filter(s => s.id !== amistadId));
    } catch (e) { console.warn(e); }
  };

  const getOtroUsuario = (amistad) => {
    if (!currentUser) return null;
    return amistad.user1?.id === currentUser.id ? amistad.user2 : amistad.user1;
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const d = new Date(fecha);
    const ahora = new Date();
    const diff = Math.floor((ahora - d) / 1000);
    if (diff < 60) return 'Ahora';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  const styles = makeStyles(palette);

  const renderAvatar = (usuario, size = 44) => (
    <View style={[styles.avatar, {
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: palette.primary + '33',
    }]}>
      {usuario?.avatar_url
        ? <Image source={{ uri: usuario.avatar_url }}
            style={{ width: size, height: size, borderRadius: size / 2 }} />
        : <Text style={[styles.avatarInitial, { color: palette.primary, fontSize: size * 0.38 }]}>
            {usuario?.nombre?.[0]?.toUpperCase() || '?'}
          </Text>
      }
    </View>
  );

  // ── CHATS ─────────────────────────────────────────────────────────
  const renderChat = ({ item }) => {
    const otro = getOtroUsuario(item);
    if (!otro) return null;
    const tieneNoLeidos = item.noLeidos > 0;

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigation.navigate('ChatAmigo', {
          amistadId: item.id,
          otroUsuario: otro,
        })}
        activeOpacity={0.7}
      >
        <View style={{ position: 'relative' }}>
          {renderAvatar(otro, 50)}
          <View style={[styles.onlineDot, { backgroundColor: palette.secondary }]} />
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatTop}>
            <Text style={[styles.chatNombre, { color: palette.text },
              tieneNoLeidos && { fontWeight: '800' }]}>
              {otro.nombre}
            </Text>
            <Text style={[styles.chatFecha, { color: palette.textMuted }]}>
              {formatearFecha(item.ultimoMensaje?.created_at || item.created_at)}
            </Text>
          </View>
          <View style={styles.chatBottom}>
            <Text style={[styles.chatPreview, {
              color: tieneNoLeidos ? palette.text : palette.textMuted,
              fontWeight: tieneNoLeidos ? '600' : '400',
            }]} numberOfLines={1}>
              {item.ultimoMensaje
                ? item.ultimoMensaje.sender_id === currentUser?.id
                  ? `Tú: ${item.ultimoMensaje.contenido}`
                  : item.ultimoMensaje.contenido
                : '👋 Dile hola a tu nuevo amigo'
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

  // ── AMIGOS ────────────────────────────────────────────────────────
  const renderAmigo = ({ item }) => {
    const otro = getOtroUsuario(item);
    if (!otro) return null;

    return (
      <View style={styles.userItem}>
        {renderAvatar(otro, 46)}
        <Text style={[styles.userNombre, { color: palette.text }]}>{otro.nombre}</Text>
        <TouchableOpacity
          style={[styles.msgBtn, { backgroundColor: palette.primary }]}
          onPress={() => navigation.navigate('ChatAmigo', {
            amistadId: item.id, otroUsuario: otro,
          })}
        >
          <Ionicons name="chatbubble-outline" size={16} color="#fff" />
          <Text style={styles.msgBtnText}>Mensaje</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── SEGUIDORES ────────────────────────────────────────────────────
  const renderSeguidor = ({ item }) => {
    const usuario = item.seguidor;
    const yaSigo = siguiendo.includes(usuario?.id);

    return (
      <View style={styles.userItem}>
        {renderAvatar(usuario, 46)}
        <Text style={[styles.userNombre, { color: palette.text }]} numberOfLines={1}>
          {usuario?.nombre}
        </Text>
        <TouchableOpacity
          style={[styles.seguirBtn, {
            backgroundColor: yaSigo ? palette.panelSoft : palette.primary,
            borderColor: yaSigo ? palette.border : palette.primary,
          }]}
          onPress={() => yaSigo ? dejarDeSeguir(usuario.id) : seguir(usuario.id)}
        >
          <Text style={[styles.seguirBtnText, { color: yaSigo ? palette.textMuted : '#fff' }]}>
            {yaSigo ? 'Siguiendo' : 'Seguir'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── BUSCADOR ──────────────────────────────────────────────────────
  const renderResultado = ({ item }) => {
    const yaSigo = siguiendo.includes(item.id);
    return (
      <View style={styles.userItem}>
        {renderAvatar(item, 46)}
        <Text style={[styles.userNombre, { color: palette.text }]} numberOfLines={1}>
          {item.nombre}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={[styles.seguirBtn, {
              backgroundColor: yaSigo ? palette.panelSoft : palette.primary,
              borderColor: yaSigo ? palette.border : palette.primary,
            }]}
            onPress={() => yaSigo ? dejarDeSeguir(item.id) : seguir(item.id)}
          >
            <Text style={[styles.seguirBtnText, { color: yaSigo ? palette.textMuted : '#fff' }]}>
              {yaSigo ? 'Siguiendo' : 'Seguir'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.seguirBtn, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}
            onPress={() => enviarSolicitudAmistad(item.id)}
          >
            <Ionicons name="person-add-outline" size={15} color={palette.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Social</Text>
        {solicitudes.length > 0 && (
          <View style={[styles.solicitudesBadge, { backgroundColor: palette.primary }]}>
            <Text style={styles.solicitudesText}>{solicitudes.length}</Text>
          </View>
        )}
      </View>

      {/* Buscador */}
      <View style={[styles.searchRow, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
        <Ionicons name="search-outline" size={18} color={palette.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: palette.text }]}
          placeholder="Buscar personas..."
          placeholderTextColor={palette.textMuted}
          value={busqueda}
          onChangeText={buscarUsuarios}
          autoCorrect={false}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => { setBusqueda(''); setResultados([]); }}>
            <Ionicons name="close-circle" size={18} color={palette.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Resultados de búsqueda */}
      {busqueda.length >= 2 ? (
        buscando ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={resultados}
            keyExtractor={item => item.id}
            renderItem={renderResultado}
            contentContainerStyle={styles.lista}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Ionicons name="search-outline" size={40} color={palette.textMuted} />
                <Text style={[styles.emptyText, { color: palette.text }]}>Sin resultados</Text>
              </View>
            }
          />
        )
      ) : (
        <>
          {/* Tabs */}
          <View style={styles.tabsRow}>
            {TABS.map((tab, i) => (
              <TouchableOpacity key={tab} style={styles.tab} onPress={() => animarATab(i)}>
                <Text style={[styles.tabText, { color: tabIndex === i ? palette.primary : palette.textMuted },
                  tabIndex === i && { fontWeight: '700' }]}>
                  {tab}
                  {tab === 'Amigos' && solicitudes.length > 0
                    ? ` (${solicitudes.length})`
                    : ''
                  }
                </Text>
              </TouchableOpacity>
            ))}
            <Animated.View style={[styles.tabIndicator, {
              backgroundColor: palette.primary,
              width: SCREEN_WIDTH / TABS.length,
              transform: [{ translateX: tabIndicatorX }],
            }]} />
          </View>

          {/* Contenido tabs */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={palette.primary} />
            </View>
          ) : (
            <Animated.View style={[styles.slides, { transform: [{ translateX }] }]}>

              {/* Tab Chats */}
              <View style={styles.slide}>
                <FlatList
                  data={chats}
                  keyExtractor={item => item.id}
                  renderItem={renderChat}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
                  showsVerticalScrollIndicator={false}
                  ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: palette.border }]} />}
                  ListEmptyComponent={
                    <View style={styles.emptyBox}>
                      <Ionicons name="chatbubbles-outline" size={48} color={palette.textMuted} />
                      <Text style={[styles.emptyText, { color: palette.text }]}>Sin chats aún</Text>
                      <Text style={[styles.emptySub, { color: palette.textMuted }]}>
                        Agrega amigos para empezar a chatear
                      </Text>
                    </View>
                  }
                />
              </View>

              {/* Tab Amigos */}
              <View style={styles.slide}>
                <FlatList
                  data={amigos}
                  keyExtractor={item => item.id}
                  renderItem={renderAmigo}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.lista}
                  ListHeaderComponent={
                    solicitudes.length > 0 ? (
                      <View style={[styles.solicitudesCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
                        <Text style={[styles.solicitudesTitle, { color: palette.text }]}>
                          Solicitudes pendientes ({solicitudes.length})
                        </Text>
                        {solicitudes.map(s => (
                          <View key={s.id} style={styles.solicitudRow}>
                            {renderAvatar(s.solicitante, 38)}
                            <Text style={[styles.solicitudNombre, { color: palette.text }]}>
                              {s.solicitante?.nombre}
                            </Text>
                            <TouchableOpacity
                              style={[styles.solicitudBtn, { backgroundColor: palette.primary }]}
                              onPress={() => aceptarSolicitud(s.id)}
                            >
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.solicitudBtn, { backgroundColor: palette.panelSoft, borderColor: palette.border, borderWidth: 1 }]}
                              onPress={() => rechazarSolicitud(s.id)}
                            >
                              <Ionicons name="close" size={16} color={palette.textMuted} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ) : null
                  }
                  ListEmptyComponent={
                    <View style={styles.emptyBox}>
                      <Ionicons name="people-outline" size={48} color={palette.textMuted} />
                      <Text style={[styles.emptyText, { color: palette.text }]}>Sin amigos aún</Text>
                      <Text style={[styles.emptySub, { color: palette.textMuted }]}>
                        Busca personas por nombre arriba
                      </Text>
                    </View>
                  }
                />
              </View>

              {/* Tab Seguidores */}
              <View style={styles.slide}>
                <FlatList
                  data={seguidores}
                  keyExtractor={item => item.id}
                  renderItem={renderSeguidor}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.lista}
                  ListEmptyComponent={
                    <View style={styles.emptyBox}>
                      <Ionicons name="people-outline" size={48} color={palette.textMuted} />
                      <Text style={[styles.emptyText, { color: palette.text }]}>Sin seguidores aún</Text>
                      <Text style={[styles.emptySub, { color: palette.textMuted }]}>
                        Comparte tu perfil para conseguir seguidores
                      </Text>
                    </View>
                  }
                />
              </View>
            </Animated.View>
          )}
        </>
      )}

      <MainMenu navigation={navigation} active="Social" />
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg, justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  title: { fontSize: 28, fontWeight: '800', color: palette.text },
  solicitudesBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  solicitudesText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: radii.pill, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },

  tabsRow: {
    flexDirection: 'row', position: 'relative',
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabIndicator: {
    position: 'absolute', bottom: 0, left: 0,
    height: 2, borderRadius: 2,
  },

  slides: {
    flex: 1, flexDirection: 'row',
    width: SCREEN_WIDTH * TABS.length,
  },
  slide: { width: SCREEN_WIDTH, flex: 1 },
  lista: { padding: 12, gap: 4 },
  separator: { height: 1, marginLeft: 74 },

  // Chat item
  chatItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 2, borderColor: palette.bg,
  },
  chatInfo: { flex: 1, gap: 3 },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatNombre: { fontSize: 15, fontWeight: '600' },
  chatFecha: { fontSize: 11 },
  chatBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatPreview: { flex: 1, fontSize: 13, marginRight: 8 },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // User item
  userItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    gap: 10, backgroundColor: palette.bg,
  },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarInitial: { fontWeight: '800' },
  userNombre: { flex: 1, fontSize: 14, fontWeight: '600' },

  msgBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill,
  },
  msgBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  seguirBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radii.pill, borderWidth: 1,
  },
  seguirBtnText: { fontSize: 12, fontWeight: '700' },

  // Solicitudes
  solicitudesCard: {
    margin: 12, padding: 14, borderRadius: radii.lg,
    borderWidth: 1, gap: 10, marginBottom: 4,
  },
  solicitudesTitle: { fontSize: 14, fontWeight: '700' },
  solicitudRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  solicitudNombre: { flex: 1, fontSize: 13, fontWeight: '600' },
  solicitudBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },

  emptyBox: {
    alignItems: 'center', paddingVertical: 60, gap: 8,
  },
  emptyText: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});