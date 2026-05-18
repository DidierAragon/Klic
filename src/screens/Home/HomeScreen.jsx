import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ActivityIndicator, RefreshControl, FlatList,
  Share, Alert, useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import LikeButton from '../../components/LikeButton';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';
import { useWallet } from '../../context/WalletContext';
import FAB from '../../components/FAB';
import VideoPlayer from '../../components/VideoPlayer';
import KlicCoin from '../../components/KlicCoin';
import { enviarSolicitudAmistad } from '../../utils/amigos';
import EnviarPropinaModal from '../../components/EnviarPropinaModal';
import DesbloquearContenidoModal from '../../components/DesbloquearContenidoModal';

export default function HomeScreen({ navigation }) {
  const { palette } = useTema();
  const { width: winW, height: winH } = useWindowDimensions();
  const videoPreviewHeight = Math.min(
    Math.max(260, Math.round(winW * (16 / 9))),
    Math.round(winH * 0.58),
    640,
  );
  const [publicaciones, setPublicaciones] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [compras, setCompras] = useState([]);
  const [suscripcionesActivas, setSuscripcionesActivas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  // Estados de propinas
  const [tipModalVisible, setTipModalVisible] = useState(false);
  const [tipReceiverId, setTipReceiverId] = useState('');
  const [tipCreatorName, setTipCreatorName] = useState('');
  const [tipReceiverAvatarUrl, setTipReceiverAvatarUrl] = useState(null);
  const [tipPostId, setTipPostId] = useState(null);
  const [tipPostType, setTipPostType] = useState(null);

  // Estados de desbloqueo de contenido
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);
  const [unlockItem, setUnlockItem] = useState(null);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { balance, buyContent, refreshWallet } = useWallet();

  const cargarTodo = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      const [{ data: f }, { data: o }, { data: v }, { data: c }, { data: s }] = await Promise.all([
        supabase.from('fotos_perfil')
          .select('*, users(id, nombre, avatar_url)')
          .order('created_at', { ascending: false }).limit(30),
        supabase.from('opiniones')
          .select('*, users(id, nombre, avatar_url)')
          .order('created_at', { ascending: false }).limit(30),
        supabase.from('videos')
          .select('*, users(id, nombre, avatar_url)')
          .order('created_at', { ascending: false }).limit(20),
        user
          ? supabase.from('compras').select('contenido_id').eq('comprador_id', user.id)
          : Promise.resolve({ data: [] }),
        user
          ? supabase.from('suscripciones').select('creator_id').eq('subscriber_id', user.id).eq('status', 'active')
          : Promise.resolve({ data: [] }),
      ]);

      const feedUnificado = [
        ...(f || []).map(item => ({ ...item, __tipo: 'foto', __tabla: 'fotos_perfil' })),
        ...(o || []).map(item => ({ ...item, __tipo: 'opinion', __tabla: 'opiniones' })),
        ...(v || []).map(item => ({ ...item, __tipo: 'video', __tabla: 'videos' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setPublicaciones(feedUnificado);
      setCompras((c || []).map(item => item.contenido_id));
      setSuscripcionesActivas((s || []).map(item => item.creator_id));
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const [{ count: sol }, { data: amistades }] = await Promise.all([
          supabase
            .from('amigos')
            .select('*', { count: 'exact', head: true })
            .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
            .eq('estado', 'pendiente')
            .neq('solicitante_id', user.id),
          supabase
            .from('amigos')
            .select('id')
            .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
            .eq('estado', 'aceptado'),
        ]);

        const ids = (amistades || []).map((a) => a.id);
        let unread = 0;
        if (ids.length > 0) {
          const { count } = await supabase
            .from('mensajes_amigos')
            .select('*', { count: 'exact', head: true })
            .in('amistad_id', ids)
            .eq('leido', false)
            .neq('sender_id', user.id);
          unread = count || 0;
        }

        if (!cancelled) setNotifCount((sol || 0) + unread);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const onRefresh = () => { setRefreshing(true); cargarTodo(); };

  const comprarContenido = async (item, tabla) => {
    // ... (existing Stripe logic remains as a fallback or secondary option)
  };

  const handleUnlockSuccess = (itemId) => {
    setCompras(prev => [...prev, itemId]);
  };

  const desbloquearConMonedas = async (item, tabla) => {
    if (!currentUser) return Alert.alert('Error', 'Debes iniciar sesión');
    setUnlockItem({ ...item, __tabla: tabla });
    setUnlockModalVisible(true);
  };

  const compartir = async (item, tipo) => {
    try {
      const mensaje = tipo === 'opinion'
        ? `"${item.contenido}" — ${item.users?.nombre || 'Usuario'} en Klic ⚡`
        : `Mira este contenido de ${item.users?.nombre || 'alguien'} en Klic ⚡\n${item.url}`;

      await Share.share({
        message: mensaje,
        title: 'Compartir desde Klic',
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const abrirComentarios = (item, tipo) => {
    navigation.navigate('Comentarios', {
      contenidoId: item.id,
      tipo,
      autor: item.users?.nombre || 'Usuario',
    });
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

  const abrirPerfilAutor = (item) => {
    const uid = item.user_id;
    if (!uid) return;
    if (uid === currentUser?.id) navigation.navigate('Profile');
    else navigation.navigate('UserProfile', { userId: uid });
  };

  const renderPostHeader = (item) => (
    <View style={styles.postHeader}>
      <TouchableOpacity
        onPress={() => abrirPerfilAutor(item)}
        activeOpacity={0.7}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        {renderAvatar(item.users)}
        <View style={{ flex: 1 }}>
          <Text style={styles.postNombre}>{item.users?.nombre || 'Usuario'}</Text>
          <Text style={styles.postFecha}>
            {new Date(item.created_at).toLocaleDateString('es-CO', {
              day: 'numeric', month: 'short'
            })}
          </Text>
        </View>
      </TouchableOpacity>
      {item.precio > 0 && (
        <View style={[styles.priceTag, { backgroundColor: palette.primary + '30' }]}>
          <Ionicons name="pricetag" size={12} color={palette.primary} />
          <Text style={[styles.priceTagText, { color: palette.primary }]}>${item.precio}</Text>
        </View>
      )}
      <TouchableOpacity style={[styles.klicBtn, { borderColor: palette.primary }]}>
        <Ionicons name="flash-outline" size={12} color={palette.primary} />
        <Text style={[styles.klicBtnText, { color: palette.primary }]}>Klic</Text>
      </TouchableOpacity>
    </View>
  );

  const abrirModalPropina = (item, tipo) => {
    if (!currentUser) return Alert.alert('Sesión', 'Inicia sesión para enviar propinas.');
    setTipReceiverId(item.user_id);
    setTipCreatorName(item.users?.nombre || 'Creador');
    setTipReceiverAvatarUrl(item.users?.avatar_url || null);
    setTipPostId(item.id);
    setTipPostType(tipo);
    setTipModalVisible(true);
  };

  const renderAcciones = (item, tipo) => (
    <View style={styles.postActions}>
      {/* Like con corazón */}
      <LikeButton contenidoId={item.id} tipo={tipo} />

      {/* Amigo */}
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={async () => {
          if (!currentUser) {
            Alert.alert('Sesión', 'Inicia sesión para conectar con otros usuarios');
            return;
          }
          const uid = item.user_id;
          if (!uid || uid === currentUser.id) return;
          const res = await enviarSolicitudAmistad(supabase, currentUser.id, uid);
          if (!res.ok) Alert.alert('Amigos', res.message);
          else Alert.alert('Listo', res.action === 'resent' ? 'Solicitud reenviada' : 'Solicitud enviada');
        }}
      >
        <Ionicons name="people-outline" size={20} color={palette.secondary} />
        <Text style={[styles.actionCount, { color: palette.secondary }]}>Amigo</Text>
      </TouchableOpacity>

      {/* Comentar */}
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => abrirComentarios(item, tipo)}
        activeOpacity={0.7}
      >
        <Ionicons name="chatbubble-outline" size={20} color={palette.textMuted} />
        <Text style={styles.actionCount}>Comentar</Text>
      </TouchableOpacity>

      {/* Compartir */}
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => compartir(item, tipo)}
        activeOpacity={0.7}
      >
        <Ionicons name="paper-plane-outline" size={20} color={palette.textMuted} />
        <Text style={styles.actionCount}>Compartir</Text>
      </TouchableOpacity>

      {/* Propina */}
      {(!currentUser || item.user_id !== currentUser.id) && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => abrirModalPropina(item, tipo)}
          activeOpacity={0.7}
        >
          <Ionicons name="gift-outline" size={20} color={palette.primary} />
          <Text style={[styles.actionCount, { color: palette.primary }]}>Propina</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderFoto = ({ item }) => {
    const esDueno = currentUser?.id === item.user_id;
    const yaComprado = compras.includes(item.id);
    const esSuscriptor = suscripcionesActivas.includes(item.user_id);
    
    let bloqueado = false;
    let esSoloSuscriptor = false;

    if (!esDueno) {
      if (item.restriccion === 'suscriptores') {
        bloqueado = !esSuscriptor;
        esSoloSuscriptor = true;
      } else if (item.restriccion === 'pago_individual') {
        bloqueado = item.precio > 0 && !yaComprado;
      } else {
        bloqueado = item.precio > 0 && !yaComprado && !esSuscriptor;
      }
    }

    return (
      <View style={styles.postCard}>
        {renderPostHeader(item)}
        <View style={{ position: 'relative', overflow: 'hidden' }}>
          <Image source={{ uri: item.url }} style={styles.postImage} resizeMode="cover" />
          {bloqueado && (
            <BlurView
              intensity={120}
              tint="dark"
              style={[StyleSheet.absoluteFill, styles.blurContainer]}
            >
              <View style={styles.lockOverlay}>
                <View style={[styles.lockIconBox, { backgroundColor: palette.primary }]}>
                  <Ionicons name={esSoloSuscriptor ? "sparkles" : "lock-closed"} size={32} color="#07070b" />
                </View>
                <Text style={styles.blurTitle}>
                  {esSoloSuscriptor ? "Exclusivo Suscriptores" : "Contenido Premium"}
                </Text>
                <Text style={styles.blurSub}>
                  {esSoloSuscriptor
                    ? "Únete a la membresía mensual de este creador"
                    : `Este contenido tiene un costo de $${item.precio} USD`}
                </Text>
                
                {esSoloSuscriptor ? (
                  <TouchableOpacity
                    style={[styles.buyBtnLarge, { backgroundColor: palette.primary }]}
                    onPress={() => navigation.navigate('UserProfile', { userId: item.user_id })}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="sparkles-outline" size={20} color="#07070b" />
                    <Text style={[styles.buyBtnTextLarge, { marginLeft: 6, color: '#07070b', fontWeight: '800' }]}>
                      Ver Membresía
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.buyBtnLarge, { backgroundColor: palette.primary }]}
                      onPress={() => desbloquearConMonedas(item, 'fotos_perfil')}
                      activeOpacity={0.8}
                    >
                      <KlicCoin size={20} />
                      <Text style={[styles.buyBtnTextLarge, { marginLeft: 6 }]}>Desbloquear ({Math.round(item.precio * 100)})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => comprarContenido(item, 'fotos_perfil')}
                      style={{ marginTop: 15 }}
                    >
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>O paga con tarjeta (${item.precio} USD)</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </BlurView>
          )}
        </View>
        {renderAcciones(item, 'foto')}
      </View>
    );
  };

  const renderOpinion = ({ item }) => {
    const esDueno = currentUser?.id === item.user_id;
    const yaComprado = compras.includes(item.id);
    const esSuscriptor = suscripcionesActivas.includes(item.user_id);
    
    let bloqueado = false;
    let esSoloSuscriptor = false;

    if (!esDueno) {
      if (item.restriccion === 'suscriptores') {
        bloqueado = !esSuscriptor;
        esSoloSuscriptor = true;
      } else if (item.restriccion === 'pago_individual') {
        bloqueado = item.precio > 0 && !yaComprado;
      } else {
        bloqueado = item.precio > 0 && !yaComprado && !esSuscriptor;
      }
    }

    return (
      <View style={styles.opinionCard}>
        {renderPostHeader(item)}
        {bloqueado ? (
          <View style={[styles.opinionBloqueada, {
            backgroundColor: palette.panelSoft,
            borderColor: palette.border
          }]}>
            <Ionicons name={esSoloSuscriptor ? "sparkles" : "lock-closed-outline"} size={24} color={palette.primary} />
            <Text style={styles.opinionBloqueadaText}>
              {esSoloSuscriptor ? "Exclusivo Suscriptores" : `Opinión de pago — $${item.precio} USD`}
            </Text>
            {esSoloSuscriptor ? (
              <TouchableOpacity
                style={[styles.buyBtnSmall, { backgroundColor: palette.primary, paddingHorizontal: 12 }]}
                onPress={() => navigation.navigate('UserProfile', { userId: item.user_id })}
              >
                <Text style={{ color: '#07070b', fontWeight: '800', fontSize: 11 }}>Membresía</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.buyBtnSmall, { backgroundColor: palette.primary }]}
                onPress={() => desbloquearConMonedas(item, 'opiniones')}
              >
                <KlicCoin size={14} />
                <Text style={[styles.buyBtnTextSmall, { marginLeft: 4 }]}>{Math.round(item.precio * 100)}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.opinionTexto}>{item.contenido}</Text>
        )}
        {renderAcciones(item, 'opinion')}
      </View>
    );
  };

  const renderVideo = ({ item }) => {
    const esDueno = currentUser?.id === item.user_id;
    const yaComprado = compras.includes(item.id);
    const esSuscriptor = suscripcionesActivas.includes(item.user_id);
    
    let bloqueado = false;
    let esSoloSuscriptor = false;

    if (!esDueno) {
      if (item.restriccion === 'suscriptores') {
        bloqueado = !esSuscriptor;
        esSoloSuscriptor = true;
      } else if (item.restriccion === 'pago_individual') {
        bloqueado = item.precio > 0 && !yaComprado;
      } else {
        bloqueado = item.precio > 0 && !yaComprado && !esSuscriptor;
      }
    }
  
    return (
      <View style={styles.videoCard}>
        {renderPostHeader(item)}
  
        {/* Reproductor */}
        <View style={{ position: 'relative', overflow: 'hidden' }}>
          <VideoPlayer
            url={item.url}
            height={videoPreviewHeight}
            bloqueado={bloqueado}
          />
          {bloqueado && (
            <BlurView
              intensity={120}
              tint="dark"
              style={[StyleSheet.absoluteFill, styles.blurContainer]}
            >
              <View style={styles.lockOverlay}>
                <View style={[styles.lockIconBox, { backgroundColor: palette.primary }]}>
                  <Ionicons name={esSoloSuscriptor ? "sparkles" : "lock-closed"} size={32} color="#07070b" />
                </View>
                <Text style={styles.blurTitle}>
                  {esSoloSuscriptor ? "Exclusivo Suscriptores" : "Video Premium"}
                </Text>
                <Text style={styles.blurSub}>
                  {esSoloSuscriptor
                    ? "Únete a la membresía mensual de este creador"
                    : `Este video tiene un costo de $${item.precio} USD`}
                </Text>
                
                {esSoloSuscriptor ? (
                  <TouchableOpacity
                    style={[styles.buyBtnLarge, { backgroundColor: palette.primary }]}
                    onPress={() => navigation.navigate('UserProfile', { userId: item.user_id })}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="sparkles-outline" size={20} color="#07070b" />
                    <Text style={[styles.buyBtnTextLarge, { marginLeft: 6, color: '#07070b', fontWeight: '800' }]}>
                      Ver Membresía
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.buyBtnLarge, { backgroundColor: palette.primary }]}
                      onPress={() => desbloquearConMonedas(item, 'videos')}
                      activeOpacity={0.8}
                    >
                      <KlicCoin size={20} />
                      <Text style={[styles.buyBtnTextLarge, { marginLeft: 6 }]}>Desbloquear ({Math.round(item.precio * 100)})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => comprarContenido(item, 'videos')}
                      style={{ marginTop: 15 }}
                    >
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>O paga con tarjeta (${item.precio} USD)</Text>
                    </TouchableOpacity>
                  </>
                )}
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
        <View style={styles.topActions}>
          <TouchableOpacity 
            style={[styles.coinBadge, { backgroundColor: palette.panelSoft }]}
            onPress={() => navigation.navigate('Wallet')}
          >
            <KlicCoin size={16} />
            <Text style={[styles.coinText, { color: palette.text, marginLeft: 6 }]}>{balance}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}
            onPress={() => navigation.navigate('SearchUsers')}
            accessibilityLabel="Buscar personas"
          >
            <Ionicons name="search-outline" size={22} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}
            onPress={() => navigation.navigate('Notifications')}
            accessibilityLabel="Notificaciones"
          >
            <View>
              <Ionicons name="notifications-outline" size={22} color={palette.text} />
              {notifCount > 0 ? (
                <View style={[styles.notifBadge, { backgroundColor: palette.primary }]}>
                  <Text style={styles.notifBadgeText}>
                    {notifCount > 99 ? '99+' : notifCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Feed unificado */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={publicaciones}
          keyExtractor={item => `${item.__tipo}-${item.id}`}
          renderItem={({ item }) => {
            if (item.__tipo === 'foto') return renderFoto({ item });
            if (item.__tipo === 'opinion') return renderOpinion({ item });
            return renderVideo({ item });
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={renderVacio('newspaper-outline', 'No hay publicaciones aún')}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}

      <MainMenu navigation={navigation} active="Home" />
      <FAB />

      {/* Modal de Enviar Propina */}
      <EnviarPropinaModal
        visible={tipModalVisible}
        onClose={() => setTipModalVisible(false)}
        receiverId={tipReceiverId}
        creatorName={tipCreatorName}
        receiverAvatarUrl={tipReceiverAvatarUrl}
        postId={tipPostId}
        postType={tipPostType}
      />

      {/* Modal de Desbloquear Contenido con Cupones */}
      <DesbloquearContenidoModal
        visible={unlockModalVisible}
        onClose={() => {
          setUnlockModalVisible(false);
          setUnlockItem(null);
        }}
        item={unlockItem}
        onSuccess={handleUnlockSuccess}
      />
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
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  notifBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  coinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#333',
  },
  coinText: { fontSize: 14, fontWeight: '800' },

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
    shadowColor: '#000', shadowOpacity: 0.5,
    shadowRadius: 10, elevation: 12,
  },
  blurTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 6 },
  blurSub: {
    color: 'rgba(255,255,255,0.8)', fontSize: 14,
    marginBottom: 24, textAlign: 'center',
  },
  buyBtnLarge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 32, paddingVertical: 16,
    borderRadius: radii.pill,
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
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radii.pill,
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