import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl, Clipboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { useTema } from '../../context/TemaContext';
import { radii } from '../../theme/ui';

export default function MisCuponesScreen({ navigation }) {
  const { palette } = useTema();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Lista de cupones
  const [cupones, setCupones] = useState([]);
  const [segmento, setSegmento] = useState('activos'); // 'activos' | 'usados'

  // Formulario para crear
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [porcentaje, setPorcentaje] = useState(50); // 10, 25, 50, 100
  const [creando, setCreando] = useState(false);

  const styles = makeStyles(palette);

  const cargarCupones = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('codigos_descuento')
        .select(`
          id,
          codigo,
          porcentaje_descuento,
          usado,
          created_at,
          redeemer:usado_por_id(nombre)
        `)
        .eq('creador_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCupones(data || []);

    } catch (e) {
      Alert.alert('Error al cargar', e.message || 'No se pudieron recuperar los cupones.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cargarCupones();
  }, [cargarCupones]);

  const onRefresh = () => {
    setRefreshing(true);
    cargarCupones();
  };

  // Generar código aleatorio
  const autogenerarCodigo = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'KLIC-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNuevoCodigo(code);
  };

  const crearCupon = async () => {
    const cleanCode = nuevoCodigo.trim().toUpperCase();
    if (!cleanCode) {
      Alert.alert('Error', 'Ingresa o autogenera un código para el cupón');
      return;
    }
    if (porcentaje <= 0 || porcentaje > 100) {
      Alert.alert('Error', 'El porcentaje debe estar entre 1% y 100%');
      return;
    }

    setCreando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesión expirada');

      const { error } = await supabase
        .from('codigos_descuento')
        .insert({
          creador_id: user.id,
          codigo: cleanCode,
          porcentaje_descuento: porcentaje
        });

      if (error) {
        if (error.code === '23505') {
          throw new Error('Ese código ya existe. Prueba con otro nombre o autogenéralo.');
        }
        throw error;
      }

      Alert.alert('✓ ¡Creado!', `El cupón ${cleanCode} del ${porcentaje}% ha sido activado.`);
      setNuevoCodigo('');
      cargarCupones();
    } catch (e) {
      Alert.alert('Error al crear', e.message);
    } finally {
      setCreando(false);
    }
  };

  const copiarPortapapeles = (codigo) => {
    Clipboard.setString(codigo);
    Alert.alert('¡Copiado!', `El código "${codigo}" fue copiado al portapapeles.`);
  };

  const eliminarCupon = (id, codigo) => {
    Alert.alert(
      'Eliminar código',
      `¿Seguro que deseas eliminar el código "${codigo}"? Ya no podrá ser canjeado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('codigos_descuento')
              .delete()
              .eq('id', id);
            if (error) {
              Alert.alert('Error', 'No se pudo eliminar el cupón.');
            } else {
              setCupones(p => p.filter(c => c.id !== id));
            }
          }
        }
      ]
    );
  };

  // Filtrar cupones
  const cuponesFiltrados = cupones.filter(c => 
    segmento === 'activos' ? !c.usado : c.usado
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      
      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: palette.text }]}>Cupones de Descuento 🎫</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        
        {/* Panel para Crear Nuevo Cupón */}
        <View style={[styles.creationCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Generar Nuevo Código Único</Text>
          <Text style={[styles.cardDesc, { color: palette.textMuted }]}>
            Crea un cupón promocional de **1 solo uso** para regalar suscripciones o dar descuentos especiales.
          </Text>

          {/* Input del Código */}
          <Text style={[styles.label, { color: palette.text }]}>Nombre del Código</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, {
                backgroundColor: palette.panelSoft,
                borderColor: palette.border,
                color: palette.text
              }]}
              placeholder="e.g. PASION-GOD"
              placeholderTextColor={palette.textMuted}
              value={nuevoCodigo}
              onChangeText={setNuevoCodigo}
              autoCapitalize="characters"
              maxLength={15}
              editable={!creando}
            />
            <TouchableOpacity
              style={[styles.genBtn, { backgroundColor: palette.primary }]}
              onPress={autogenerarCodigo}
              disabled={creando}
            >
              <Ionicons name="shuffle" size={20} color="#07070b" />
              <Text style={styles.genBtnText}>Autogen</Text>
            </TouchableOpacity>
          </View>

          {/* Descuento Chips */}
          <Text style={[styles.label, { color: palette.text }]}>Porcentaje de Descuento</Text>
          <View style={styles.percentRow}>
            {[10, 25, 50, 100].map(val => (
              <TouchableOpacity
                key={val}
                style={[
                  styles.percentBtn,
                  {
                    borderColor: porcentaje === val ? palette.primary : palette.border,
                    backgroundColor: porcentaje === val ? palette.primary + '1a' : palette.panelSoft
                  }
                ]}
                onPress={() => setPorcentaje(val)}
                disabled={creando}
              >
                <Text style={[
                  styles.percentText,
                  { color: porcentaje === val ? palette.primary : palette.text }
                ]}>
                  {val === 100 ? '100% GRATIS 🎁' : `${val}% desc`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Botón de Creación */}
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: palette.secondary }]}
            onPress={crearCupon}
            disabled={creando}
            activeOpacity={0.8}
          >
            {creando ? (
              <ActivityIndicator size="small" color="#07070b" />
            ) : (
              <>
                <Ionicons name="ticket" size={20} color="#07070b" />
                <Text style={styles.createBtnText}>Activar Código Promocional</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Selector de Segmento */}
        <View style={[styles.segmentRow, { backgroundColor: palette.panelSoft }]}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              { backgroundColor: segmento === 'activos' ? palette.panel : 'transparent' }
            ]}
            onPress={() => setSegmento('activos')}
          >
            <Text style={[
              styles.segmentText,
              { color: segmento === 'activos' ? palette.primary : palette.textMuted }
            ]}>
              Activos / Sin Usar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentBtn,
              { backgroundColor: segmento === 'usados' ? palette.panel : 'transparent' }
            ]}
            onPress={() => setSegmento('usados')}
          >
            <Text style={[
              styles.segmentText,
              { color: segmento === 'usados' ? palette.primary : palette.textMuted }
            ]}>
              Usados / Historial
            </Text>
          </TouchableOpacity>
        </View>

        {/* Lista de Cupones */}
        {cuponesFiltrados.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: palette.border, backgroundColor: palette.panel }]}>
            <Ionicons name="ticket-outline" size={44} color={palette.textMuted} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>
              {segmento === 'activos' ? 'No tienes códigos activos' : 'Ningún código usado aún'}
            </Text>
            <Text style={[styles.emptySub, { color: palette.textMuted }]}>
              {segmento === 'activos'
                ? 'Genera un cupón arriba para compartirlo y regalar beneficios exclusivos a tus fans.'
                : 'Cuando tus seguidores canjeen los códigos de descuento, aparecerán listados aquí.'}
            </Text>
          </View>
        ) : (
          cuponesFiltrados.map(cupon => (
            <View
              key={cupon.id}
              style={[styles.couponCard, { backgroundColor: palette.panel, borderColor: palette.border }]}
            >
              <View style={styles.couponLeft}>
                <View style={[
                  styles.badgeContainer,
                  { backgroundColor: cupon.porcentaje_descuento === 100 ? '#10b9811c' : palette.primary + '1c' }
                ]}>
                  <Text style={[
                    styles.badgeText,
                    { color: cupon.porcentaje_descuento === 100 ? '#10b981' : palette.primary }
                  ]}>
                    {cupon.porcentaje_descuento === 100 ? 'GRATIS' : `-${cupon.porcentaje_descuento}%`}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.couponCode, { color: palette.text }]}>{cupon.codigo}</Text>
                  <Text style={[styles.couponDate, { color: palette.textMuted }]}>
                    {segmento === 'activos'
                      ? 'Código listo para enviar'
                      : `Canjeado por ${cupon.redeemer?.nombre || 'Usuario'}`}
                  </Text>
                </View>
              </View>

              {/* Botones de acción */}
              {segmento === 'activos' ? (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionIconBtn, { backgroundColor: palette.panelSoft }]}
                    onPress={() => copiarPortapapeles(cupon.codigo)}
                    hitSlop={8}
                  >
                    <Ionicons name="copy-outline" size={18} color={palette.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionIconBtn, { backgroundColor: '#fb71851e' }]}
                    onPress={() => eliminarCupon(cupon.id, cupon.codigo)}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fb7185" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: palette.panelSoft }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  <Text style={[styles.statusText, { color: palette.textMuted }]}>Usado</Text>
                </View>
              )}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  scroll: { padding: 16 },
  creationCard: {
    borderWidth: 1.5,
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '700',
  },
  genBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    height: 48,
  },
  genBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#07070b',
  },
  percentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
  },
  percentBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: radii.md,
  },
  percentText: {
    fontSize: 12,
    fontWeight: '800',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: radii.pill,
  },
  createBtnText: {
    color: '#07070b',
    fontWeight: '800',
    fontSize: 14,
  },
  segmentRow: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    padding: 6,
    marginBottom: 18,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 36,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  couponCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: radii.xl,
    padding: 14,
    marginBottom: 10,
  },
  couponLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badgeContainer: {
    width: 58,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  couponCode: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  couponDate: {
    fontSize: 11.5,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
