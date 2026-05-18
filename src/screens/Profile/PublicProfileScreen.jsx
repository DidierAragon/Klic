import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Platform, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';
import { useStats } from '../../hooks/useStats';
import { enviarSolicitudAmistad } from '../../utils/amigos';
import KlicCoin from '../../components/KlicCoin';
import EnviarPropinaModal from '../../components/EnviarPropinaModal';
import DesbloquearContenidoModal from '../../components/DesbloquearContenidoModal';

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

  // Estados de suscripción y compras
  const [suscripcion, setSuscripcion] = useState(null);
  const [compras, setCompras] = useState([]);
  const [tipModalVisible, setTipModalVisible] = useState(false);
  const [pagandoSub, setPagandoSub] = useState(false);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // Estados de cupones de descuento
  const [codigoInput, setCodigoInput] = useState('');
  const [cangueando, setCangueando] = useState(false);
  const [cuponAplicado, setCuponAplicado] = useState(false);
  const [codigoCanjeado, setCodigoCanjeado] = useState('');
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0);

  // Estados de desbloqueo de contenido individual
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);
  const [unlockItem, setUnlockItem] = useState(null);

  const handleUnlockSuccess = (itemId) => {
    setCompras(prev => [...prev, itemId]);
  };

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

      const [{ data: profileData }, { data: fotosData }, { data: subData }, { data: compData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).maybeSingle(),
        supabase
          .from('fotos_perfil')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        user
          ? supabase
              .from('suscripciones')
              .select('id, status, current_period_end')
              .eq('subscriber_id', user.id)
              .eq('creator_id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        user
          ? supabase
              .from('compras')
              .select('post_id')
              .eq('user_id', user.id)
          : Promise.resolve({ data: null }),
      ]);

      setProfile(profileData || null);
      setFotos(fotosData || []);
      setSuscripcion(subData || null);
      setCompras(compData ? compData.map(c => c.post_id) : []);

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

  const precioConDescuento = cuponAplicado
    ? (profile.precio_suscripcion * (1 - descuentoPorcentaje / 100)).toFixed(2)
    : profile.precio_suscripcion;

  const validarYCanjearCodigo = async () => {
    const cleanCode = codigoInput.trim().toUpperCase();
    if (!cleanCode) return;

    setCangueando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Inicia sesión', 'Debes iniciar sesión para canjear un cupón.');
        return;
      }

      const { data, error } = await supabase.rpc('redeem_coupon', {
        p_user_id: user.id,
        p_codigo: cleanCode
      });

      if (error) throw error;
      const res = typeof data === 'string' ? JSON.parse(data) : data;

      if (!res.success) {
        throw new Error(res.message || 'Código inválido');
      }

      Alert.alert('✓ ¡Canjeado!', res.message);

      if (res.porcentaje === 100) {
        setCodigoInput('');
        setCuponAplicado(false);
        cargar();
      } else {
        setDescuentoPorcentaje(res.porcentaje);
        setCodigoCanjeado(cleanCode);
        setCuponAplicado(true);
        setCodigoInput('');
      }
    } catch (e) {
      Alert.alert('Error al canjear', e.message || 'Cupón inválido o usado.');
    } finally {
      setCangueando(false);
    }
  };

  const removerCupon = () => {
    setCuponAplicado(false);
    setCodigoCanjeado('');
    setDescuentoPorcentaje(0);
  };

  const suscribirseAlCreador = async () => {
    if (!currentUser) return Alert.alert('Sesión', 'Inicia sesión para suscribirte');
    setPagandoSub(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/create-stripe-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          creatorId: userId,
          discountPercentage: descuentoPorcentaje,
          couponCode: codigoCanjeado
        }),
      });

      const resData = await response.json();
      if (!response.ok || resData.error) {
        throw new Error(resData.error || 'No se pudo iniciar la suscripción');
      }

      const { clientSecret, customerId, ephemeralKey, subscriptionId } = resData;

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        customerId: customerId,
        customerEphemeralKeySecret: ephemeralKey,
        merchantDisplayName: `Membresía Premium ${profile.nombre}`,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: { email: currentUser.email },
      });

      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') return;
        throw new Error(presentError.message);
      }

      // Sincronizar en BD local de inmediato
      const { error: updErr } = await supabase
        .from('suscripciones')
        .update({ status: 'active' })
        .eq('stripe_subscription_id', subscriptionId);

      if (updErr) console.warn("Error actualizando status a active:", updErr);

      // Si había un cupón parcial activo, consumirlo
      if (cuponAplicado && codigoCanjeado) {
        await supabase.rpc('mark_coupon_used', {
          p_user_id: currentUser.id,
          p_codigo: codigoCanjeado
        });
        removerCupon();
      }

      Alert.alert(
        '🎉 ¡Suscripción Activa!',
        `Te has suscrito con éxito a la membresía de ${profile.nombre}. ¡Ya puedes acceder a todo su contenido premium!`,
        [{ text: 'Excelente', onPress: () => cargar() }]
      );
    } catch (e) {
      Alert.alert('Error de Suscripción', e.message || 'Ocurrió un error al procesar el pago.');
    } finally {
      setPagandoSub(false);
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

              {/* Botón de Propina */}
              <TouchableOpacity
                style={[
                  styles.accionBtn, 
                  { 
                    borderColor: palette.primary, 
                    backgroundColor: palette.primary + '18' 
                  }
                ]}
                onPress={() => setTipModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="gift-outline" size={18} color={palette.primary} />
                <Text style={[styles.accionBtnText, { color: palette.primary }]}>Propina</Text>
              </TouchableOpacity>
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

        {profile.precio_suscripcion > 0 ? (
          <View style={[styles.subCard, { backgroundColor: palette.panel, borderColor: palette.primary + '33' }]}>
            <View style={styles.subCardHeader}>
              <Ionicons name="sparkles" size={24} color={palette.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.subCardTitle, { color: palette.text }]}>
                  {profile.nombre_suscripcion || 'Suscripción Premium'}
                </Text>
                <Text style={[styles.subCardPrice, { color: palette.primary }]}>
                  {cuponAplicado ? (
                    <Text>
                      <Text style={{ textDecorationLine: 'line-through', opacity: 0.6, fontSize: 13 }}>
                        ${profile.precio_suscripcion}
                      </Text>{' '}
                      ${precioConDescuento} USD / mes
                    </Text>
                  ) : (
                    `$${profile.precio_suscripcion} USD / mes`
                  )}
                </Text>
              </View>
            </View>
            
            <Text style={[styles.subCardDesc, { color: palette.textMuted }]}>
              {profile.descripcion_suscripcion || `Suscríbete para apoyar directamente a ${profile.nombre} y obtener acceso ilimitado a todo su contenido premium.`}
            </Text>

            <View style={styles.subBenefitsList}>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color={palette.secondary} />
                <Text style={[styles.benefitText, { color: palette.text }]}>Acceso completo a fotos premium</Text>
              </View>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color={palette.secondary} />
                <Text style={[styles.benefitText, { color: palette.text }]}>Desbloqueo total de videos exclusivos</Text>
              </View>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color={palette.secondary} />
                <Text style={[styles.benefitText, { color: palette.text }]}>Lectura de opiniones premium</Text>
              </View>
            </View>

            {suscripcion?.status === 'active' ? (
              <View style={[styles.btnSubscribed, { backgroundColor: palette.secondary + '12', borderColor: palette.secondary }]}>
                <Ionicons name="checkmark-circle" size={18} color={palette.secondary} />
                <Text style={[styles.btnSubscribedText, { color: palette.secondary }]}>Suscripción Activa</Text>
              </View>
            ) : (
              <View>
                <TouchableOpacity
                  style={[styles.btnSubscribe, { backgroundColor: palette.primary }]}
                  onPress={suscribirseAlCreador}
                  activeOpacity={0.8}
                  disabled={pagandoSub}
                >
                  {pagandoSub ? (
                    <ActivityIndicator size="small" color="#07070b" />
                  ) : (
                    <>
                      <Ionicons name="flash" size={16} color="#07070b" />
                      <Text style={styles.btnSubscribeText}>
                        {cuponAplicado ? `Pagar con Descuento ($${precioConDescuento} USD)` : 'Suscribirse Ahora'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Sección de Canje de Cupones */}
                <View style={styles.couponSection}>
                  {cuponAplicado ? (
                    <View style={[styles.couponAppliedRow, { backgroundColor: '#10b9811c', borderColor: '#10b98155' }]}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                        <Text style={{ color: '#10b981', fontSize: 12.5, fontWeight: '800' }}>
                          Cupón "{codigoCanjeado}" Aplicado (-{descuentoPorcentaje}%)
                        </Text>
                      </View>
                      <TouchableOpacity onPress={removerCupon} hitSlop={10}>
                        <Ionicons name="close-circle" size={18} color={palette.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.couponInputRow}>
                      <TextInput
                        style={[styles.couponInput, {
                          backgroundColor: palette.panelSoft,
                          borderColor: palette.border,
                          color: palette.text
                        }]}
                        placeholder="¿Tienes un código de descuento? 🎫"
                        placeholderTextColor={palette.textMuted}
                        value={codigoInput}
                        onChangeText={setCodigoInput}
                        autoCapitalize="characters"
                        maxLength={18}
                        editable={!cangueando}
                      />
                      <TouchableOpacity
                        style={[styles.couponApplyBtn, { backgroundColor: palette.secondary }]}
                        onPress={validarYCanjearCodigo}
                        disabled={cangueando}
                        activeOpacity={0.8}
                      >
                        {cangueando ? (
                          <ActivityIndicator size="small" color="#07070b" />
                        ) : (
                          <Text style={styles.couponApplyBtnText}>Aplicar</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        ) : null}

        {fotos.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: palette.border, backgroundColor: palette.panel }]}>
            <Ionicons name="images-outline" size={40} color={palette.textMuted} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>Sin fotos públicas</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Fotos</Text>
            <View style={styles.grid}>
              {fotos.map((foto) => {
                const esDueno = currentUser?.id === userId;
                const yaComprado = compras.includes(foto.id);
                const esSuscriptor = suscripcion?.status === 'active';

                let bloqueado = false;
                let esSoloSuscriptor = false;

                if (!esDueno) {
                  if (foto.restriccion === 'suscriptores') {
                    bloqueado = !esSuscriptor;
                    esSoloSuscriptor = true;
                  } else if (foto.restriccion === 'pago_individual') {
                    bloqueado = foto.precio > 0 && !yaComprado;
                  } else {
                    bloqueado = foto.precio > 0 && !yaComprado && !esSuscriptor;
                  }
                }

                const handlePressLocked = () => {
                  if (bloqueado) {
                    if (esSoloSuscriptor) {
                      Alert.alert(
                        'Acceso Exclusivo',
                        'Esta foto es exclusiva para suscriptores. Únete a la membresía de pago de este creador para ver todo su contenido privado.',
                        [{ text: 'OK' }]
                      );
                    } else {
                      setUnlockItem({
                        ...foto,
                        __tabla: 'fotos_perfil',
                        users: {
                          nombre: profile?.nombre,
                          avatar_url: profile?.avatar_url
                        }
                      });
                      setUnlockModalVisible(true);
                    }
                  }
                };

                return (
                  <TouchableOpacity
                    key={foto.id}
                    style={styles.gridItem}
                    activeOpacity={bloqueado ? 0.7 : 0.9}
                    onPress={handlePressLocked}
                    disabled={!bloqueado}
                  >
                    <Image
                      source={{ uri: foto.url }}
                      style={styles.gridImage}
                      blurRadius={bloqueado ? (Platform.OS === 'ios' ? 25 : 12) : 0}
                    />
                    
                    {bloqueado && (
                      <View style={[StyleSheet.absoluteFillObject, styles.gridLockOverlay]}>
                        <Ionicons name={esSoloSuscriptor ? "sparkles" : "lock-closed"} size={22} color="#fff" />
                      </View>
                    )}

                    {foto.precio > 0 && !esSoloSuscriptor && (
                      <View style={styles.gridPriceBadge}>
                        {yaComprado || esSuscriptor ? (
                          <Ionicons name="lock-open-outline" size={11} color="#22d3ee" style={{ marginRight: 2 }} />
                        ) : (
                          <Ionicons name="lock-closed" size={11} color="#fb7185" style={{ marginRight: 2 }} />
                        )}
                        <Text style={styles.gridPriceText}>{Math.round(foto.precio * 100)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Modal de Enviar Propina */}
      <EnviarPropinaModal
        visible={tipModalVisible}
        onClose={() => setTipModalVisible(false)}
        receiverId={userId}
        creatorName={profile?.nombre || 'Creador'}
        receiverAvatarUrl={profile?.avatar_url}
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
    gridItem: { width: '32%', aspectRatio: 1, borderRadius: radii.sm, overflow: 'hidden', position: 'relative' },
    gridImage: { width: '100%', height: '100%' },
    gridLockOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(7, 7, 11, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
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

    // Suscripciones
    subCard: {
      marginVertical: 16,
      padding: 16,
      borderRadius: radii.lg,
      borderWidth: 1.5,
      gap: 12,
    },
    subCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    subCardTitle: { fontSize: 16, fontWeight: '800' },
    subCardPrice: { fontSize: 15, fontWeight: '700', marginTop: 1 },
    subCardDesc: { fontSize: 13, lineHeight: 18 },
    subBenefitsList: { gap: 6, marginVertical: 4 },
    benefitItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    benefitText: { fontSize: 12, fontWeight: '500' },
    btnSubscribe: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: radii.md,
    },
    btnSubscribeText: { color: '#07070b', fontWeight: '800', fontSize: 14 },
    btnSubscribed: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: radii.md,
      borderWidth: 1.5,
    },
    btnSubscribedText: { fontWeight: '800', fontSize: 14 },

    // Cupones de descuento
    couponSection: {
      marginTop: 12,
    },
    couponInputRow: {
      flexDirection: 'row',
      gap: 8,
    },
    couponInput: {
      flex: 1,
      height: 40,
      borderWidth: 1,
      borderRadius: radii.md,
      paddingHorizontal: 12,
      fontSize: 12,
      fontWeight: '600',
    },
    couponApplyBtn: {
      height: 40,
      paddingHorizontal: 16,
      borderRadius: radii.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    couponApplyBtnText: {
      color: '#07070b',
      fontWeight: '800',
      fontSize: 12,
    },
    couponAppliedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      borderWidth: 1,
    },
  });
