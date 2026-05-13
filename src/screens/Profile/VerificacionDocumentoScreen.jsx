import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

const PASOS = ['Información', 'Subir documento', 'Confirmación'];

export default function VerificacionDocumentoScreen({ navigation }) {
  const { palette } = useTema();
  const [paso, setPaso] = useState(0);
  const [imagen, setImagen] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  const seleccionarImagen = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.85,
      });
      if (!result.canceled) setImagen(result.assets[0]);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };
  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu cámara.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled) setImagen(result.assets[0]);
  };

  const subirDocumento = async () => {
    if (!imagen) {
      Alert.alert('Error', 'Selecciona una imagen primero');
      return;
    }
    setSubiendo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesión expirada');

      // Leer el archivo como ArrayBuffer
      const response = await fetch(imagen.uri);
      if (!response.ok) throw new Error('No se pudo leer el archivo');
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const ext = imagen.mimeType?.includes('png') ? 'png' : 'jpg';
      const fileName = `${user.id}/documento.${ext}`;
      const contentType = imagen.mimeType || 'image/jpeg';

      // Subir al bucket privado 'documentos'
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, arrayBuffer, { contentType, upsert: true });

      if (uploadError) throw uploadError;

      // Guardar la referencia en la BD (sin URL pública)
      const { error: dbError } = await supabase
        .from('users')
        .update({
          documento_url: fileName,
          nivel_verificacion: 'pendiente',
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      setPaso(2); // Ir al paso de confirmación
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo subir el documento');
    } finally {
      setSubiendo(false);
    }
  };

  const styles = makeStyles(palette);

  // ── Indicador de pasos ──────────────────────────────────────────
  const renderIndicador = () => (
    <View style={styles.indicador}>
      {PASOS.map((label, i) => (
        <React.Fragment key={i}>
          <View style={styles.pasoItem}>
            <View style={[
              styles.pasoBola,
              {
                backgroundColor: i <= paso ? palette.primary : palette.panelSoft,
                borderColor: i <= paso ? palette.primary : palette.border,
              }
            ]}>
              {i < paso
                ? <Ionicons name="checkmark" size={14} color="#fff" />
                : <Text style={[styles.pasoNum, { color: i === paso ? '#fff' : palette.textMuted }]}>
                    {i + 1}
                  </Text>
              }
            </View>
            <Text style={[styles.pasoLabel, { color: i <= paso ? palette.primary : palette.textMuted }]}>
              {label}
            </Text>
          </View>
          {i < PASOS.length - 1 && (
            <View style={[styles.pasoLinea, { backgroundColor: i < paso ? palette.primary : palette.border }]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  // ── Paso 0: Información ─────────────────────────────────────────
  const renderPaso0 = () => (
    <View style={styles.pasoContent}>
      <View style={[styles.iconCircle, { backgroundColor: palette.primary + '22' }]}>
        <Ionicons name="id-card-outline" size={48} color={palette.primary} />
      </View>
      <Text style={[styles.pasoTitulo, { color: palette.text }]}>Verifica tu identidad</Text>
      <Text style={[styles.pasoDesc, { color: palette.textMuted }]}>
        Para acceder a todas las funciones de Klic necesitamos verificar que eres mayor de edad.
        Este proceso es seguro y confidencial.
      </Text>

      <View style={[styles.infoCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        {[
          { icon: 'shield-checkmark-outline', text: 'Tu documento se almacena de forma privada y encriptada.' },
          { icon: 'eye-off-outline', text: 'Solo el equipo de verificación de Klic puede acceder.' },
          { icon: 'checkmark-circle-outline', text: 'Recibirás confirmación en menos de 24 horas.' },
          { icon: 'trash-outline', text: 'Puedes solicitar la eliminación de tu documento en cualquier momento.' },
        ].map((item, i) => (
          <View key={i} style={styles.infoRow}>
            <Ionicons name={item.icon} size={20} color={palette.primary} />
            <Text style={[styles.infoText, { color: palette.textMuted }]}>{item.text}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.docCard, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
        <Text style={[styles.docCardTitle, { color: palette.text }]}>Documentos aceptados</Text>
        <View style={styles.docRow}>
          <Ionicons name="card-outline" size={18} color={palette.secondary} />
          <Text style={[styles.docItem, { color: palette.textMuted }]}>Cédula de ciudadanía (Colombia)</Text>
        </View>
        <View style={styles.docRow}>
          <Ionicons name="book-outline" size={18} color={palette.secondary} />
          <Text style={[styles.docItem, { color: palette.textMuted }]}>Pasaporte vigente</Text>
        </View>
        <View style={styles.docRow}>
          <Ionicons name="card-outline" size={18} color={palette.secondary} />
          <Text style={[styles.docItem, { color: palette.textMuted }]}>DNI de otro país</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.btnPrimario, { backgroundColor: palette.primary }]}
        onPress={() => setPaso(1)}
        activeOpacity={0.85}
      >
        <Text style={styles.btnPrimarioText}>Continuar</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  // ── Paso 1: Subir documento ─────────────────────────────────────
  const renderPaso1 = () => (
    <View style={styles.pasoContent}>
      <Text style={[styles.pasoTitulo, { color: palette.text }]}>Sube tu documento</Text>
      <Text style={[styles.pasoDesc, { color: palette.textMuted }]}>
        Asegúrate de que la foto sea clara, bien iluminada y que todos los datos sean legibles.
      </Text>

      {/* Preview o selector */}
      {imagen ? (
        <View style={styles.previewBox}>
          <Image source={{ uri: imagen.uri }} style={styles.previewImg} resizeMode="cover" />
          <TouchableOpacity
            style={[styles.cambiarBtn, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}
            onPress={() => setImagen(null)}
          >
            <Ionicons name="refresh-outline" size={16} color={palette.secondary} />
            <Text style={[styles.cambiarText, { color: palette.secondary }]}>Cambiar imagen</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.opcionesGrid}>
          <TouchableOpacity
            style={[styles.opcionBtn, { backgroundColor: palette.panel, borderColor: palette.border }]}
            onPress={tomarFoto}
            activeOpacity={0.8}
          >
            <Ionicons name="camera-outline" size={36} color={palette.primary} />
            <Text style={[styles.opcionLabel, { color: palette.text }]}>Tomar foto</Text>
            <Text style={[styles.opcionSub, { color: palette.textMuted }]}>Usa la cámara</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.opcionBtn, { backgroundColor: palette.panel, borderColor: palette.border }]}
            onPress={seleccionarImagen}
            activeOpacity={0.8}
          >
            <Ionicons name="image-outline" size={36} color={palette.secondary} />
            <Text style={[styles.opcionLabel, { color: palette.text }]}>Desde galería</Text>
            <Text style={[styles.opcionSub, { color: palette.textMuted }]}>Elige una foto</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tips */}
      <View style={[styles.tipsCard, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
        <Text style={[styles.tipsTitle, { color: palette.text }]}>Consejos para una buena foto</Text>
        {[
          'Buena iluminación, sin sombras sobre el documento',
          'Todos los bordes del documento visibles',
          'Sin reflejos ni destellos',
          'Texto legible y en foco',
        ].map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <View style={[styles.tipDot, { backgroundColor: palette.primary }]} />
            <Text style={[styles.tipText, { color: palette.textMuted }]}>{tip}</Text>
          </View>
        ))}
      </View>

      <View style={styles.botonesRow}>
        <TouchableOpacity
          style={[styles.btnSecundario, { borderColor: palette.border }]}
          onPress={() => setPaso(0)}
        >
          <Ionicons name="arrow-back" size={18} color={palette.textMuted} />
          <Text style={[styles.btnSecundarioText, { color: palette.textMuted }]}>Atrás</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btnPrimario,
            { backgroundColor: imagen ? palette.primary : palette.panelSoft, flex: 2 },
            !imagen && { borderWidth: 1, borderColor: palette.border },
          ]}
          onPress={subirDocumento}
          disabled={!imagen || subiendo}
          activeOpacity={0.85}
        >
          {subiendo ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color={imagen ? '#fff' : palette.textMuted} />
              <Text style={[styles.btnPrimarioText, { color: imagen ? '#fff' : palette.textMuted }]}>
                Enviar documento
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Paso 2: Confirmación ────────────────────────────────────────
  const renderPaso2 = () => (
    <View style={[styles.pasoContent, styles.center]}>
      <View style={[styles.successCircle, { backgroundColor: '#065F46' + '33', borderColor: '#065F46' }]}>
        <Ionicons name="checkmark-circle" size={64} color="#22d3ee" />
      </View>
      <Text style={[styles.successTitulo, { color: palette.text }]}>¡Documento enviado!</Text>
      <Text style={[styles.successDesc, { color: palette.textMuted }]}>
        Tu documento fue recibido correctamente. El equipo de Klic lo revisará en menos de 24 horas.
        Te notificaremos cuando tu identidad sea verificada.
      </Text>

      <View style={[styles.infoCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={20} color={palette.primary} />
          <Text style={[styles.infoText, { color: palette.textMuted }]}>
            Revisión en menos de 24 horas hábiles.
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="notifications-outline" size={20} color={palette.primary} />
          <Text style={[styles.infoText, { color: palette.textMuted }]}>
            Recibirás una notificación cuando el proceso termine.
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="shield-checkmark-outline" size={20} color={palette.primary} />
          <Text style={[styles.infoText, { color: palette.textMuted }]}>
            Una vez verificado tendrás acceso completo a Klic.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.btnPrimario, { backgroundColor: palette.primary }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.85}
      >
        <Text style={styles.btnPrimarioText}>Volver al perfil</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Verificar identidad</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {renderIndicador()}
        {paso === 0 && renderPaso0()}
        {paso === 1 && renderPaso1()}
        {paso === 2 && renderPaso2()}
        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8, paddingTop: 52, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  scroll: { padding: 20 },

  // Indicador de pasos
  indicador: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', marginBottom: 28,
  },
  pasoItem: { alignItems: 'center', gap: 6 },
  pasoBola: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  pasoNum: { fontSize: 13, fontWeight: '800' },
  pasoLabel: { fontSize: 10, fontWeight: '600', maxWidth: 60, textAlign: 'center' },
  pasoLinea: { flex: 1, height: 2, marginHorizontal: 4, marginBottom: 20 },

  // Contenido del paso
  pasoContent: { gap: 16 },
  center: { alignItems: 'center' },

  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
  },
  pasoTitulo: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  pasoDesc: { fontSize: 14, lineHeight: 21, textAlign: 'center' },

  // Info card
  infoCard: {
    borderRadius: radii.lg, borderWidth: 1,
    padding: 16, gap: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },

  // Documentos aceptados
  docCard: {
    borderRadius: radii.lg, borderWidth: 1,
    padding: 16, gap: 10,
  },
  docCardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  docItem: { fontSize: 13 },

  // Botones
  btnPrimario: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    borderRadius: radii.md, paddingVertical: 16,
  },
  btnPrimarioText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnSecundario: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
    borderRadius: radii.md, paddingVertical: 16,
    borderWidth: 1, paddingHorizontal: 16,
  },
  btnSecundarioText: { fontWeight: '700', fontSize: 14 },
  botonesRow: { flexDirection: 'row', gap: 10 },

  // Preview imagen
  previewBox: { gap: 12 },
  previewImg: {
    width: '100%', height: 220,
    borderRadius: radii.lg, overflow: 'hidden',
  },
  cambiarBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
    borderWidth: 1, borderRadius: radii.md,
    paddingVertical: 10,
  },
  cambiarText: { fontSize: 14, fontWeight: '600' },

  // Opciones galería/cámara
  opcionesGrid: { flexDirection: 'row', gap: 12 },
  opcionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 24, borderRadius: radii.lg, borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  opcionLabel: { fontSize: 14, fontWeight: '700' },
  opcionSub: { fontSize: 12 },

  // Tips
  tipsCard: {
    borderRadius: radii.lg, borderWidth: 1,
    padding: 16, gap: 8,
  },
  tipsTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tipDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 18 },

  // Confirmación
  successCircle: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, marginBottom: 8,
  },
  successTitulo: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  successDesc: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
