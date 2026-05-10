import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { usuarioPuedePanelCreador } from '../../utils/creatorAccess';
import MainMenu from '../../components/MainMenu';
import { useTema } from '../../context/TemaContext';
import { radii } from '../../theme/ui';

const TIPO_LABEL = {
  fotos_perfil: 'Foto',
  videos: 'Video',
  opiniones: 'Opinión',
};

function ingresoNeto(row) {
  const bruto = Number(row.monto_pagado) || 0;
  const com = Number(row.comision_plataforma) || 0;
  return Math.max(0, bruto - com);
}

function inicioMesLocal(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export default function CreatorDashboardScreen({ navigation }) {
  const { palette } = useTema();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [esCreador, setEsCreador] = useState(null);
  const [mesNeto, setMesNeto] = useState(0);
  const [totalNeto, setTotalNeto] = useState(0);
  const [itemsVentas, setItemsVentas] = useState([]);
  const [compradores, setCompradores] = useState([]);

  const cargar = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setEsCreador(false);
        return;
      }

      const permitido = await usuarioPuedePanelCreador(user.id);
      if (!permitido) {
        setEsCreador(false);
        return;
      }

      setEsCreador(true);

      const { data: ventas, error: eVentas } = await supabase
        .from('compras')
        .select('id, monto_pagado, comision_plataforma, contenido_id, tipo_contenido, created_at, comprador_id')
        .eq('user_id', user.id)
        .eq('estado', 'completado')
        .order('created_at', { ascending: false });

      if (eVentas) {
        console.warn('CreatorDashboard ventas', eVentas);
      }

      const lista = ventas || [];
      const t0 = inicioMesLocal().getTime();

      let sumMes = 0;
      let sumTotal = 0;
      for (const v of lista) {
        const n = ingresoNeto(v);
        sumTotal += n;
        const ts = new Date(v.created_at).getTime();
        if (ts >= t0) sumMes += n;
      }
      setMesNeto(sumMes);
      setTotalNeto(sumTotal);

      const porClave = new Map();
      for (const v of lista) {
        const key = `${v.tipo_contenido}:${v.contenido_id}`;
        const cur = porClave.get(key) || { ventas: 0, neto: 0, tipo: v.tipo_contenido, contenido_id: v.contenido_id };
        cur.ventas += 1;
        cur.neto += ingresoNeto(v);
        porClave.set(key, cur);
      }

      const [{ data: fotos }, { data: videos }, { data: opin }] = await Promise.all([
        supabase.from('fotos_perfil').select('id, precio, url').eq('user_id', user.id).gt('precio', 0),
        supabase.from('videos').select('id, precio, url, descripcion').eq('user_id', user.id).gt('precio', 0),
        supabase.from('opiniones').select('id, precio, contenido').eq('user_id', user.id).gt('precio', 0),
      ]);

      const publicados = [
        ...(fotos || []).map((r) => ({
          key: `fotos_perfil:${r.id}`,
          tipo: 'fotos_perfil',
          id: r.id,
          titulo: 'Foto premium',
          subtitulo: r.url?.slice(0, 48) || '',
          thumb: r.url,
          ventas: 0,
          neto: 0,
        })),
        ...(videos || []).map((r) => ({
          key: `videos:${r.id}`,
          tipo: 'videos',
          id: r.id,
          titulo: 'Video premium',
          subtitulo: r.descripcion || r.url?.slice(0, 40) || '',
          thumb: null,
          ventas: 0,
          neto: 0,
        })),
        ...(opin || []).map((r) => ({
          key: `opiniones:${r.id}`,
          tipo: 'opiniones',
          id: r.id,
          titulo: 'Opinión de pago',
          subtitulo: (r.contenido || '').slice(0, 60) + ((r.contenido || '').length > 60 ? '…' : ''),
          thumb: null,
          ventas: 0,
          neto: 0,
        })),
      ];

      for (const p of publicados) {
        const agg = porClave.get(p.key);
        if (agg) {
          p.ventas = agg.ventas;
          p.neto = agg.neto;
        }
      }

      publicados.sort((a, b) => b.neto - a.neto || b.ventas - a.ventas);
      setItemsVentas(publicados);

      const recientes = lista.slice(0, 25);
      const ids = [...new Set(recientes.map((r) => r.comprador_id).filter(Boolean))];
      let mapaNombres = {};
      if (ids.length) {
        const { data: buyers } = await supabase
          .from('users')
          .select('id, nombre, avatar_url')
          .in('id', ids);
        mapaNombres = Object.fromEntries((buyers || []).map((u) => [u.id, u]));
      }

      setCompradores(
        recientes.map((c) => ({
          ...c,
          buyer: mapaNombres[c.comprador_id] || { nombre: 'Usuario', avatar_url: null },
        }))
      );
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const styles = makeStyles(palette);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!esCreador) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.deniedBox}>
          <Ionicons name="lock-closed-outline" size={48} color={palette.textMuted} />
          <Text style={styles.deniedTitle}>Sin acceso al panel</Text>
          <Text style={styles.deniedText}>
            Solo quien publica contenido de pago (precio mayor a 0) puede ver ventas y ganancias. Publica una foto, video u opinión con precio, o entra con la cuenta que subió ese contenido — no con la cuenta que solo compró.
          </Text>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: palette.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backBtnText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const mesNombre = new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' });

  return (
    <View style={[styles.wrapper, { justifyContent: 'space-between' }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backIcon} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={palette.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Panel creador</Text>
          <View style={{ width: 34 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={palette.primary} />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>Resumen de ganancias y ventas de tu contenido de pago.</Text>

          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { borderColor: palette.border, backgroundColor: palette.panel }]}>
              <Text style={styles.metricLabel}>Este mes</Text>
              <Text style={[styles.metricValue, { color: palette.primary }]}>${mesNeto.toFixed(2)}</Text>
              <Text style={styles.metricHint}>{mesNombre}</Text>
            </View>
            <View style={[styles.metricCard, { borderColor: palette.border, backgroundColor: palette.panel }]}>
              <Text style={styles.metricLabel}>Acumulado</Text>
              <Text style={[styles.metricValue, { color: palette.secondary }]}>${totalNeto.toFixed(2)}</Text>
              <Text style={styles.metricHint}>Todas las ventas</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Contenido publicado</Text>
          <Text style={styles.sectionSub}>Ventas e ingreso neto (después de comisión) por ítem.</Text>

          {itemsVentas.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: palette.border }]}>
              <Ionicons name="images-outline" size={40} color={palette.textMuted} />
              <Text style={styles.emptyTitle}>Sin contenido de pago</Text>
              <Text style={styles.emptySub}>Publica fotos, videos u opiniones con precio mayor a 0.</Text>
            </View>
          ) : (
            <View style={[styles.tableCard, { borderColor: palette.border }]}>
              {itemsVentas.map((row, idx) => (
                <View
                  key={row.key}
                  style={[
                    styles.tableRow,
                    idx < itemsVentas.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.border },
                  ]}
                >
                  <View style={styles.rowLeft}>
                    {row.thumb ? (
                      <Image source={{ uri: row.thumb }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumbPlaceholder, { backgroundColor: palette.panelSoft }]}>
                        <Ionicons name="document-text-outline" size={20} color={palette.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={styles.tipoPill}>
                        <Text style={styles.tipoPillText}>{TIPO_LABEL[row.tipo] || row.tipo}</Text>
                      </View>
                      <Text style={styles.itemTitulo} numberOfLines={1}>{row.titulo}</Text>
                      {!!row.subtitulo && (
                        <Text style={styles.itemSub} numberOfLines={2}>{row.subtitulo}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.ventasNum}>{row.ventas} venta{row.ventas !== 1 ? 's' : ''}</Text>
                    <Text style={[styles.netoNum, { color: palette.primary }]}>${row.neto.toFixed(2)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Compradores recientes</Text>
          <Text style={styles.sectionSub}>Últimas ventas completadas (máx. 25).</Text>

          {compradores.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: palette.border }]}>
              <Ionicons name="cart-outline" size={40} color={palette.textMuted} />
              <Text style={styles.emptyTitle}>Aún no hay ventas</Text>
              <Text style={styles.emptySub}>Cuando alguien compre tu contenido, aparecerá aquí.</Text>
            </View>
          ) : (
            <View style={[styles.tableCard, { borderColor: palette.border }]}>
              {compradores.map((c, idx) => (
                <View
                  key={c.id}
                  style={[
                    styles.buyerRow,
                    idx < compradores.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.border },
                  ]}
                >
                  {c.buyer?.avatar_url ? (
                    <Image source={{ uri: c.buyer.avatar_url }} style={styles.buyerAvatar} />
                  ) : (
                    <View style={[styles.buyerAvatarPh, { backgroundColor: palette.primary + '33' }]}>
                      <Text style={[styles.buyerInitial, { color: palette.primary }]}>
                        {(c.buyer?.nombre || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.buyerName}>{c.buyer?.nombre || 'Usuario'}</Text>
                    <Text style={styles.buyerMeta}>
                      {TIPO_LABEL[c.tipo_contenido] || c.tipo_contenido} · ${ingresoNeto(c).toFixed(2)} neto
                    </Text>
                  </View>
                  <Text style={styles.buyerFecha}>
                    {new Date(c.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>

      <MainMenu navigation={navigation} active="CreatorDashboard" />
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, backgroundColor: palette.bg, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backIcon: { padding: 8 },
  topTitle: { fontSize: 18, fontWeight: '800', color: palette.text },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  intro: { color: palette.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 20 },

  metricsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  metricCard: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 16,
  },
  metricLabel: { color: palette.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  metricValue: { fontSize: 24, fontWeight: '900' },
  metricHint: { color: palette.textMuted, fontSize: 11, marginTop: 6 },

  sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  sectionSub: { color: palette.textMuted, fontSize: 13, marginBottom: 14 },

  tableCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowRight: { alignItems: 'flex-end' },
  thumb: { width: 48, height: 48, borderRadius: radii.sm },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipoPill: {
    alignSelf: 'flex-start',
    backgroundColor: palette.panelSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
    marginBottom: 4,
  },
  tipoPillText: { fontSize: 10, fontWeight: '700', color: palette.textMuted },
  itemTitulo: { color: palette.text, fontSize: 14, fontWeight: '700' },
  itemSub: { color: palette.textMuted, fontSize: 12, marginTop: 2 },

  ventasNum: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  netoNum: { fontSize: 15, fontWeight: '800' },

  buyerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  buyerAvatar: { width: 40, height: 40, borderRadius: 20 },
  buyerAvatarPh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyerInitial: { fontSize: 16, fontWeight: '800' },
  buyerName: { color: palette.text, fontSize: 14, fontWeight: '700' },
  buyerMeta: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  buyerFecha: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },

  emptyCard: {
    alignItems: 'center',
    padding: 28,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
  },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
  emptySub: { color: palette.textMuted, fontSize: 13, textAlign: 'center' },

  deniedBox: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  deniedTitle: { color: palette.text, fontSize: 22, fontWeight: '800' },
  deniedText: { color: palette.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  backBtn: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 14, borderRadius: radii.pill },
  backBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
