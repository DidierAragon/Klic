import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

const TIPOS = [
  { key: 'foto',    label: 'Foto',    icon: 'image-outline' },
  { key: 'opinion', label: 'Opinión', icon: 'chatbubble-outline' },
  { key: 'video',   label: 'Video',   icon: 'videocam-outline' },
];

export default function UploadPhotoScreen({ navigation }) {
  const { palette, glow } = useTema();
  const [tipo, setTipo] = useState('foto');
  const [media, setMedia] = useState(null);
  const [texto, setTexto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
  const [loading, setLoading] = useState(false);

  const styles = makeStyles(palette);

  const seleccionarMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería');
      return;
    }

    const options = {
      allowsEditing: true,
      quality: 0.8,
    };

    if (tipo === 'foto') {
      options.mediaTypes = ['images'];
      options.aspect = [3, 4];
    } else if (tipo === 'video') {
      options.mediaTypes = ['videos'];
      options.videoMaxDuration = 60;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) setMedia(result.assets[0]);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo abrir la galería');
    }
  };

  const publicar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Error', 'Sesión expirada'); return; }

    if (tipo === 'opinion') {
      if (!texto.trim()) { Alert.alert('Error', 'Escribe algo primero'); return; }
    } else {
      if (!media) { Alert.alert('Error', `Selecciona un${tipo === 'foto' ? 'a foto' : ' video'} primero`); return; }
    }

    const precioFinal = parseFloat(precio) || 0;

    setLoading(true);
    try {
      if (tipo === 'opinion') {
        const { error } = await supabase.from('opiniones').insert({
          user_id: user.id,
          contenido: texto.trim(),
          precio: precioFinal,
        });
        if (error) throw error;

      } else {
        const bucket = tipo === 'foto' ? 'fotos' : 'videos';
        const ext = tipo === 'foto'
          ? (media.mimeType?.includes('png') ? 'png' : 'jpg')
          : 'mp4';
        const fileName = `${user.id}/${Date.now()}.${ext}`;
        const contentType = tipo === 'foto'
          ? (media.mimeType || 'image/jpeg')
          : (media.mimeType || 'video/mp4');

        const response = await fetch(media.uri);
        if (!response.ok) throw new Error('No se pudo leer el archivo');
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, arrayBuffer, { contentType });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);

        if (tipo === 'foto') {
          const { error } = await supabase.from('fotos_perfil').insert({
            user_id: user.id, 
            url: publicUrl,
            precio: precioFinal,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('videos').insert({
            user_id: user.id,
            url: publicUrl,
            descripcion: descripcion.trim() || null,
            precio: precioFinal,
          });
          if (error) throw error;
        }
      }

      Alert.alert('✓ Publicado', '¡Tu contenido ya está en el feed!', [
        { text: 'Ver feed', onPress: () => navigation.navigate('Home') }
      ]);
      setMedia(null);
      setTexto('');
      setDescripcion('');
      setPrecio('');

    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const canPublish = tipo === 'opinion' ? texto.trim().length > 0 : !!media;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Publicar</Text>
          <Text style={styles.subtitle}>Comparte fotos, opiniones o videos con la comunidad</Text>
        </View>

        {/* Selector de tipo */}
        <View style={styles.tiposRow}>
          {TIPOS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.tipoBtn,
                { borderColor: tipo === t.key ? palette.primary : palette.border },
                tipo === t.key && { backgroundColor: palette.primary + '20' }
              ]}
              onPress={() => { setTipo(t.key); setMedia(null); setTexto(''); }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={t.icon}
                size={20}
                color={tipo === t.key ? palette.primary : palette.textMuted}
              />
              <Text style={[
                styles.tipoBtnText,
                { color: tipo === t.key ? palette.primary : palette.textMuted }
              ]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Contenido según tipo */}
        {tipo === 'opinion' ? (
          <View style={styles.opinionBox}>
            <TextInput
              style={styles.opinionInput}
              placeholder="¿Qué está pasando? Comparte tu opinión..."
              placeholderTextColor={palette.textMuted}
              value={texto}
              onChangeText={setTexto}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{texto.length}/500</Text>
          </View>

        ) : (
          <>
            <TouchableOpacity style={styles.selector} onPress={seleccionarMedia} activeOpacity={0.8}>
              {media ? (
                tipo === 'foto' ? (
                  <Image source={{ uri: media.uri }} style={styles.preview} resizeMode="cover" />
                ) : (
                  <View style={styles.videoPreview}>
                    <Ionicons name="videocam" size={48} color={palette.primary} />
                    <Text style={[styles.videoPreviewText, { color: palette.primary }]}>Video seleccionado</Text>
                    <Text style={styles.videoPreviewSub}>
                      {media.duration ? `${Math.round(media.duration)}s` : ''}
                    </Text>
                  </View>
                )
              ) : (
                <View style={styles.selectorVacio}>
                  <Ionicons
                    name={tipo === 'foto' ? 'image-outline' : 'videocam-outline'}
                    size={48}
                    color={palette.textMuted}
                  />
                  <Text style={styles.selectorText}>
                    {tipo === 'foto' ? 'Seleccionar foto' : 'Seleccionar video'}
                  </Text>
                  <Text style={styles.selectorHint}>
                    {tipo === 'foto' ? 'JPG, PNG • Recomendado 3:4' : 'MP4 • Máximo 60 segundos'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {media && (
              <TouchableOpacity
                style={styles.cambiarBtn}
                onPress={seleccionarMedia}
              >
                <Ionicons name="refresh-outline" size={16} color={palette.secondary} />
                <Text style={[styles.cambiarText, { color: palette.secondary }]}>
                  Cambiar {tipo === 'foto' ? 'foto' : 'video'}
                </Text>
              </TouchableOpacity>
            )}

            {tipo === 'video' && media && (
              <TextInput
                style={styles.descInput}
                placeholder="Descripción del video (opcional)"
                placeholderTextColor={palette.textMuted}
                value={descripcion}
                onChangeText={setDescripcion}
                maxLength={200}
              />
            )}

            {media && (
              <View style={styles.priceContainer}>
                <Ionicons name="pricetag-outline" size={20} color={palette.primary} />
                <TextInput
                  style={styles.priceInput}
                  placeholder="Precio (opcional, ej: 4.99)"
                  placeholderTextColor={palette.textMuted}
                  value={precio}
                  onChangeText={setPrecio}
                  keyboardType="numeric"
                />
                <Text style={{ color: palette.textMuted, fontSize: 12 }}>USD</Text>
              </View>
            )}
          </>
        )}

        {tipo === 'opinion' && (
          <View style={[styles.priceContainer, { marginTop: -10, marginBottom: 20 }]}>
            <Ionicons name="pricetag-outline" size={20} color={palette.primary} />
            <TextInput
              style={styles.priceInput}
              placeholder="Precio para ver esta opinión (opcional)"
              placeholderTextColor={palette.textMuted}
              value={precio}
              onChangeText={setPrecio}
              keyboardType="numeric"
            />
            <Text style={{ color: palette.textMuted, fontSize: 12 }}>USD</Text>
          </View>
        )}

        {/* Botón publicar */}
        <TouchableOpacity
          style={[
            styles.publishBtn,
            { backgroundColor: palette.primary, shadowColor: palette.primary },
            (!canPublish || loading) && styles.publishBtnDisabled
          ]}
          onPress={publicar}
          disabled={!canPublish || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.publishBtnText}>
                {tipo === 'foto' ? 'Publicar foto'
                  : tipo === 'opinion' ? 'Publicar opinión'
                  : 'Publicar video'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={[styles.skipText, { color: palette.textMuted }]}>Saltar por ahora</Text>
        </TouchableOpacity>

      </ScrollView>

      <MainMenu navigation={navigation} active="UploadPhoto" />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },

  header: { marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '800', color: palette.text, marginBottom: 4 },
  subtitle: { color: palette.textMuted, fontSize: 14, lineHeight: 20 },

  tiposRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tipoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: radii.md,
    borderWidth: 1.5,
  },
  tipoBtnText: { fontSize: 13, fontWeight: '700' },

  // Opinión
  opinionBox: {
    backgroundColor: palette.panel, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.border,
    padding: 16, marginBottom: 20,
  },
  opinionInput: {
    color: palette.text, fontSize: 16,
    minHeight: 160, lineHeight: 24,
  },
  charCount: { color: palette.textMuted, fontSize: 12, textAlign: 'right', marginTop: 8 },

  // Selector media
  selector: {
    width: '100%', height: 300,
    borderRadius: radii.lg, overflow: 'hidden',
    backgroundColor: palette.panel,
    borderWidth: 1.5, borderColor: palette.border,
    borderStyle: 'dashed', marginBottom: 12,
  },
  preview: { width: '100%', height: '100%' },
  videoPreview: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  videoPreviewText: { fontSize: 16, fontWeight: '700' },
  videoPreviewSub: { color: palette.textMuted, fontSize: 13 },
  selectorVacio: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  selectorText: { color: palette.textMuted, fontSize: 16, fontWeight: '600' },
  selectorHint: { color: palette.border, fontSize: 12 },

  cambiarBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginBottom: 12,
  },
  cambiarText: { fontSize: 14, fontWeight: '600' },

  descInput: {
    backgroundColor: palette.panel, color: palette.text,
    borderRadius: radii.md, borderWidth: 1, borderColor: palette.border,
    padding: 14, fontSize: 15, marginBottom: 16,
  },

  // Botón publicar
  publishBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    borderRadius: radii.md, padding: 16,
    marginBottom: 12,
    shadowOpacity: 0.4, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  publishBtnDisabled: { opacity: 0.45 },
  publishBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  priceContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.panel, borderRadius: radii.md,
    borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 20,
  },
  priceInput: {
    flex: 1, color: palette.text, fontSize: 15,
    paddingVertical: 4,
  },

  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, fontWeight: '600' },
});