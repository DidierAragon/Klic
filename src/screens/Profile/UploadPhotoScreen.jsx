import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { glow, palette, radii } from '../../theme/ui';

export default function UploadPhotoScreen({ navigation }) {
  const [imagen, setImagen] = useState(null);
  const [loading, setLoading] = useState(false);

  const seleccionarImagen = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });

    if (!result.canceled) {
      setImagen(result.assets[0]);
    }
  };

  const subirFoto = async () => {
    if (!imagen) {
      Alert.alert('Error', 'Selecciona una imagen primero');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      }

      // Convertir imagen a blob
      const response = await fetch(imagen.uri);
      if (!response.ok) {
        throw new Error('No pudimos leer la imagen seleccionada.');
      }
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const extension = imagen?.mimeType?.includes('png') ? 'png' : 'jpg';
      const fileName = `${user.id}/${Date.now()}.${extension}`;

      // Subir a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('fotos')
        .upload(fileName, arrayBuffer, {
          contentType: imagen?.mimeType || 'image/jpeg',
        });

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('fotos')
        .getPublicUrl(fileName);

      // Guardar en la tabla fotos_perfil
      const { error: dbError } = await supabase
        .from('fotos_perfil')
        .insert({
          user_id: user.id,
          url: publicUrl,
        });

      if (dbError) throw dbError;

      Alert.alert('¡Listo!', 'Foto subida exitosamente', [
        { text: 'OK', onPress: () => navigation.replace('SmashOrPass') }
      ]);

    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.title}>Tu carta de presentación</Text>
        <Text style={styles.subtitle}>Sube una foto potente para destacar en el feed.</Text>

        <TouchableOpacity style={styles.selector} onPress={seleccionarImagen}>
          {imagen ? (
            <Image source={{ uri: imagen.uri }} style={styles.preview} />
          ) : (
            <Text style={styles.selectorText}>Seleccionar foto</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={subirFoto}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={palette.text} />
          ) : (
            <Text style={styles.buttonText}>Publicar foto</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('SmashOrPass')}>
          <Text style={styles.skip}>Saltar por ahora</Text>
        </TouchableOpacity>
      </View>
      <MainMenu navigation={navigation} active="UploadPhoto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  title: { fontSize: 34, fontWeight: '800', color: palette.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: palette.textMuted, marginBottom: 30, textAlign: 'center', lineHeight: 20 },
  selector: {
    width: 270,
    height: 360,
    borderRadius: radii.lg,
    backgroundColor: palette.panel,
    justifyContent: 'center',
    alignItems: 'center', marginBottom: 30, overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
  },
  preview: { width: '100%', height: '100%' },
  selectorText: { color: palette.textMuted, fontSize: 18, fontWeight: '600' },
  button: {
    backgroundColor: palette.primary,
    borderRadius: radii.md,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
    ...glow,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: palette.text, fontWeight: '700', fontSize: 16 },
  skip: { color: palette.secondary, fontSize: 14, fontWeight: '600' },
});