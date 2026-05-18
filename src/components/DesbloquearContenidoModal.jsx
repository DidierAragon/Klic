import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { useTema } from '../context/TemaContext';
import { useWallet } from '../context/WalletContext';
import { radii } from '../theme/ui';
import KlicCoin from './KlicCoin';

export default function DesbloquearContenidoModal({
  visible,
  onClose,
  item, // { id, precio, user_id, __tabla, users: { nombre, avatar_url } }
  onSuccess
}) {
  const { palette } = useTema();
  const { balance, buyContent, refreshWallet } = useWallet();

  const [codigoInput, setCodigoInput] = useState('');
  const [cangueando, setCangueando] = useState(false);
  const [cuponAplicado, setCuponAplicado] = useState(false);
  const [codigoCanjeado, setCodigoCanjeado] = useState('');
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0);
  const [desbloqueando, setDesbloqueando] = useState(false);

  const styles = makeStyles(palette);

  // Reset al abrir
  useEffect(() => {
    if (visible) {
      setCodigoInput('');
      setCuponAplicado(false);
      setCodigoCanjeado('');
      setDescuentoPorcentaje(0);
      setDesbloqueando(false);
    }
  }, [visible]);

  if (!item) return null;

  const originalCoinsCost = Math.round(item.precio * 100);
  const coinsCostConDescuento = cuponAplicado
    ? Math.round(originalCoinsCost * (1 - descuentoPorcentaje / 100))
    : originalCoinsCost;

  const validarYAplicarCodigo = async () => {
    const cleanCode = codigoInput.trim().toUpperCase();
    if (!cleanCode) return;

    setCangueando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Inicia sesión', 'Debes iniciar sesión para validar un cupón.');
        return;
      }

      // Validamos el cupón en la base de datos
      const { data, error } = await supabase.rpc('redeem_coupon', {
        p_user_id: user.id,
        p_codigo: cleanCode
      });

      if (error) throw error;
      const res = typeof data === 'string' ? JSON.parse(data) : data;

      if (!res.success) {
        throw new Error(res.message || 'Código inválido');
      }

      // IMPORTANTE: Asegurar que el cupón pertenece al creador del post
      if (res.creador_id !== item.user_id) {
        throw new Error('Este cupón no pertenece al creador de este contenido.');
      }

      Alert.alert('✓ ¡Aplicado!', res.message);

      setDescuentoPorcentaje(res.porcentaje);
      setCodigoCanjeado(cleanCode);
      setCuponAplicado(true);
      setCodigoInput('');
    } catch (e) {
      Alert.alert('Error de Cupón', e.message || 'Cupón inválido, expirado o de otro creador.');
    } finally {
      setCangueando(false);
    }
  };

  const removerCupon = () => {
    setCuponAplicado(false);
    setCodigoCanjeado('');
    setDescuentoPorcentaje(0);
  };

  const confirmarDesbloqueo = async () => {
    if (balance < coinsCostConDescuento) {
      Alert.alert(
        'Saldo Insuficiente',
        `No tienes suficientes Klic Coins. Necesitas ${coinsCostConDescuento} 🪙 (Tienes ${balance} 🪙).`,
        [{ text: 'OK' }]
      );
      return;
    }

    setDesbloqueando(true);
    try {
      // 1. Ejecutar compra por monedas
      const result = await buyContent(item.id, item.__tabla || 'fotos_perfil', coinsCostConDescuento, item.user_id);
      
      if (!result.success) {
        throw new Error(result.message || 'Ocurrió un error al comprar el contenido.');
      }

      // 2. Si se usó un cupón, consumirlo en la base de datos de manera definitiva
      if (cuponAplicado && codigoCanjeado) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.rpc('mark_coupon_used', {
            p_user_id: user.id,
            p_codigo: codigoCanjeado
          });
        }
      }

      // 3. Acreditar y refrescar
      await refreshWallet();
      Alert.alert('✓ ¡Éxito!', 'Contenido desbloqueado correctamente 🎉');
      
      if (onSuccess) onSuccess(item.id);
      onClose();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo procesar la compra.');
    } finally {
      setDesbloqueando(false);
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
            
            {/* Cabecera */}
            <View style={[styles.header, { borderBottomColor: palette.border }]}>
              <View style={styles.headerLeft}>
                <Ionicons name="lock-closed" size={22} color={palette.primary} />
                <View>
                  <Text style={[styles.title, { color: palette.text }]}>Desbloquear Contenido</Text>
                  <Text style={[styles.subTitle, { color: palette.textMuted }]}>
                    Creador: @{item.users?.nombre || 'Creador'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} disabled={desbloqueando} style={[styles.closeBtn, { backgroundColor: palette.panelSoft }]}>
                <Ionicons name="close" size={20} color={palette.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              
              {/* Saldo de Billetera */}
              <View style={[styles.balanceRow, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
                <Text style={[styles.balanceLabel, { color: palette.textMuted }]}>Mi Saldo:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <KlicCoin size={16} />
                  <Text style={[styles.balanceNum, { color: palette.text }]}>{balance} Monedas</Text>
                </View>
              </View>

              {/* Caja de Precio */}
              <View style={[styles.priceBox, { borderColor: palette.primary + '33', backgroundColor: palette.primary + '0a' }]}>
                <Text style={[styles.priceLabel, { color: palette.textMuted }]}>Costo de Desbloqueo</Text>
                <View style={styles.priceRow}>
                  <KlicCoin size={28} />
                  {cuponAplicado ? (
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={[styles.priceNum, { color: palette.text }]}>
                        {coinsCostConDescuento}
                      </Text>
                      <Text style={{ color: palette.textMuted, textDecorationLine: 'line-through', fontSize: 16, fontWeight: '600' }}>
                        {originalCoinsCost}
                      </Text>
                      <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '700' }}>
                        (-{descuentoPorcentaje}%)
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.priceNum, { color: palette.text }]}>
                      {originalCoinsCost}
                    </Text>
                  )}
                  <Text style={[styles.priceSuffix, { color: palette.primary }]}>Coins</Text>
                </View>
              </View>

              {/* Cupón */}
              <Text style={[styles.inputLabel, { color: palette.text }]}>Cupón de Descuento</Text>
              <View style={{ marginBottom: 24 }}>
                {cuponAplicado ? (
                  <View style={[styles.couponApplied, { backgroundColor: '#10b9811a', borderColor: '#10b98155' }]}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                      <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '700' }}>
                        Cupón "{codigoCanjeado}" (-{descuentoPorcentaje}%)
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
                      placeholder="Ingresa código (ej. PROMO50) 🎫"
                      placeholderTextColor={palette.textMuted}
                      value={codigoInput}
                      onChangeText={setCodigoInput}
                      autoCapitalize="characters"
                      maxLength={18}
                      editable={!cangueando}
                    />
                    <TouchableOpacity
                      style={[styles.couponApplyBtn, { backgroundColor: palette.secondary }]}
                      onPress={validarYAplicarCodigo}
                      disabled={cangueando}
                    >
                      {cangueando ? (
                        <ActivityIndicator size="small" color="#07070b" />
                      ) : (
                        <Text style={styles.couponApplyText}>Aplicar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Botones de Acción */}
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: palette.primary }]}
                onPress={confirmarDesbloqueo}
                disabled={desbloqueando}
              >
                {desbloqueando ? (
                  <ActivityIndicator size="small" color="#07070b" />
                ) : (
                  <>
                    <Ionicons name="lock-open-outline" size={20} color="#07070b" />
                    <Text style={styles.confirmBtnText}>Desbloquear ahora por {coinsCostConDescuento} 🪙</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={desbloqueando}
              >
                <Text style={[styles.cancelBtnText, { color: palette.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>

            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 7, 11, 0.85)',
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subTitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  balanceNum: {
    fontSize: 13,
    fontWeight: '800',
  },
  priceBox: {
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 20,
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceNum: {
    fontSize: 26,
    fontWeight: '900',
  },
  priceSuffix: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  couponInput: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: '600',
  },
  couponApplyBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  couponApplyText: {
    color: '#07070b',
    fontWeight: '800',
    fontSize: 13,
  },
  couponApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 44,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 50,
    borderRadius: radii.pill,
    marginBottom: 12,
  },
  confirmBtnText: {
    color: '#07070b',
    fontWeight: '800',
    fontSize: 14,
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
