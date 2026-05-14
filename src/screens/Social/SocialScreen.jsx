import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, TextInput,
  Animated, Dimensions, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';
import { enviarSolicitudAmistad } from '../../utils/amigos';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TABS = ['Chats', 'Amigos', 'Seguidores'];
const TAB_INNER_WIDTH = SCREEN_WIDTH - 32;
const TAB_SLOT = TAB_INNER_WIDTH / TABS.length;

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
  const [amigoUserIds, setAmigoUserIds] = useState(() => new Set());
  const [pendingSentIds, setPendingSentIds] = useState(() => new Set());

  const translateX = useRef(new Animated.Value(0)).current;
  const tabIndicatorX = useRef(new Animated.Value(0)).current;
  const chatsRef = useRef(chats);
  const canalRef = useRef(null); // ← ref para controlar el canal Realtime
  const currentUserIdRef = useRef(null);

  chatsRef.current = chats;

  const animarATab = (idx) => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: -idx * SCREEN_WIDTH,
        useNativeDriver: true, tension: 100, friction: 12,
      }),
      Animated.spring(tabIndicatorX, {
        toValue: idx * TAB_SLOT,
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
      currentUserIdRef.current = user?.id;
      if (!user) return;

      const [
        { data: amigosData },
        { data: seguidoresData },
        { data: siguiendoData },
        { data: solicitudesData },
        { data: chatsData },
        { data: pendingOutData },
      ] = await Promise.all([
        supabase.from('amigos')
          .select(`id, estado, solicitante_id,
            user1:user1_id(id, nombre, avatar_url),
            user2:user2_id(id, nombre, avatar_url)`)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .eq('estado', 'aceptado'),
        supabase.from('seguidores')
          .select('*, seguidor:seguidor_id(id, nombre, avatar_url)')
          .eq('seguido_id', user.id),
        supabase.from('seguidores')
          .select('seguido_id')
          .eq('seguidor_id', user.id),
        supabase.from('amigos')
          .select(`id, solicitante:solicitante_id(id, nombre, avatar_url)`)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .eq('estado', 'pendiente')
          .neq('solicitante_id', user.id),
        supabase.from('amigos')
          .select(`id, created_at,
            user1:user1_id(id, nombre, avatar_url),
            user2:user2_id(id, nombre, avatar_url)`)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .eq('estado', 'aceptado'),
        supabase.from('amigos')
          .select('user1_id, user2_id')
          .eq('estado', 'pendiente')
          .eq('solicitante_id', user.id)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
      ]);

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
      const otrosAmigos = (amigosData || []).map((a) =>
        a.user1?.id === user.id ? a.user2?.id : a.user1?.id
      ).filter(Boolean);
      setAmigoUserIds(new Set(otrosAmigos));

      const pendOut = (pendingOutData || []).map((r) =>
        r.user1_id === user.id ? r.user2_id : r.user1_id
      ).filter(Boolean);
      setPendingSentIds(new Set(pendOut));

      setSeguidores(seguidoresData || []);
      setSiguiendo((siguiendoData || []).map(s => s.seguido_id));
      setSolicitudes(solicitudesData || []);
      setChats(chatsConMsg);

      // Iniciar canal Realtime solo una vez
      iniciarCanal(user.id);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Canal Realtime — se crea una sola vez y se reutiliza
  const iniciarCanal = useCallback((uid) => {
    if (canalRef.current) return; // Ya existe, no crear otro

    const canal = supabase
      .channel(`social-inbox-msgs-${uid}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes_amigos',
      }, (payload) => {
        const row = payload.new;
        const uid = currentUserIdRef.current;

        setChats((prev) => {
          if (!prev.some((c) => c.id === row.amistad_id)) return prev;
          const updated = prev.map((c) => {
            if (c.id !== row.amistad_id) return c;
            const incUnread = row.sender_id !== uid && !row.leido ? 1 : 0;
            return {
              ...c,
              ultimoMensaje: {
                contenido: row.contenido,
                created_at: row.created_at,
                sender_id: row.sender_id,
                leido: row.leido,
              },
              noLeidos: (c.noLeidos || 0) + incUnread,
            };
          });
          return [...updated].sort((a, b) => {
            const ta = new Date(a.ultimoMensaje?.created_at || a.created_at || 0).getTime();
            const tb = new Date(b.ultimoMensaje?.created_at || b.created_at || 0).getTime();
            return tb - ta;
          });
        });
      })
      .subscribe();

    canalRef.current = canal;
  }, []);

  // Limpiar canal al desmontar
  useEffect(() => {
    return () => {
      if (canalRef.current) {
        supabase.removeChannel(canalRef.current);
        canalRef.current = null;
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarTodo();
    }, [cargarTodo])
  );

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
      const { error } = await supabase.from('seguidores').insert({
        seguidor_id: currentUser.id, seguido_id: userId,
      });
      if (error) { Alert.alert('No se pudo seguir', error.message); return; }
      setSiguiendo(prev => [...prev, userId]);
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const dejarDeSeguir = async (userId) => {
    try {
      const { error } = await supabase.from('seguidores').delete()
        .eq('seguidor_id', currentUser.id).eq('seguido_id', userId);
      if (error) { Alert.alert('Error', error.message); return; }
      setSiguiendo(prev => prev.filter(id => id !== userId));
    } catch (e) { console.warn(e); }
  };

  const onEnviarSolicitudAmistad = async (userId) => {
    try {
      const res = await enviarSolicitudAmistad(supabase, currentUser.id, userId);
      if (!res.ok) { Alert.alert('Amigos', res.message); return; }
      Alert.alert('Listo', res.action === 'resent' ? 'Solicitud reenviada' : 'Solicitud enviada');
      setPendingSentIds((prev) => new Set([...prev, userId]));
      cargarTodo();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const aceptarSolicitud = async (amistadId) => {
    try {
      const { error } = await supabase.from('amigos')
        .update({ estado: 'aceptado' }).eq('id', amistadId);
      if (error) { Alert.alert('Error', error.message); return; }
      setSolicitudes(prev => prev.filter(s => s.id !== amistadId));
      cargarTodo();
    } catch (e) { console.warn(e); }
  };

  const rechazarSolicitud = async (amistadId) => {
    try {
      const { error } = await supabase.from('amigos')
        .update({ estado: 'rechazado' }).eq('id', amistadId);
      if (error) { Alert.alert('Error', error.message); return; }
      setSolicitudes(prev => prev.filter(s => s.id !== amistadId));
    } catch (e) { console.warn(e); }
  };

  const irPerfilUsuario = (userId) => {
    if (!userId || !currentUser) return;
    if (userId === currentUser.id) navigation.navigate('Profile');
    else navigation.navigate('UserProfile', { userId });
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

  const renderChat = ({ item }) => {
    const otro = getOtroUsuario(item);
    if (!otro) return null;
    const tieneNoLeidos = item.noLeidos > 0;
    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigation.navigate('ChatAmigo', { amistadId: item.id, otroUsuario: otro })}
        activeOpacity={0.7}
      >
        <View style={{ position: 'relative' }}>
          {renderAvatar(otro, 50)}
          <View style={[styles.onlineDot, { backgroundColor: palette.secondary }]} />
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatTop}>
            <TouchableOpacity
              onPress={() => irPerfilUsuario(otro.id)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={{ flex: 1, marginRight: 8 }}
            >
              <Text style={[styles.chatNombre, { color: palette.text },
                tieneNoLeidos && { fontWeight: '800' }]}>
                {otro.nombre}
              </Text>
            </TouchableOpacity>
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
                : '👋 Dile hola a tu nuevo amigo'}
            </Text>
            {tieneNoLeidos && (
              <View style={[styles.badge, { backgroundColor: palette.primary }]}>
                <Text style={styles.badgeText}>{item.noLeidos > 9 ? '9+' : item.noLeidos}</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
      </TouchableOpacity>
    );
  };

  const renderAmigo = ({ item }) => {
    const otro = getOtroUsuario(item);
    if (!otro) return null;
    return (
      <View style={styles.userItem}>
        <TouchableOpacity
          onPress={() => irPerfilUsuario(otro.id)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
        >
          {renderAvatar(otro, 46)}
          <Text style={[styles.userNombre, { color: palette.text }]} numberOfLines={1}>
            {otro.nombre}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.msgBtn, { backgroundColor: palette.primary }]}
          onPress={() => navigation.navigate('ChatAmigo', { amistadId: item.id, otroUsuario: otro })}
        >
          <Ionicons name="chatbubble-outline" size={16} color="#fff" />
          <Text style={styles.msgBtnText}>Mensaje</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSeguidor = ({ item }) => {
    const usuario = item.seguidor;
    const yaSigo = siguiendo.includes(usuario?.id);
    return (
      <View style={styles.userItem}>
        <TouchableOpacity
          onPress={() => irPerfilUsuario(usuario?.id)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
        >
          {renderAvatar(usuario, 46)}
          <Text style={[styles.userNombre, { color: palette.text }]} numberOfLines={1}>
            {usuario?.nombre}
          </Text>
        </TouchableOpacity>
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

  const renderResultado = ({ item }) => {
    const yaSigo = siguiendo.includes(item.id);
    const yaAmigo = amigoUserIds.has(item.id);
    const solicitudPendiente = pendingSentIds.has(item.id);
    return (
      <View style={styles.userItem}>
        <TouchableOpacity
          onPress={() => irPerfilUsuario(item.id)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
        >
          {renderAvatar(item, 46)}
          <Text style={[styles.userNombre, { color: palette.text }]} numberOfLines={1}>
            {item.nombre}
          </Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
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
          {yaAmigo ? (
            <View style={[styles.seguirBtn, { backgroundColor: palette.secondary + '22', borderColor: palette.secondary }]}>
              <Ionicons name="people" size={15} color={palette.secondary} />
            </View>
          ) : solicitudPendiente ? (
            <View style={[styles.seguirBtn, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
              <Ionicons name="time-outline" size={15} color={palette.textMuted} />
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.seguirBtn, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}
              onPress={() => onEnviarSolicitudAmistad(item.id)}
            >
              <Ionicons name="person-add-outline" size={15} color={palette.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[palette.primary + '2e', palette.bg, palette.bg]}
        locations={[0, 0.45, 1]}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: palette.text }]}>Social</Text>
            <Text style={[styles.heroSub, { color: palette.textMuted }]}>Chats, amigos y comunidad</Text>
          </View>
          {solicitudes.length > 0 ? (
            <View style={[styles.heroBadge, { backgroundColor: palette.primary }]}>
              <Text style={styles.heroBadgeText}>{solicitudes.length}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.searchRow, {
          backgroundColor: palette.panel,
          borderColor: palette.primary + '33',
        }]}>
          <View style={[styles.searchIconWrap, { backgroundColor: palette.primary + '18' }]}>
            <Ionicons name="search" size={18} color={palette.primary} />
          </View>
          <TextInput
            style={[styles.searchInput, { color: palette.text }]}
            placeholder="Buscar por nombre..."
            placeholderTextColor={palette.textMuted}
            value={busqueda}
            onChangeText={buscarUsuarios}
            autoCorrect={false}
          />
          {busqueda.length > 0 ? (
            <TouchableOpacity onPress={() => { setBusqueda(''); setResultados([]); }} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={palette.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradient>

      {busqueda.length >= 2 ? (
        buscando ? (
          <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>
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
          <View style={[styles.tabsShell, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
            <View style={styles.tabsRow}>
              {TABS.map((tab, i) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, tabIndex === i && { backgroundColor: palette.panel }]}
                  onPress={() => animarATab(i)}
                  activeOpacity={0.85}
                >
                  <Text style={[
                    styles.tabText,
                    { color: tabIndex === i ? palette.primary : palette.textMuted },
                    tabIndex === i && { fontWeight: '800' },
                  ]}>
                    {tab}{tab === 'Amigos' && solicitudes.length > 0 ? ` · ${solicitudes.length}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
              <Animated.View style={[styles.tabIndicator, {
                backgroundColor: palette.primary,
                width: TAB_SLOT,
                transform: [{ translateX: tabIndicatorX }],
              }]} />
            </View>
          </View>

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
                  contentContainerStyle={styles.chatsList}
                  ListEmptyComponent={
                    <View style={styles.emptyBox}>
                      <Ionicons name="chatbubbles-outline" size={48} color={palette.textMuted} />
                      <Text style={[styles.emptyText, { color: palette.text }]}>Sin chats aún</Text>
                      <Text style={[styles.emptySub, { color: palette.textMuted }]}>Agrega amigos para empezar a chatear</Text>
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
                            <TouchableOpacity
                              onPress={() => irPerfilUsuario(s.solicitante?.id)}
                              style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}
                            >
                              {renderAvatar(s.solicitante, 38)}
                              <Text style={[styles.solicitudNombre, { color: palette.text }]}>{s.solicitante?.nombre}</Text>
                            </TouchableOpacity>
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
                      <Text style={[styles.emptySub, { color: palette.textMuted }]}>Busca personas por nombre arriba</Text>
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
                      <Text style={[styles.emptySub, { color: palette.textMuted }]}>Comparte tu perfil para conseguir seguidores</Text>
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
  hero: { paddingTop: 48, paddingBottom: 6 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: 14 },
  heroTitle: { fontSize: 30, fontWeight: '900', letterSpacing: -0.6 },
  heroSub: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  heroBadge: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, marginLeft: 8, marginTop: 4 },
  heroBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 11, borderRadius: radii.lg, borderWidth: 1 },
  searchIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, fontSize: 15 },
  tabsShell: { marginHorizontal: 16, marginTop: 12, marginBottom: 6, borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden' },
  tabsRow: { flexDirection: 'row', position: 'relative' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabIndicator: { position: 'absolute', bottom: 0, left: 0, height: 3, borderRadius: 3 },
  slides: { flex: 1, flexDirection: 'row', width: SCREEN_WIDTH * TABS.length },
  slide: { width: SCREEN_WIDTH, flex: 1 },
  lista: { padding: 12, paddingTop: 8, gap: 8 },
  chatsList: { padding: 12, paddingTop: 10, paddingBottom: 20 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12, marginBottom: 10, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.panel },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: palette.panel },
  chatInfo: { flex: 1, gap: 3 },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatNombre: { fontSize: 15, fontWeight: '600' },
  chatFecha: { fontSize: 11 },
  chatBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatPreview: { flex: 1, fontSize: 13, marginRight: 8 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10, backgroundColor: palette.bg },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarInitial: { fontWeight: '800' },
  userNombre: { flex: 1, fontSize: 14, fontWeight: '600' },
  msgBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill },
  msgBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  seguirBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: 1 },
  seguirBtnText: { fontSize: 12, fontWeight: '700' },
  solicitudesCard: { marginHorizontal: 12, marginTop: 8, marginBottom: 12, padding: 16, borderRadius: radii.lg, borderWidth: 1, gap: 12 },
  solicitudesTitle: { fontSize: 14, fontWeight: '700' },
  solicitudRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  solicitudNombre: { flex: 1, fontSize: 13, fontWeight: '600' },
  solicitudBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});