import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Image, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase';
import { useTema } from '../context/TemaContext';
import { useWallet } from '../context/WalletContext';
import { radii } from '../theme/ui';
import KlicCoin from './KlicCoin';
import { pickImageToArrayBuffer, guessImageContentType, extensionForContentType } from '../utils/readLocalFile';

const MONTOS_RAPIDOS = [50, 100, 200, 500];

export default function EnviarPropinaModal({
  visible,
  onClose,
  receiverId,
  creatorName,
  receiverAvatarUrl = null,
  postId = null,
  postType = null,
  onSuccess = null
}) {
  const { palette } = useTema();
  const { balance, refreshWallet } = useWallet();

  const [monto, setMonto] = useState('100');
  const [mensaje, setMensaje] = useState('');
  const [media, setMedia] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const styles = makeStyles(palette);

  // Reset al abrir
  useEffect(() => {
    if (visible) {
      setMonto('100');
      setMensaje('');
      setMedia(null);
      setEnviando(false);
    }
  }, [visible]);

  const seleccionarImagen = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para adjuntar fotos.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled) {
        setMedia(result.assets[0]);
      }
    } catch (err) {
      console.warn(err);
      Alert.alert('Error', 'No se pudo abrir la galería');
    }
  };

  const enviarPropina = async () => {
    const coins = parseInt(monto) || 0;
    if (coins <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad de monedas válida');
      return;
    }
    if (balance < coins) {
      Alert.alert(
        'Saldo Insuficiente',
        `No tienes suficientes Klic Coins. Necesitas ${coins} 🪙 (Tienes ${balance} 🪙).`,
        [{ text: 'OK' }]
      );
      return;
    }

    setEnviando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesión expirada');

      let publicUrl = null;

      // 1. Subir la imagen opcional si fue adjuntada
      if (media) {
        const arrayBuffer = await pickImageToArrayBuffer(media);
        const contentType = guessImageContentType(media);
        const ext = extensionForContentType(contentType);
        const fileName = `tips/${user.id}/${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('fotos')
          .upload(fileName, arrayBuffer, { contentType });
        if (uploadErr) throw uploadErr;

        const { data: { publicUrl: url } } = supabase.storage.from('fotos').getPublicUrl(fileName);
        publicUrl = url;
      }

      // 2. Llamar al RPC seguro send_tip_with_coins
      const { data, error } = await supabase.rpc('send_tip_with_coins', {
        p_sender_id: user.id,
        p_receiver_id: receiverId,
        p_monto: coins,
        p_mensaje: mensaje.trim() || null,
        p_image_url: publicUrl,
        p_post_id: postId,
        p_post_type: postType
      });

      if (error) throw error;
      
      const res = typeof data === 'string' ? JSON.parse(data) : data;
      if (!res.success) {
        throw new Error(res.message || 'No se pudo enviar la propina');
      }

      // 3. Acreditar y refrescar
      await refreshWallet();
      Alert.alert('✓ ¡Muchas Gracias!', `Has enviado una propina de ${coins} Klic Coins a ${creatorName}.`);
      
      if (onSuccess) onSuccess();
      onClose();
    } catch (e) {
      Alert.alert('Error al enviar', e.message || 'Ocurrió un error inesperado.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoidView}
        >
          <View style={[styles.modalBox, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            
            {/* Cabecera Premium del Modal */}
            <View style={[styles.header, { borderBottomColor: palette.border }]}>
              <View style={styles.headerLeft}>
                {receiverAvatarUrl ? (
                  <Image source={{ uri: receiverAvatarUrl }} style={[styles.avatar, { borderColor: palette.primary }]} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: palette.panelSoft, borderColor: palette.primary }]}>
                    <Text style={[styles.avatarLetter, { color: palette.primary }]}>{creatorName?.[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View>
                  <Text style={[styles.title, { color: palette.text }]}>Apoyar a {creatorName}</Text>
                  <Text style={[styles.subTitle, { color: palette.textMuted }]}>Regala Klic Coins directamente</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} disabled={enviando} style={[styles.closeBtn, { backgroundColor: palette.panelSoft }]}>
                <Ionicons name="close" size={20} color={palette.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              
              {/* Saldo de Billetera */}
              <View style={[styles.balanceCard, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
                <Text style={[styles.balanceLabel, { color: palette.textMuted }]}>Tu Monedero:</Text>
                <View style={styles.balanceCoins}>
                  <KlicCoin size={18} />
                  <Text style={[styles.balanceNum, { color: palette.text }]}>{balance} Klic Coins</Text>
                </View>
              </View>

              {/* Input Principal de Monedas */}
              <Text style={[styles.label, { color: palette.text }]}>Monto a Enviar</Text>
              <View style={[styles.amountInputRow, { borderColor: palette.primary + '66', backgroundColor: palette.panelSoft }]}>
                <KlicCoin size={26} />
                <TextInput
                  style={[styles.amountInput, { color: palette.text }]}
                  placeholder="0"
                  placeholderTextColor={palette.textMuted}
                  value={monto}
                  onChangeText={val => {
                    if (/^\d*$/.test(val)) setMonto(val);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!enviando}
                />
                <Text style={[styles.amountSuffix, { color: palette.primary, fontWeight: '700' }]}>Coins</Text>
              </View>

              {/* Botones de Selección Rápida */}
              <View style={styles.rapidosRow}>
                {MONTOS_RAPIDOS.map(val => (
                  <TouchableOpacity
                    key={val}
                    style={[
                      styles.rapidoBtn,
                      { 
                        borderColor: parseInt(monto) === val ? palette.primary : palette.border,
                        backgroundColor: parseInt(monto) === val ? palette.primary + '1e' : palette.panelSoft
                      }
                    ]}
                    onPress={() => setMonto(String(val))}
                    disabled={enviando}
                  >
                    <Text style={[
                      styles.rapidoText,
                      { color: parseInt(monto) === val ? palette.primary : palette.text }
                    ]}>
                      +{val} 🪙
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Mensaje de apoyo */}
              <Text style={[styles.label, { color: palette.text }]}>Escribe un mensaje de apoyo (Opcional)</Text>
              <TextInput
                style={[styles.messageInput, {
                  backgroundColor: palette.panelSoft,
                  borderColor: palette.border,
                  color: palette.text
                }]}
                placeholder="Escribe algo lindo... ¡Los creadores aman leer a sus seguidores!"
                placeholderTextColor={palette.textMuted}
                value={mensaje}
                onChangeText={setMensaje}
                multiline
                maxLength={120}
                numberOfLines={3}
                textAlignVertical="top"
                editable={!enviando}
              />
              <Text style={[styles.charCount, { color: palette.textMuted }]}>{mensaje.length}/120</Text>

              {/* Adjuntar Imagen */}
              <Text style={[styles.label, { color: palette.text }]}>Adjuntar foto (Opcional)</Text>
              {media ? (
                <View style={[styles.imagePreviewContainer, { borderColor: palette.border }]}>
                  <Image source={{ uri: media.uri }} style={styles.imagePreview} />
                  <TouchableOpacity
                    style={[styles.removeImageBtn, { backgroundColor: '#fb7185' }]}
                    onPress={() => setMedia(null)}
                    disabled={enviando}
                  >
                    <Ionicons name="trash" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.attachBtn, { borderColor: palette.border, backgroundColor: palette.panelSoft }]}
                  onPress={seleccionarImagen}
                  disabled={enviando}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={24} color={palette.primary} />
                  <Text style={[styles.attachText, { color: palette.textMuted }]}>Tomar o adjuntar una foto de tu galería</Text>
                </TouchableOpacity>
              )}

              {/* Botón de Envío */}
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: palette.primary }]}
                onPress={enviarPropina}
                disabled={enviando}
                activeOpacity={0.8}
              >
                {enviando ? (
                  <ActivityIndicator size="small" color="#07070b" />
                ) : (
                  <>
                    <Ionicons name="gift" size={20} color="#07070b" />
                    <Text style={styles.sendBtnText}>Enviar {parseInt(monto) || 0} Klic Coins</Text>
                  </>
                )}
              </TouchableOpacity>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 7, 11, 0.82)',
    justifyContent: 'flex-end',
  },
  avoidView: {
    width: '100%',
  },
  modalBox: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '800',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subTitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: 20,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  balanceCoins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceNum: {
    fontSize: 14,
    fontWeight: '800',
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 4,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    height: 54,
    gap: 10,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    paddingVertical: 0,
  },
  amountSuffix: {
    fontSize: 13,
  },
  rapidosRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 20,
  },
  rapidoBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1.5,
    borderRadius: radii.md,
  },
  rapidoText: {
    fontSize: 13,
    fontWeight: '800',
  },
  messageInput: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 80,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 16,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 16,
    marginBottom: 24,
  },
  attachText: {
    fontSize: 12,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '100%',
    height: 150,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 24,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: radii.pill,
    elevation: 4,
  },
  sendBtnText: {
    color: '#07070b',
    fontWeight: '800',
    fontSize: 15,
  },
});
