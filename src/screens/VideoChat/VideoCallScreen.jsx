import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Animated, Modal,
  ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  RTCView,
} from 'react-native-webrtc';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const MOTIVOS_REPORTE = [
  { key: 'contenido_inapropiado', label: 'Contenido inapropiado', icon: 'eye-off-outline' },
  { key: 'acoso', label: 'Acoso o intimidación', icon: 'warning-outline' },
  { key: 'spam', label: 'Spam o publicidad', icon: 'megaphone-outline' },
  { key: 'menor_de_edad', label: 'Posible menor de edad', icon: 'person-outline' },
  { key: 'otro', label: 'Otro motivo', icon: 'ellipsis-horizontal-outline' },
];

export default function VideoCallScreen({ navigation, route }) {
  const { sesionId, otroUserId, esCaller } = route.params;
  const { palette } = useTema();

  const [conectando, setConectando] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [mutedAudio, setMutedAudio] = useState(false);
  const [mutedVideo, setMutedVideo] = useState(false);
  const [camaraFrontal, setCamaraFrontal] = useState(true);
  const [modalReporte, setModalReporte] = useState(false);
  const [motivoReporte, setMotivoReporte] = useState(null);
  const [descripcionReporte, setDescripcionReporte] = useState('');
  const [enviandoReporte, setEnviandoReporte] = useState(false);
  const [duracion, setDuracion] = useState(0);
  const [otroUsuario, setOtroUsuario] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const canalRef = useRef(null);
  const timerRef = useRef(null);
  const llamadaActivaRef = useRef(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Fade in al cargar
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 500, useNativeDriver: true,
    }).start();
  }, []);

  // Cargar info del otro usuario
  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, nombre, avatar_url')
        .eq('id', otroUserId)
        .maybeSingle();
      setOtroUsuario(data);
    };
    cargar();
  }, [otroUserId]);

  // Iniciar WebRTC
  useEffect(() => {
    iniciarWebRTC();
    return () => limpiar();
  }, []);

  const iniciarWebRTC = async () => {
    try {
      // Obtener stream local
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      setLocalStream(stream);
      localStreamRef.current = stream;

      // Crear peer connection
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // Agregar tracks locales
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Escuchar stream remoto
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setConectando(false);
          iniciarTimer();
        }
      };

      // Escuchar ICE candidates
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await supabase.from('webrtc_senalizacion').insert({
            sesion_id: sesionId,
            emisor_id: (await supabase.auth.getUser()).data.user.id,
            tipo: 'ice_candidate',
            datos: { candidate: event.candidate },
          });
        }
      };

      // Escuchar señalización de Supabase
      escucharSenalizacion(pc);

      // Si es caller, crear offer
      if (esCaller) {
        await crearOffer(pc);
      }

    } catch (e) {
      console.warn('WebRTC error:', e);
      Alert.alert('Error', 'No se pudo acceder a la cámara o micrófono', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    }
  };

  const crearOffer = async (pc) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await supabase.from('webrtc_senalizacion').insert({
        sesion_id: sesionId,
        emisor_id: user.id,
        tipo: 'offer',
        datos: { sdp: offer },
      });
    } catch (e) {
      console.warn('crearOffer error:', e);
    }
  };

  const escucharSenalizacion = (pc) => {
    const canal = supabase
      .channel(`webrtc-${sesionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'webrtc_senalizacion',
        filter: `sesion_id=eq.${sesionId}`,
      }, async (payload) => {
        if (!llamadaActivaRef.current) return;
        const { tipo, datos, emisor_id } = payload.new;
        const { data: { user } } = await supabase.auth.getUser();
        if (emisor_id === user.id) return; // Ignorar los propios

        try {
          if (tipo === 'offer' && !esCaller) {
            await pc.setRemoteDescription(new RTCSessionDescription(datos.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await supabase.from('webrtc_senalizacion').insert({
              sesion_id: sesionId,
              emisor_id: user.id,
              tipo: 'answer',
              datos: { sdp: answer },
            });
          } else if (tipo === 'answer' && esCaller) {
            await pc.setRemoteDescription(new RTCSessionDescription(datos.sdp));
          } else if (tipo === 'ice_candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(datos.candidate));
          }
        } catch (e) {
          console.warn('señalización error:', e);
        }
      })
      .subscribe();

    canalRef.current = canal;
  };

  const iniciarTimer = () => {
    timerRef.current = setInterval(() => {
      setDuracion(prev => prev + 1);
    }, 1000);
  };

  const formatearDuracion = (seg) => {
    const m = Math.floor(seg / 60).toString().padStart(2, '0');
    const s = (seg % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const limpiar = async () => {
    llamadaActivaRef.current = false;

    if (timerRef.current) clearInterval(timerRef.current);
    if (canalRef.current) supabase.removeChannel(canalRef.current);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Actualizar estado de la sesión
    try {
      await supabase.from('video_sesiones').update({
        estado: 'finalizada',
        fin: new Date().toISOString(),
      }).eq('id', sesionId);
    } catch (e) {
      console.warn(e);
    }
  };

  // ── Botones de control ───────────────────────────────────────────

  const toggleAudio = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setMutedAudio(prev => !prev);
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setMutedVideo(prev => !prev);
  };

  const cambiarCamara = async () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      await videoTrack._switchCamera();
      setCamaraFrontal(prev => !prev);
    }
  };

  const colgar = () => {
    Alert.alert('Colgar', '¿Seguro que quieres terminar la llamada?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Colgar', style: 'destructive',
        onPress: async () => {
          await limpiar();
          navigation.replace('SalaEspera');
        }
      }
    ]);
  };

  const siguiente = () => {
    Alert.alert('Siguiente', '¿Quieres conectarte con otra persona?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Siguiente',
        onPress: async () => {
          await limpiar();
          navigation.replace('SalaEspera');
        }
      }
    ]);
  };

  const agregarAmigo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: existente } = await supabase
        .from('amigos')
        .select('id')
        .or(`and(user1_id.eq.${user.id},user2_id.eq.${otroUserId}),and(user1_id.eq.${otroUserId},user2_id.eq.${user.id})`)
        .maybeSingle();

      if (existente) {
        Alert.alert('Amigos', 'Ya tienes una solicitud o amistad con esta persona.');
        return;
      }

      await supabase.from('amigos').insert({
        user1_id: user.id,
        user2_id: otroUserId,
        solicitante_id: user.id,
        estado: 'pendiente',
      });

      Alert.alert('✓ Solicitud enviada', `Le enviaste una solicitud de amistad a ${otroUsuario?.nombre || 'este usuario'}.`);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const enviarReporte = async () => {
    if (!motivoReporte) {
      Alert.alert('Error', 'Selecciona un motivo para el reporte');
      return;
    }
    setEnviandoReporte(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('video_reportes').insert({
        sesion_id: sesionId,
        reportador_id: user.id,
        reportado_id: otroUserId,
        motivo: motivoReporte,
        descripcion: descripcionReporte.trim() || null,
      });

      setModalReporte(false);
      Alert.alert('Reporte enviado', 'Gracias por reportar. El equipo de Klic revisará el caso.', [
        {
          text: 'OK', onPress: async () => {
            await limpiar();
            navigation.replace('SalaEspera');
          }
        }
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setEnviandoReporte(false);
    }
  };

  const styles = makeStyles(palette);

  return (
    <Animated.View style={[styles.wrapper, { opacity: fadeAnim }]}>

      {/* Video remoto (fondo completo) */}
      {remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remoteVideo}
          objectFit="cover"
          mirror={false}
        />
      ) : (
        <View style={styles.remoteVideoPlaceholder}>
          {conectando && (
            <View style={styles.conectandoBox}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.conectandoText}>Conectando...</Text>
              {otroUsuario && (
                <Text style={styles.conectandoNombre}>{otroUsuario.nombre}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Video local (esquina) */}
      {localStream && (
        <TouchableOpacity style={styles.localVideoContainer} activeOpacity={0.9}>
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.localVideo}
            objectFit="cover"
            mirror={camaraFrontal}
          />
          {mutedVideo && (
            <View style={styles.videoMutedOverlay}>
              <Ionicons name="videocam-off" size={20} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Header con info */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerNombre}>
            {otroUsuario?.nombre || 'Usuario'}
          </Text>
          {!conectando && (
            <Text style={styles.headerDuracion}>{formatearDuracion(duracion)}</Text>
          )}
        </View>
      </View>

      {/* Botones de control */}
      <View style={styles.controles}>

        {/* Fila superior — 3 botones secundarios */}
        <View style={styles.filaSecundaria}>

          {/* Silenciar */}
          <View style={styles.btnSecGroup}>
            <TouchableOpacity
              style={[styles.btnSec, mutedAudio && styles.btnSecActivo]}
              onPress={toggleAudio}
              activeOpacity={0.8}
            >
              <Ionicons
                name={mutedAudio ? 'mic-off' : 'mic-outline'}
                size={22}
                color={mutedAudio ? '#fb7185' : '#fff'}
              />
            </TouchableOpacity>
            <Text style={styles.btnSecLabel}>
              {mutedAudio ? 'Activar mic' : 'Silenciar'}
            </Text>
          </View>

          {/* Cambiar cámara */}
          <View style={styles.btnSecGroup}>
            <TouchableOpacity
              style={styles.btnSec}
              onPress={cambiarCamara}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.btnSecLabel}>Cámara</Text>
          </View>

          {/* Denunciar */}
          <View style={styles.btnSecGroup}>
            <TouchableOpacity
              style={styles.btnSec}
              onPress={() => setModalReporte(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="flag-outline" size={22} color="#fb7185" />
            </TouchableOpacity>
            <Text style={styles.btnSecLabel}>Denunciar</Text>
          </View>

        </View>

        {/* Fila inferior — 3 botones principales */}
        <View style={styles.filaPrincipal}>

          {/* Agregar amigo */}
          <View style={styles.btnMainGroup}>
            <TouchableOpacity
              style={[styles.btnMain, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
              onPress={agregarAmigo}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.btnMainLabel}>Amigo</Text>
          </View>

          {/* Colgar */}
          <View style={styles.btnMainGroup}>
            <TouchableOpacity
              style={[styles.btnColgar]}
              onPress={colgar}
              activeOpacity={0.8}
            >
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
            <Text style={styles.btnMainLabel}>Colgar</Text>
          </View>

          {/* Siguiente */}
          <View style={styles.btnMainGroup}>
            <TouchableOpacity
              style={[styles.btnMain, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
              onPress={siguiente}
              activeOpacity={0.8}
            >
              <Ionicons name="play-skip-forward-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.btnMainLabel}>Siguiente</Text>
          </View>

        </View>
      </View>

      {/* Modal de reporte */}
      <Modal
        visible={modalReporte}
        animationType="slide"
        transparent
        onRequestClose={() => setModalReporte(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: palette.panel }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Denunciar usuario</Text>
              <TouchableOpacity onPress={() => setModalReporte(false)}>
                <Ionicons name="close" size={24} color={palette.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: palette.textMuted }]}>
              Selecciona el motivo de tu denuncia
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {MOTIVOS_REPORTE.map(m => (
                <TouchableOpacity
                  key={m.key}
                  style={[
                    styles.motivoBtn,
                    { borderColor: motivoReporte === m.key ? palette.primary : palette.border },
                    motivoReporte === m.key && { backgroundColor: palette.primary + '20' },
                  ]}
                  onPress={() => setMotivoReporte(m.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={m.icon}
                    size={20}
                    color={motivoReporte === m.key ? palette.primary : palette.textMuted}
                  />
                  <Text style={[
                    styles.motivoLabel,
                    { color: motivoReporte === m.key ? palette.primary : palette.text }
                  ]}>
                    {m.label}
                  </Text>
                  {motivoReporte === m.key && (
                    <Ionicons name="checkmark-circle" size={18} color={palette.primary} />
                  )}
                </TouchableOpacity>
              ))}

              <TextInput
                style={[styles.descripcionInput, {
                  backgroundColor: palette.panelSoft,
                  color: palette.text,
                  borderColor: palette.border,
                }]}
                placeholder="Descripción adicional (opcional)"
                placeholderTextColor={palette.textMuted}
                value={descripcionReporte}
                onChangeText={setDescripcionReporte}
                multiline
                maxLength={300}
              />

              <TouchableOpacity
                style={[
                  styles.btnEnviarReporte,
                  { backgroundColor: motivoReporte ? '#fb7185' : palette.panelSoft },
                ]}
                onPress={enviarReporte}
                disabled={!motivoReporte || enviandoReporte}
                activeOpacity={0.85}
              >
                {enviandoReporte
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="flag" size={18} color={motivoReporte ? '#fff' : palette.textMuted} />
                      <Text style={[
                        styles.btnEnviarReporteText,
                        { color: motivoReporte ? '#fff' : palette.textMuted }
                      ]}>
                        Enviar denuncia
                      </Text>
                    </>
                }
              </TouchableOpacity>

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </Animated.View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#000' },

  // Videos
  remoteVideo: { ...StyleSheet.absoluteFillObject },
  remoteVideoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  conectandoBox: { alignItems: 'center', gap: 12 },
  conectandoText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  conectandoNombre: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },

  localVideoContainer: {
    position: 'absolute',
    top: 60, right: 16,
    width: 100, height: 140,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10,
  },
  localVideo: { width: '100%', height: '100%' },
  videoMutedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 16,
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
  },
  headerInfo: { gap: 2 },
  headerNombre: { color: '#fff', fontSize: 18, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
  headerDuracion: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },

  // Controles
  controles: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  filaSecundaria: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  btnSecGroup: { alignItems: 'center', gap: 6 },
  btnSec: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnSecActivo: { backgroundColor: 'rgba(251,113,133,0.3)' },
  btnSecLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },

  filaPrincipal: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  btnMainGroup: { alignItems: 'center', gap: 6 },
  btnMain: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  btnColgar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fb7185',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#fb7185', shadowOpacity: 0.5,
    shadowRadius: 12, elevation: 8,
  },
  btnMainLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },

  // Modal reporte
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSub: { fontSize: 13, marginBottom: 16 },

  motivoBtn: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, padding: 14, borderRadius: radii.md,
    borderWidth: 1.5, marginBottom: 8,
  },
  motivoLabel: { flex: 1, fontSize: 14, fontWeight: '600' },

  descripcionInput: {
    borderRadius: radii.md, borderWidth: 1,
    padding: 12, fontSize: 14,
    minHeight: 80, textAlignVertical: 'top',
    marginTop: 8, marginBottom: 16,
  },

  btnEnviarReporte: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    borderRadius: radii.md, paddingVertical: 16,
  },
  btnEnviarReporteText: { fontWeight: '800', fontSize: 16 },
});
