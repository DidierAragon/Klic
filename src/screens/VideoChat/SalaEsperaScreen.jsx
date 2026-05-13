import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Animated, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

export default function SalaEsperaScreen({ navigation }) {
  const { palette } = useTema();
  const [buscando, setBuscando] = useState(false);
  const [usuariosEnLinea, setUsuariosEnLinea] = useState(0);
  const [tiempoEspera, setTiempoEspera] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);
  const sesionIdRef = useRef(null);
  const canalColaRef = useRef(null);
  const canalSesionRef = useRef(null);

  // Animación de pulso
  const iniciarPulso = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  };

  const detenerPulso = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  // Animación de rotación para el ícono de búsqueda
  const iniciarRotacion = () => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();
  };

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Cargar usuario actual
  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    cargar();
  }, []);

  // Escuchar usuarios en línea en la cola
  useEffect(() => {
    const canal = supabase
      .channel('cola-presencia')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'video_cola',
      }, () => {
        contarUsuarios();
      })
      .subscribe();

    contarUsuarios();

    return () => supabase.removeChannel(canal);
  }, []);

  const contarUsuarios = async () => {
    const { count } = await supabase
      .from('video_cola')
      .select('*', { count: 'exact', head: true });
    setUsuariosEnLinea(count || 0);
  };

  // Timer de espera
  const iniciarTimer = () => {
    timerRef.current = setInterval(() => {
      setTiempoEspera(prev => prev + 1);
    }, 1000);
  };

  const detenerTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTiempoEspera(0);
  };

  const formatearTiempo = (segundos) => {
    const m = Math.floor(segundos / 60).toString().padStart(2, '0');
    const s = (segundos % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Entrar a la cola
  const entrarCola = async () => {
    if (!currentUser) return;
    try {
      // Insertar en la cola (UNIQUE evita duplicados)
      await supabase.from('video_cola').upsert({
        user_id: currentUser.id,
        en_espera_desde: new Date().toISOString(),
      });

      setBuscando(true);
      iniciarPulso();
      iniciarRotacion();
      iniciarTimer();

      // Escuchar si alguien nos empareja
      escucharEmparejamiento();

      // Intentar emparejar inmediatamente
      await intentarEmparejar();
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // Salir de la cola
  const salirCola = async () => {
    if (!currentUser) return;
    try {
      await supabase.from('video_cola').delete().eq('user_id', currentUser.id);

      if (canalColaRef.current) {
        supabase.removeChannel(canalColaRef.current);
        canalColaRef.current = null;
      }
      if (canalSesionRef.current) {
        supabase.removeChannel(canalSesionRef.current);
        canalSesionRef.current = null;
      }

      setBuscando(false);
      detenerPulso();
      detenerTimer();
      rotateAnim.stopAnimation();
      rotateAnim.setValue(0);
    } catch (e) {
      console.warn(e);
    }
  };

  // Intentar emparejar con otro usuario en cola
  const intentarEmparejar = async () => {
    if (!currentUser) return;
    try {
      // Buscar otro usuario en cola que no seamos nosotros
      const { data: otros } = await supabase
        .from('video_cola')
        .select('user_id, en_espera_desde')
        .neq('user_id', currentUser.id)
        .order('en_espera_desde', { ascending: true })
        .limit(1);

      if (!otros || otros.length === 0) return; // Nadie más en cola

      const otro = otros[0];

      // Crear sesión
      const { data: sesion, error } = await supabase
        .from('video_sesiones')
        .insert({
          user1_id: currentUser.id,
          user2_id: otro.user_id,
          estado: 'conectando',
          inicio: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) return;

      sesionIdRef.current = sesion.id;

      // Eliminar ambos de la cola
      await supabase.from('video_cola').delete()
        .in('user_id', [currentUser.id, otro.user_id]);

      // Ir a la llamada como caller (quien inicia)
      irALlamada(sesion.id, otro.user_id, true);
    } catch (e) {
      console.warn('emparejar error:', e);
    }
  };

  // Escuchar si otro usuario nos empareja
  const escucharEmparejamiento = () => {
    if (!currentUser) return;

    const canal = supabase
      .channel(`sesion-usuario-${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'video_sesiones',
        filter: `user2_id=eq.${currentUser.id}`,
      }, (payload) => {
        const sesion = payload.new;
        if (sesion.estado === 'conectando') {
          sesionIdRef.current = sesion.id;
          irALlamada(sesion.id, sesion.user1_id, false);
        }
      })
      .subscribe();

    canalSesionRef.current = canal;
  };

  const irALlamada = (sesionId, otroUserId, esCaller) => {
    detenerTimer();
    detenerPulso();
    rotateAnim.stopAnimation();
    setBuscando(false);

    navigation.replace('VideoCall', {
      sesionId,
      otroUserId,
      esCaller,
    });
  };

  // Limpiar al salir de la pantalla
  useFocusEffect(
    useCallback(() => {
      return () => {
        salirCola();
      };
    }, [currentUser])
  );

  const styles = makeStyles(palette);

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => { salirCola(); navigation.goBack(); }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Video Chat</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>

        {/* Contador de usuarios en línea */}
        <View style={[styles.onlineCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <View style={[styles.onlineDot, { backgroundColor: palette.secondary }]} />
          <Text style={[styles.onlineText, { color: palette.text }]}>
            <Text style={[styles.onlineNum, { color: palette.secondary }]}>{usuariosEnLinea}</Text>
            {' '}usuario{usuariosEnLinea !== 1 ? 's' : ''} en línea ahora
          </Text>
        </View>

        {/* Animación central */}
        <View style={styles.animContainer}>
          {buscando ? (
            <>
              {/* Anillos de pulso */}
              <Animated.View style={[
                styles.pulseRing,
                { borderColor: palette.primary + '30', transform: [{ scale: pulseAnim }] }
              ]} />
              <Animated.View style={[
                styles.pulseRingInner,
                { borderColor: palette.primary + '50', transform: [{ scale: pulseAnim }] }
              ]} />

              {/* Ícono central girando */}
              <View style={[styles.iconCenter, { backgroundColor: palette.primary }]}>
                <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
                  <Ionicons name="search" size={36} color="#fff" />
                </Animated.View>
              </View>
            </>
          ) : (
            <View style={[styles.iconCenter, { backgroundColor: palette.primary + '22', borderWidth: 2, borderColor: palette.primary }]}>
              <Ionicons name="videocam-outline" size={48} color={palette.primary} />
            </View>
          )}
        </View>

        {/* Texto de estado */}
        {buscando ? (
          <View style={styles.statusBox}>
            <Text style={[styles.statusTitle, { color: palette.text }]}>Buscando pareja...</Text>
            <Text style={[styles.statusTimer, { color: palette.primary }]}>
              {formatearTiempo(tiempoEspera)}
            </Text>
            <Text style={[styles.statusSub, { color: palette.textMuted }]}>
              Conectando con alguien disponible
            </Text>
          </View>
        ) : (
          <View style={styles.statusBox}>
            <Text style={[styles.statusTitle, { color: palette.text }]}>Chat de video aleatorio</Text>
            <Text style={[styles.statusSub, { color: palette.textMuted }]}>
              Conéctate con personas al azar en tiempo real. Pulsa el botón para comenzar.
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={[styles.infoRow, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <View style={styles.infoItem}>
            <Ionicons name="videocam-outline" size={20} color={palette.primary} />
            <Text style={[styles.infoText, { color: palette.textMuted }]}>Video y audio</Text>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: palette.border }]} />
          <View style={styles.infoItem}>
            <Ionicons name="shuffle-outline" size={20} color={palette.primary} />
            <Text style={[styles.infoText, { color: palette.textMuted }]}>Aleatorio</Text>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: palette.border }]} />
          <View style={styles.infoItem}>
            <Ionicons name="shield-checkmark-outline" size={20} color={palette.primary} />
            <Text style={[styles.infoText, { color: palette.textMuted }]}>Seguro</Text>
          </View>
        </View>

        {/* Botón principal */}
        {!buscando ? (
          <TouchableOpacity
            style={[styles.btnIniciar, { backgroundColor: palette.primary, shadowColor: palette.primary }]}
            onPress={entrarCola}
            activeOpacity={0.85}
          >
            <Ionicons name="videocam" size={24} color="#fff" />
            <Text style={styles.btnIniciarText}>Iniciar video chat</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btnCancelar, { borderColor: palette.danger, backgroundColor: palette.danger + '15' }]}
            onPress={salirCola}
            activeOpacity={0.85}
          >
            <Ionicons name="close-circle-outline" size={22} color={palette.danger} />
            <Text style={[styles.btnCancelarText, { color: palette.danger }]}>Cancelar búsqueda</Text>
          </TouchableOpacity>
        )}

        {/* Aviso */}
        <Text style={[styles.aviso, { color: palette.textMuted }]}>
          Al usar el video chat aceptas el uso responsable de la plataforma. El comportamiento inapropiado puede resultar en la suspensión de tu cuenta.
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8, paddingTop: 52, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800' },

  content: {
    flex: 1, paddingHorizontal: 24,
    paddingTop: 24, paddingBottom: 32,
    alignItems: 'center', gap: 20,
  },

  // Online card
  onlineCard: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: radii.pill, borderWidth: 1,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { fontSize: 14, fontWeight: '600' },
  onlineNum: { fontWeight: '800', fontSize: 16 },

  // Animación
  animContainer: {
    width: 180, height: 180,
    alignItems: 'center', justifyContent: 'center',
    marginVertical: 8,
  },
  pulseRing: {
    position: 'absolute',
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 2,
  },
  pulseRingInner: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 2,
  },
  iconCenter: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
  },

  // Status
  statusBox: { alignItems: 'center', gap: 6 },
  statusTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  statusTimer: { fontSize: 36, fontWeight: '900' },
  statusSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },

  // Info row
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radii.lg, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 8,
    width: '100%',
  },
  infoItem: { flex: 1, alignItems: 'center', gap: 6 },
  infoText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  infoDivider: { width: 1, height: 32 },

  // Botones
  btnIniciar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    width: '100%', paddingVertical: 18,
    borderRadius: radii.lg,
    shadowOpacity: 0.4, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  btnIniciarText: { color: '#fff', fontWeight: '800', fontSize: 17 },

  btnCancelar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    width: '100%', paddingVertical: 16,
    borderRadius: radii.lg, borderWidth: 1.5,
  },
  btnCancelarText: { fontWeight: '700', fontSize: 16 },

  aviso: {
    fontSize: 11, textAlign: 'center',
    lineHeight: 16, maxWidth: 300,
  },
});
