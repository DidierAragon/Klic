import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';
import {
  pickImageToArrayBuffer,
  guessImageContentType,
  extensionForContentType,
} from '../../utils/readLocalFile';

const SEXOS = [
  { key: 'hombre',           label: 'Hombre',             icon: 'male-outline' },
  { key: 'mujer',            label: 'Mujer',              icon: 'female-outline' },
  { key: 'otro',             label: 'Otro',               icon: 'transgender-outline' },
  { key: 'prefiero_no_decir', label: 'Prefiero no decir', icon: 'help-circle-outline' },
];

export default function EditarPerfilScreen({ navigation }) {
  const { palette } = useTema();
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Campos
  const [nombre, setNombre] = useState('');
  const [alias, setAlias] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [sexo, setSexo] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [userId, setUserId] = useState(null);
  const [aliasError, setAliasError] = useState('');

  // Campos de suscripción (Creadores)
  const [ofrecerSuscripcion, setOfrecerSuscripcion] = useState(false);
  const [precioSuscripcion, setPrecioSuscripcion] = useState('0');
  const [precioOriginal, setPrecioOriginal] = useState(0);
  const [nombreSuscripcion, setNombreSuscripcion] = useState('');
  const [descripcionSuscripcion, setDescripcionSuscripcion] = useState('');

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from('users')
        .select('nombre, alias, descripcion, sexo, avatar_url, es_creador, precio_suscripcion, nombre_suscripcion, descripcion_suscripcion')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setNombre(data.nombre || '');
        setAlias(data.alias || '');
        setDescripcion(data.descripcion || '');
        setSexo(data.sexo || '');
        setAvatarUrl(data.avatar_url || '');
        
        const dbPrecio = data.precio_suscripcion ? parseFloat(data.precio_suscripcion) : 0;
        setOfrecerSuscripcion(dbPrecio > 0 || !!data.es_creador);
        setPrecioSuscripcion(String(dbPrecio));
        setPrecioOriginal(dbPrecio);
        setNombreSuscripcion(data.nombre_suscripcion || '');
        setDescripcionSuscripcion(data.descripcion_suscripcion || '');
      }
      setLoading(false);
    };
    cargar();
  }, []);

  const validarAlias = async (valor) => {
    setAlias(valor);
    setAliasError('');
    if (!valor.trim()) return;
    if (valor.length < 3) { setAliasError('Mínimo 3 caracteres'); return; }
    if (!/^[a-zA-Z0-9_.]+$/.test(valor)) {
      setAliasError('Solo letras, números, puntos y guiones bajos');
      return;
    }
    // Verificar disponibilidad
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('alias', valor.toLowerCase())
      .neq('id', userId)
      .maybeSingle();
    if (data) setAliasError('Este alias ya está en uso');
  };

  const cambiarAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.75,
      base64: true,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const arrayBuffer = await pickImageToArrayBuffer(asset);
      const contentType = guessImageContentType(asset);
      const ext = extensionForContentType(contentType);
      const fileName = `avatars/${userId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('fotos')
        .upload(fileName, arrayBuffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);

      const { error: dbErr } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (dbErr) throw dbErr;

      setAvatarUrl(publicUrl);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo subir la foto');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const guardar = async () => {
    if (!nombre.trim()) { Alert.alert('Error', 'El nombre es obligatorio'); return; }
    if (aliasError) { Alert.alert('Error', 'Corrige el alias antes de guardar'); return; }

    setGuardando(true);
    try {
      const updates = {
        nombre: nombre.trim(),
        alias: alias.trim().toLowerCase() || null,
        descripcion: descripcion.trim() || null,
        sexo: sexo || null,
        avatar_url: avatarUrl || null,
      };

      if (ofrecerSuscripcion) {
        const nuevoPrecio = parseFloat(precioSuscripcion) || 0;
        updates.es_creador = true;
        updates.precio_suscripcion = nuevoPrecio;
        updates.nombre_suscripcion = nombreSuscripcion.trim() || null;
        updates.descripcion_suscripcion = descripcionSuscripcion.trim() || null;
        
        // Si el precio cambió respecto al original, obligamos a recrear el precio en Stripe
        if (nuevoPrecio !== precioOriginal) {
          updates.stripe_price_id = null;
        }
      } else {
        // Eliminar/desactivar membresía
        updates.precio_suscripcion = 0;
        updates.nombre_suscripcion = null;
        updates.descripcion_suscripcion = null;
        updates.stripe_price_id = null;
      }

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);

      if (error) throw error;

      Alert.alert('✓ Guardado', 'Tu perfil fue actualizado', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardando(false);
    }
  };

  const styles = makeStyles(palette);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={palette.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Editar perfil</Text>
          <TouchableOpacity
            style={[styles.guardarBtn, { backgroundColor: palette.primary }]}
            onPress={guardar}
            disabled={guardando}
          >
            {guardando
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.guardarBtnText}>Guardar</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={cambiarAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={[styles.avatar, { borderColor: palette.primary }]} />
              ) : (
                <View style={[styles.avatarPlaceholder, {
                  borderColor: palette.primary,
                  backgroundColor: palette.primary + '22'
                }]}>
                  <Text style={[styles.avatarInitial, { color: palette.primary }]}>
                    {nombre?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={[styles.avatarBadge, { backgroundColor: palette.primary }]}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={16} color="#fff" />
                }
              </View>
            </View>
          </TouchableOpacity>
          <Text style={[styles.avatarHint, { color: palette.textMuted }]}>
            Toca para cambiar tu foto
          </Text>
        </View>

        {/* Formulario */}
        <View style={styles.form}>

          {/* Nombre */}
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Tu nombre"
            placeholderTextColor={palette.textMuted}
            maxLength={40}
            autoCorrect={false}
          />

          {/* Alias */}
          <Text style={styles.label}>
            Alias <Text style={[styles.labelOptional, { color: palette.textMuted }]}>(opcional)</Text>
          </Text>
          <View style={[styles.aliasRow, {
            borderColor: aliasError ? '#fb7185' : alias && !aliasError ? '#22d3ee' : palette.border
          }]}>
            <Text style={[styles.aliasAt, { color: palette.textMuted }]}>@</Text>
            <TextInput
              style={[styles.aliasInput, { color: palette.text }]}
              value={alias}
              onChangeText={validarAlias}
              placeholder="tu_alias"
              placeholderTextColor={palette.textMuted}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {alias && !aliasError && (
              <Ionicons name="checkmark-circle" size={18} color="#22d3ee" />
            )}
            {aliasError && (
              <Ionicons name="close-circle" size={18} color="#fb7185" />
            )}
          </View>
          {aliasError ? (
            <Text style={styles.aliasErrorText}>{aliasError}</Text>
          ) : alias && !aliasError ? (
            <Text style={[styles.aliasOkText, { color: '#22d3ee' }]}>✓ Alias disponible</Text>
          ) : null}

          {/* Descripción */}
          <Text style={styles.label}>
            Descripción <Text style={[styles.labelOptional, { color: palette.textMuted }]}>(opcional)</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Cuéntanos algo sobre ti..."
            placeholderTextColor={palette.textMuted}
            multiline
            maxLength={150}
            textAlignVertical="top"
            autoCorrect={false}
          />
          <Text style={[styles.charCount, { color: palette.textMuted }]}>
            {descripcion.length}/150
          </Text>

          {/* Sexo */}
          <Text style={styles.label}>
            Sexo <Text style={[styles.labelOptional, { color: palette.textMuted }]}>(opcional)</Text>
          </Text>
          <View style={styles.sexosGrid}>
            {SEXOS.map(s => (
              <TouchableOpacity
                key={s.key}
                style={[
                  styles.sexoBtn,
                  { borderColor: sexo === s.key ? palette.primary : palette.border },
                  sexo === s.key && { backgroundColor: palette.primary + '22' }
                ]}
                onPress={() => setSexo(sexo === s.key ? '' : s.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={s.icon}
                  size={18}
                  color={sexo === s.key ? palette.primary : palette.textMuted}
                />
                <Text style={[
                  styles.sexoBtnText,
                  { color: sexo === s.key ? palette.primary : palette.textMuted }
                ]}>
                  {s.label}
                </Text>
                {sexo === s.key && (
                  <Ionicons name="checkmark-circle" size={14} color={palette.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Toggle Membresía de Pago */}
          <View style={[styles.toggleRow, { borderColor: palette.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: palette.text }]}>Membresía Mensual de Pago</Text>
              <Text style={[styles.toggleSub, { color: palette.textMuted }]}>
                Permite que tus seguidores se suscriban por una tarifa mensual recurrente en Stripe.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.switchContainer,
                { backgroundColor: ofrecerSuscripcion ? palette.primary : palette.border }
              ]}
              onPress={() => setOfrecerSuscripcion(!ofrecerSuscripcion)}
              activeOpacity={0.8}
            >
              <View style={[
                styles.switchCircle,
                { 
                  transform: [{ translateX: ofrecerSuscripcion ? 20 : 0 }],
                  backgroundColor: '#07070b'
                }
              ]} />
            </TouchableOpacity>
          </View>

          {ofrecerSuscripcion && (
            <View style={[styles.creatorSubCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
              <View style={styles.subHeader}>
                <Ionicons name="sparkles" size={20} color={palette.primary} />
                <Text style={[styles.subTitle, { color: palette.primary }]}>Detalles de mi Membresía</Text>
              </View>
              <Text style={[styles.subDesc, { color: palette.textMuted }]}>
                Configura los detalles de tu membresía. Los suscriptores pagarán este monto mensualmente a través de Stripe para acceder a todo tu contenido premium de forma automática.
              </Text>

              {/* Nombre de la Suscripción */}
              <Text style={styles.label}>Nombre de la Suscripción</Text>
              <TextInput
                style={styles.input}
                value={nombreSuscripcion}
                onChangeText={setNombreSuscripcion}
                placeholder="Ej. Suscripción VIP, Acceso Platino..."
                placeholderTextColor={palette.textMuted}
                maxLength={40}
                autoCorrect={false}
              />

              {/* Precio Mensual */}
              <Text style={styles.label}>Precio Mensual (USD)</Text>
              <View style={[styles.priceInputRow, { borderColor: palette.border, backgroundColor: palette.panelSoft }]}>
                <Text style={[styles.priceSymbol, { color: palette.text }]}>$</Text>
                <TextInput
                  style={[styles.priceTextInput, { color: palette.text }]}
                  value={precioSuscripcion}
                  onChangeText={(val) => {
                    if (/^\d*\.?\d*$/.test(val)) {
                      setPrecioSuscripcion(val);
                    }
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={palette.textMuted}
                  maxLength={10}
                />
                <Text style={[styles.priceInterval, { color: palette.textMuted }]}>/ mes</Text>
              </View>

              {/* Descripción / Privilegios */}
              <Text style={styles.label}>Privilegios y Beneficios</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={descripcionSuscripcion}
                onChangeText={setDescripcionSuscripcion}
                placeholder="Ej. Acceso a todas mis fotos y videos premium, chat prioritario, adelantos exclusivos..."
                placeholderTextColor={palette.textMuted}
                multiline
                maxLength={200}
                textAlignVertical="top"
                autoCorrect={false}
              />
              <Text style={[styles.charCount, { color: palette.textMuted }]}>
                {descripcionSuscripcion.length}/200
              </Text>
            </View>
          )}

        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  container: { paddingBottom: 20 },
  center: { flex: 1, backgroundColor: palette.bg, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: palette.text },
  guardarBtn: {
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: radii.pill,
  },
  guardarBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Avatar
  avatarSection: {
    alignItems: 'center', paddingVertical: 24,
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  avatarWrapper: { position: 'relative', marginBottom: 8 },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3 },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 36, fontWeight: '800' },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: palette.bg,
  },
  avatarHint: { fontSize: 12 },

  // Form
  form: { paddingHorizontal: 20, paddingTop: 20 },
  label: { fontSize: 13, fontWeight: '600', color: palette.text, marginBottom: 6, marginTop: 16 },
  labelOptional: { fontSize: 12, fontWeight: '400' },

  input: {
    backgroundColor: palette.panelSoft,
    color: palette.text, borderRadius: radii.md,
    borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15,
  },
  textArea: { minHeight: 90, paddingTop: 12 },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 4 },

  // Alias
  aliasRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: palette.panelSoft,
    borderRadius: radii.md, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12, gap: 6,
  },
  aliasAt: { fontSize: 16, fontWeight: '600' },
  aliasInput: { flex: 1, fontSize: 15 },
  aliasErrorText: { color: '#fb7185', fontSize: 12, marginTop: 4 },
  aliasOkText: { fontSize: 12, marginTop: 4 },

  // Sexo
  sexosGrid: { gap: 8 },
  sexoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radii.md, borderWidth: 1.5,
  },
  sexoBtnText: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Suscripción Creador
  creatorSubCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    gap: 2,
  },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  subTitle: { fontSize: 16, fontWeight: '800' },
  subDesc: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    height: 48,
    gap: 6,
  },
  priceSymbol: { fontSize: 16, fontWeight: '700' },
  priceTextInput: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 0 },
  priceInterval: { fontSize: 13, fontWeight: '600' },

  // Switch Toggle Customizado
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    marginTop: 20,
    gap: 16,
  },
  toggleLabel: { fontSize: 15, fontWeight: '700' },
  toggleSub: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  switchContainer: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 4,
    justifyContent: 'center',
  },
  switchCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});