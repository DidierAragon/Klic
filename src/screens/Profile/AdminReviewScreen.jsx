import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image, ScrollView,
  Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

const { height } = Dimensions.get('window');

export default function AdminReviewScreen({ navigation }) {
  const { palette } = useTema();
  const [loading, setLoading] = useState(true);
  const [pendientes, setPendientes] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [docUrl, setDocUrl] = useState(null);
  const [cargandoDoc, setCargandoDoc] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const cargarPendientes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, nombre, email, fecha_nacimiento, avatar_url, documento_url, nivel_verificacion')
        .eq('nivel_verificacion', 'pendiente');

      if (error) throw error;
      setPendientes(data || []);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudieron cargar los documentos pendientes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarPendientes();
  }, [cargarPendientes]);

  const seleccionarUsuario = async (user) => {
    setSeleccionado(user);
    setDocUrl(null);
    setCargandoDoc(true);
    try {
      // Generar URL firmada para el bucket privado 'documentos'
      const { data, error } = await supabase.storage
        .from('documentos')
        .createSignedUrl(user.documento_url, 300); // 5 minutos de validez

      if (error) throw error;
      setDocUrl(data.signedUrl);
    } catch (e) {
      Alert.alert('Error', 'No se pudo cargar la imagen del documento privado.');
      setSeleccionado(null);
    } finally {
      setCargandoDoc(false);
    }
  };

  const procesarVerificacion = async (aprobar) => {
    if (!seleccionado) return;
    setProcesando(true);
    try {
      const nuevoNivel = aprobar ? 'verificado' : 'rechazado';
      const verificado = aprobar;

      const { error } = await supabase
        .from('users')
        .update({
          nivel_verificacion: nuevoNivel,
          documento_verificado: verificado,
        })
        .eq('id', seleccionado.id);

      if (error) throw error;

      Alert.alert(
        '✓ Completado',
        `El documento ha sido ${aprobar ? 'aprobado' : 'rechazado'} con éxito.`
      );

      // Eliminar de la lista local
      setPendientes(prev => prev.filter(p => p.id !== seleccionado.id));
      setSeleccionado(null);
      setDocUrl(null);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo procesar la verificación');
    } finally {
      setProcesando(false);
    }
  };

  const calcularEdad = (fecha) => {
    if (!fecha) return '—';
    const hoy = new Date();
    const nac = new Date(fecha);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return `${edad} años`;
  };

  const styles = makeStyles(palette);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Verificaciones Pendientes</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : pendientes.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.iconCircle, { backgroundColor: palette.primary + '15' }]}>
            <Ionicons name="checkmark-done" size={48} color={palette.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>¡Todo al día!</Text>
          <Text style={[styles.emptySub, { color: palette.textMuted }]}>
            No hay documentos pendientes de revisión en este momento.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            Usuarios esperando revisión ({pendientes.length})
          </Text>

          {pendientes.map((user) => (
            <TouchableOpacity
              key={user.id}
              style={[styles.userCard, { backgroundColor: palette.panel, borderColor: palette.border }]}
              onPress={() => seleccionarUsuario(user)}
              activeOpacity={0.8}
            >
              <View style={styles.userInfoRow}>
                {user.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: palette.primary + '22' }]}>
                    <Text style={[styles.avatarLetter, { color: palette.primary }]}>
                      {user.nombre?.[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                <View style={styles.userDetail}>
                  <Text style={[styles.userName, { color: palette.text }]}>{user.nombre}</Text>
                  <Text style={[styles.userEmail, { color: palette.textMuted }]}>{user.email}</Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={14} color={palette.secondary} />
                    <Text style={[styles.userAge, { color: palette.secondary }]}>
                      {calcularEdad(user.fecha_nacimiento)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.badge, { backgroundColor: palette.primary + '15', borderColor: palette.primary + '44' }]}>
                  <Text style={[styles.badgeText, { color: palette.primary }]}>Revisar</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Modal de Detalle / Revisión */}
      <Modal
        visible={seleccionado !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { if (!procesando) setSeleccionado(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: palette.bg }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: palette.border }]}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Revisar Documento</Text>
              <TouchableOpacity
                onPress={() => { if (!procesando) setSeleccionado(null); }}
                style={styles.closeBtn}
                disabled={procesando}
              >
                <Ionicons name="close" size={24} color={palette.text} />
              </TouchableOpacity>
            </View>

            {seleccionado && (
              <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Datos del usuario */}
                <View style={[styles.detailCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
                  <Text style={[styles.detailTitle, { color: palette.primary }]}>Datos del Solicitante</Text>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: palette.textMuted }]}>Nombre:</Text>
                    <Text style={[styles.detailValue, { color: palette.text }]}>{seleccionado.nombre}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: palette.textMuted }]}>Email:</Text>
                    <Text style={[styles.detailValue, { color: palette.text }]}>{seleccionado.email}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: palette.textMuted }]}>Nacimiento:</Text>
                    <Text style={[styles.detailValue, { color: palette.text }]}>{seleccionado.fecha_nacimiento || '—'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: palette.textMuted }]}>Edad Calculada:</Text>
                    <Text style={[styles.detailValue, { color: palette.secondary }]}>{calcularEdad(seleccionado.fecha_nacimiento)}</Text>
                  </View>
                </View>

                {/* Imagen del Documento */}
                <Text style={[styles.docSectionTitle, { color: palette.text }]}>Foto del Documento</Text>
                
                <View style={[styles.imageContainer, { backgroundColor: palette.panel, borderColor: palette.border }]}>
                  {cargandoDoc ? (
                    <View style={styles.imageLoading}>
                      <ActivityIndicator size="large" color={palette.primary} />
                      <Text style={[styles.imageLoadingText, { color: palette.textMuted }]}>
                        Obteniendo enlace seguro...
                      </Text>
                    </View>
                  ) : docUrl ? (
                    <Image
                      source={{ uri: docUrl }}
                      style={styles.documentImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.imageError}>
                      <Ionicons name="alert-circle-outline" size={48} color="#fb7185" />
                      <Text style={[styles.imageErrorText, { color: '#fb7185' }]}>
                        No se pudo cargar el documento privado
                      </Text>
                    </View>
                  )}
                </View>

                {/* Botones de acción */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.btnRechazar, procesando && { opacity: 0.5 }]}
                    onPress={() => Alert.alert(
                      'Confirmar rechazo',
                      '¿Estás seguro de rechazar este documento? El usuario tendrá que subir otra foto.',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Rechazar', style: 'destructive', onPress: () => procesarVerificacion(false) }
                      ]
                    )}
                    disabled={procesando}
                  >
                    {procesando ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="close-circle-outline" size={20} color="#fff" />
                        <Text style={styles.btnText}>Rechazar</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnAprobar, { backgroundColor: palette.secondary }, (procesando || cargandoDoc || !docUrl) && { opacity: 0.5 }]}
                    onPress={() => Alert.alert(
                      'Confirmar aprobación',
                      '¿Verificaste que el documento es válido y el usuario es mayor de 18 años?',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Aprobar', style: 'default', onPress: () => procesarVerificacion(true) }
                      ]
                    )}
                    disabled={procesando || cargandoDoc || !docUrl}
                  >
                    {procesando ? (
                      <ActivityIndicator color="#07070b" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#07070b" />
                        <Text style={[styles.btnText, { color: '#07070b' }]}>Aprobar</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8, paddingTop: 52, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  scroll: { padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },

  iconCircle: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  userCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  userInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 20, fontWeight: '800' },
  userDetail: { flex: 1, gap: 2 },
  userName: { fontSize: 16, fontWeight: '700' },
  userEmail: { fontSize: 12, marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userAge: { fontSize: 12, fontWeight: '600' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    height: height * 0.85,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  closeBtn: { padding: 4 },
  modalScroll: { padding: 20, gap: 16 },

  detailCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  detailTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: '600' },

  docSectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  imageContainer: {
    width: '100%',
    height: 300,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  documentImage: { width: '100%', height: '100%' },
  imageLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  imageLoadingText: { fontSize: 13 },
  imageError: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 20 },
  imageErrorText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },

  actionButtons: { flexDirection: 'row', gap: 12, marginTop: 12, marginBottom: 24 },
  btnRechazar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fb7185',
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  btnAprobar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  btnText: { fontWeight: '800', fontSize: 15 },
});
