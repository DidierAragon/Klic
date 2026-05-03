import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ActivityIndicator, RefreshControl, FlatList,
  Dimensions, Animated, PanResponder, TextInput, Alert
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import LikeButton from '../../components/LikeButton';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TABS = ['Fotos', 'Opiniones', 'Videos'];

export default function HomeScreen({ navigation }) {
  const { palette } = useTema();
  const [tabIndex, setTabIndex] = useState(0);
  const [fotos, setFotos] = useState([]);
  const [opiniones, setOpiniones] = useState([]);
  const [videos, setVideos] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [compras, setCompras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const tabIndicatorX = useRef(new Animated.Value(0)).current;

  const animarATab = (idx) => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: -idx * SCREEN_WIDTH,
        useNativeDriver: true,
        tension: 100, friction: 12,
      }),
      Animated.spring(tabIndicatorX, {
        toValue: idx * (SCREEN_WIDTH / TABS.length),
        useNativeDriver: true,
        tension: 100, friction: 12,
      }),
    ]).start();
    setTabIndex(idx);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 10,
      onPanResponderMove: (_, g) => {
        translateX.setValue(-tabIndex * SCREEN_WIDTH + g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -50 && tabIndex < TABS.length - 1) {
          animarATab(tabIndex + 1);
        } else if (g.dx > 50 && tabIndex > 0) {
          animarATab(tabIndex - 1);
        } else {
          Animated.spring(translateX, {
            toValue: -tabIndex * SCREEN_WIDTH,
            useNativeDriver: true,
            tension: 100, friction: 12,
          }).start();
        }
      },
    })
  ).current;

  const cargarTodo = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      const [{ data: f }, { data: o }, { data: v }, { data: c }] = await Promise.all([
        supabase.from('fotos_perfil')
          .select('*, users(nombre, avatar_url)')
          .order('created_at', { ascending: false }).limit(30),
        supabase.from('opiniones')
          .select('*, users(nombre, avatar_url)')
          .order('created_at', { ascending: false }).limit(30),
        supabase.from('videos')
          .select('*, users(nombre, avatar_url)')
          .order('created_at', { ascending: false }).limit(20),
        user
          ? supabase.from('compras').select('contenido_id').eq('comprador_id', user.id)
          : Promise.resolve({ data: [] }),
      ]);

      setFotos(f || []);
      setOpiniones(o || []);
      setVideos(v || []);
      setCompras((c || []).map(item => item.contenido_id));
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const onRefresh = () => { setRefreshing(true); cargarTodo(); };

  const comprarContenido = async (item, tabla) => {
    if (!currentUser) return Alert.alert('Error', 'Debes iniciar sesión');
    Alert.alert(
      'Confirmar compra',
      `¿Deseas comprar este contenido por $${item.precio} USD?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Comprar',
          onPress: async () => {
            try {
              const { error } = await supabase.from('compras').insert({
                comprador_id: currentUser.id,
                contenido_id: item.id,
                monto_pagado: item.precio,
                comision_plataforma: parseFloat((item.precio * 0.2).toFixed(2)),
                tipo_contenido: tabla,
              });
              if (error) throw error;
              setCompras(prev => [...prev, item.id]);
              Alert.alert('✓ Éxito', 'Contenido desbloqueado');
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          }
        }
      ]
    );
  };

  const styles = makeStyles(palette);

  const renderAvatar = (usuario) => (
    <View style={[styles.avatarPlaceholder, { backgroundColor: palette.primary + '33' }]}>
      {usuario?.avatar_url
        ? <Image source={{ uri: usuario.avatar_url }} style={styles.avatarImg} />
        : <Text style={[styles.avatarInitial, { color: palette.primary }]}>
            {usuario?.nombre?.[0]?.toUpperCase() || '?'}
          </Text>
      }
    </View>
  );

  const renderPostHeader = (item, showKlic = true, showPrice = true) => (
    <View style={styles.postHeader}>
      {renderAvatar(item.users)}
      <View style={{ flex: 1 }}>
        <Text style={styles.postNombre}>{item.users?.nombre || 'Usuario'}</Text>
        <Text style={styles.postFecha}>
          {new Date(item.created_at).toLocaleDateString('es-CO', {
            day: 'numeric', month: 'short'
          })}
        </Text>
      </View>
      {showPrice && item.precio > 0 && (
        <View style={[styles.priceTag, { backgroundColor: palette.primary + '30' }]}>
          <Ionicons name="pricetag" size={12} color={palette.primary} />
          <Text style={[styles.priceTagText, { color: palette.primary }]}>${item.precio}</Text>
        </View>
      )}
      {showKlic && (
        <TouchableOpacity style={[styles.klicBtn, { borderColor: palette.primary }]}>
          <Ionicons name="flash-outline" size={12} color={palette.primary} />
          <Text style={[styles.klicBtnText, { color: palette.primary }]}>Klic</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderAcciones = (item, tipo) => (
    <View style={styles.postActions}>
      <LikeButton contenidoId={item.id} tipo={tipo} />
      <TouchableOpacity style={styles.actionBtn}>
        <Ionicons name="hand-left-outline" size={20} color={palette.secondary} />
        <Text style={[styles.actionCount, { color: palette.secondary }]}>Parcero</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionBtn}>
        <Ionicons name="chatbubble-outline" size={20} color={palette.textMuted} />
        <Text style={styles.actionCount}>Comentar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionBtn}>
        <Ionicons name="paper-plane-outline" size={20} color={palette.textMuted} />
        <Text style={styles.actionCount}>Compartir</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFoto = ({ item }) => {
    const esPagado = item.precio > 0;
    const esDueno = currentUser?.id === item.user_id;
    const yaComprado = compras.includes(item.id);
    const bloqueado = esPagado && !esDueno && !yaComprado;

    return (
      <View style={styles.postCard}>
        {renderPostHeader(item, true, true)}
        <View style={{ position: 'relative', overflow: 'hidden' }}>
          <Image source={{ uri: item.url }} style={styles.postImage} resizeMode="cover" />
          {bloqueado && (
            <BlurView intensity={120} tint="dark" style={[StyleSheet.absoluteFill, styles.blurContainer]}>
              <View style={styles.lockOverlay}>
                <View style={[styles.lockIconBox, { backgroundColor: palette.primary }]}>
                  <Ionicons name="lock-closed" size={32} color="#fff" />
                </View>
                <Text style={styles.blurTitle}>Contenido Premium</Text>
                <Text style={styles.blurSub}>
                  Este contenido tiene un costo de ${item.precio} USD
                </Text>
                <TouchableOpacity
                  style={[styles.buyBtnLarge, { backgroundColor: palette.primary }]}
                  onPress={() => comprarContenido(item, 'fotos_perfil')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="cart-outline" size={20} color="#fff" />
                  <Text style={styles.buyBtnTextLarge}>Comprar ahora</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          )}
        </View>
        {renderAcciones(item, 'foto')}
      </View>
    );
  };

  const renderOpinion = ({ item }) => {
    const esPagado = item.precio > 0;
    const esDueno = currentUser?.id === item.user_id;
    const yaComprado = compras.includes(item.id);
    const bloqueado = esPagado && !esDueno && !yaComprado;

    return (
      <View style={styles.opinionCard}>
        {renderPostHeader(item, false, true)}
        {bloqueado ? (
          <View style={[styles.opinionBloqueada, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
            <Ionicons name="lock-closed-outline" size={24} color={palette.textMuted} />
            <Text style={styles.opinionBloqueadaText}>
              Opinión de pago — ${item.precio} USD
            </Text>
            <TouchableOpacity
              style={[styles.buyBtnSmall, { backgroundColor: palette.primary }]}
              onPress={() => comprarContenido(item, 'opiniones')}
            >
              <Ionicons name="cart-outline" size={14} color="#fff" />
              <Text style={styles.buyBtnTextSmall}>Desbloquear</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.opinionTexto}>{item.contenido}</Text>
        )}
        {renderAcciones(item, 'opinion')}
      </View>
    );
  };

  const renderVideo = ({ item }) => {
    const esPagado = item.precio > 0;
    const esDueno = currentUser?.id === item.user_id;
    const yaComprado = compras.includes(item.id);
    const bloqueado = esPagado && !esDueno && !yaComprado;

    return (
      <View style={styles.videoCard}>
        {renderPostHeader(item, true, true)}
        <View style={{ position: 'relative', overflow: 'hidden' }}>
          <View style={styles.videoThumb}>
            {item.thumbnail_url
              ? <Image source={{ uri: item.thumbnail_url }} style={styles.videoThumbImg} resizeMode="cover" />
              : <View style={[styles.videoThumbPlaceholder, { backgroundColor: palette.panelSoft }]}>
                  <Ionicons name="videocam-outline" size={48} color={palette.textMuted} />
                </View>
            }
            {!bloqueado && (
              <View style={styles.playBtn}>
                <Ionicons name="play-circle" size={56} color="rgba(255,255,255,0.9)" />
              </View>
            )}
          </View>
          {bloqueado && (
            <BlurView intensity={120} tint="dark" style={[StyleSheet.absoluteFill, styles.blurContainer]}>
              <View style={styles.lockOverlay}>
                <View style={[styles.lockIconBox, { backgroundColor: palette.primary }]}>
                  <Ionicons name="lock-closed" size={32} color="#fff" />
                </View>
                <Text style={styles.blurTitle}>Video Premium</Text>
                <Text style={styles.blurSub}>${item.precio} USD</Text>
                <TouchableOpacity
                  style={[styles.buyBtnLarge, { backgroundColor: palette.primary }]}
                  onPress={() => comprarContenido(item, 'videos')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="cart-outline" size={20} color="#fff" />
                  <Text style={styles.buyBtnTextLarge}>Comprar ahora</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          )}
        </View>
        {item.descripcion
          ? <Text style={styles.videoDesc}>{item.descripcion}</Text>
          : null
        }
        {renderAcciones(item, 'video')}
      </View>
    );
  };

  const renderVacio = (icon, msg) => (
    <View style={styles.emptyBox}>
      <Ionicons name={icon} size={52} color={palette.textMuted} />
      <Text style={styles.emptyText}>{msg}</Text>
      <Text style={styles.emptySubtext}>Sé el primero en publicar</Text>
    </View>
  );

  return (
    <View style={styles.wrapper}>

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={[styles.logo, { color: palette.primary }]}>⚡ KLIC</Text>
        <TouchableOpacity>
          <Ionicons name="notifications-outline" size={24} color={palette.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            style={styles.tab}
            onPress={() => animarATab(i)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabText,
              tabIndex === i && { color: palette.primary, fontWeight: '700' }
            ]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
        <Animated.View style={[
          styles.tabIndicator,
          {
            backgroundColor: palette.primary,
            width: SCREEN_WIDTH / TABS.length,
            transform: [{ translateX: tabIndicatorX }]
          }
        ]} />
      </View>

      {/* Contenido */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <Animated.View
          style={[styles.slidesContainer, { transform: [{ translateX }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.slide}>
            <FlatList
              data={fotos}
              keyExtractor={item => item.id}
              renderItem={renderFoto}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
              }
              ListEmptyComponent={renderVacio('images-outline', 'No hay fotos aún')}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
            />
          </View>

          <View style={styles.slide}>
            <FlatList
              data={opiniones}
              keyExtractor={item => item.id}
              renderItem={renderOpinion}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
              }
              ListEmptyComponent={renderVacio('chatbubbles-outline', 'No hay opiniones aún')}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
            />
          </View>

          <View style={styles.slide}>
            <FlatList
              data={videos}
              keyExtractor={item => item.id}
              renderItem={renderVideo}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
              }
              ListEmptyComponent={renderVacio('videocam-outline', 'No hay videos aún')}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
            />
          </View>
        </Animated.View>
      )}

      <MainMenu navigation={navigation} active="Home" />
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 52, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  logo: { fontSize: 22, fontWeight: '900', letterSpacing: 2 },

  tabsRow: {
    flexDirection: 'row', position: 'relative',
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabText: { color: palette.textMuted, fontSize: 14, fontWeight: '600' },
  tabIndicator: {
    position: 'absolute', bottom: 0, left: 0,
    height: 2, borderRadius: 2,
  },

  slidesContainer: {
    flex: 1, flexDirection: 'row',
    width: SCREEN_WIDTH * TABS.length,
  },
  slide: { width: SCREEN_WIDTH, flex: 1 },

  postCard: {
    backgroundColor: palette.panel,
    borderBottomWidth: 1, borderBottomColor: palette.border,
    marginBottom: 2,
  },
  postHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, gap: 10,
  },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarInitial: { fontSize: 18, fontWeight: '800' },
  postNombre: { color: palette.text, fontWeight: '700', fontSize: 14 },
  postFecha: { color: palette.textMuted, fontSize: 12 },

  priceTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm,
  },
  priceTagText: { fontSize: 12, fontWeight: '800' },

  klicBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: radii.pill,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  klicBtnText: { fontSize: 12, fontWeight: '700' },

  postImage: { width: '100%', height: 340 },

  blurContainer: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(7,7,11,0.95)',
  },
  lockOverlay: {
    alignItems: 'center', justifyContent: 'center',
    padding: 24, width: '100%',
  },
  lockIconBox: {
    width: 70, height: 70, borderRadius: 35,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, elevation: 12,
  },
  blurTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 6 },
  blurSub: {
    color: 'rgba(255,255,255,0.8)', fontSize: 14,
    marginBottom: 24, textAlign: 'center',
  },
  buyBtnLarge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 32, paddingVertical: 16, borderRadius: radii.pill,
    shadowOpacity: 0.4, shadowRadius: 15, elevation: 8,
  },
  buyBtnTextLarge: { color: '#fff', fontWeight: '900', fontSize: 16 },

  postActions: {
    flexDirection: 'row', paddingHorizontal: 8,
    paddingVertical: 10, gap: 2,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4, paddingVertical: 6,
  },
  actionCount: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },

  opinionCard: {
    backgroundColor: palette.panel,
    borderBottomWidth: 1, borderBottomColor: palette.border,
    marginBottom: 2,
  },
  opinionTexto: {
    color: palette.text, fontSize: 15,
    lineHeight: 22, paddingHorizontal: 16, paddingBottom: 12,
  },
  opinionBloqueada: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, margin: 12, padding: 14,
    borderRadius: radii.md, borderWidth: 1,
  },
  opinionBloqueadaText: {
    flex: 1, color: palette.textMuted,
    fontSize: 13, fontWeight: '600',
  },
  buyBtnSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill,
  },
  buyBtnTextSmall: { color: '#fff', fontWeight: '700', fontSize: 12 },

  videoCard: {
    backgroundColor: palette.panel,
    borderBottomWidth: 1, borderBottomColor: palette.border,
    marginBottom: 2,
  },
  videoThumb: {
    width: '100%', height: 220,
    justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  videoThumbImg: { width: '100%', height: '100%' },
  videoThumbPlaceholder: {
    width: '100%', height: '100%',
    justifyContent: 'center', alignItems: 'center',
  },
  playBtn: {
    position: 'absolute',
    justifyContent: 'center', alignItems: 'center',
  },
  videoDesc: {
    color: palette.textMuted, fontSize: 13,
    paddingHorizontal: 16, paddingBottom: 8,
  },

  emptyBox: {
    alignItems: 'center', padding: 48,
    margin: 20, gap: 8,
    backgroundColor: palette.panel,
    borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border,
  },
  emptyText: { color: palette.text, fontSize: 16, fontWeight: '700' },
  emptySubtext: { color: palette.textMuted, fontSize: 13 },
});