import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Image, Modal, useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { useTema } from '../../context/TemaContext';
import { radii } from '../../theme/ui';
import KlicCoin from '../../components/KlicCoin';

export default function PropinasRecibidasScreen({ navigation }) {
  const { palette } = useTema();
  const { width: winW } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [propinas, setPropinas] = useState([]);
  const [totalMonedas, setTotalMonedas] = useState(0);

  // Estados para el Lightbox de Imágenes
  const [activeImage, setActiveImage] = useState(null);

  const styles = makeStyles(palette);

  const cargarPropinas = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('propinas')
        .select(`
          id,
          monto,
          mensaje,
          image_url,
          created_at,
          sender:sender_id(id, nombre, avatar_url)
        `)
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPropinas(data || []);
      
      // Sumar monedas
      const total = (data || []).reduce((acc, curr) => acc + curr.monto, 0);
      setTotalMonedas(total);

    } catch (e) {
      Alert.alert('Error al cargar', e.message || 'No se pudieron recuperar las propinas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cargarPropinas();
  }, [cargarPropinas]);

  const onRefresh = () => {
    setRefreshing(true);
    cargarPropinas();
  };

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
        <Text style={[styles.title, { color: palette.text }]}>Regalos y Propinas 🎁</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
      >
        {/* Tarjeta de Métricas Total */}
        <View style={[styles.metricsCard, { backgroundColor: palette.panel, borderColor: palette.primary + '33' }]}>
          <View style={styles.metricsHeader}>
            <View style={[styles.giftBadge, { backgroundColor: palette.primary + '1e' }]}>
              <Ionicons name="gift" size={28} color={palette.primary} />
            </View>
            <View>
              <Text style={[styles.metricsSubText, { color: palette.textMuted }]}>Acumulado Ganado</Text>
              <Text style={[styles.metricsTitle, { color: palette.text }]}>Historial de Apoyo</Text>
            </View>
          </View>
          
          <View style={[styles.totalCoinsContainer, { backgroundColor: palette.panelSoft }]}>
            <KlicCoin size={28} />
            <Text style={[styles.totalCoinsText, { color: palette.text }]}>{totalMonedas}</Text>
            <Text style={[styles.coinsLabel, { color: palette.textMuted }]}>Klic Coins</Text>
          </View>
          <Text style={[styles.coinsDisclaimer, { color: palette.textMuted }]}>
            * Estas monedas se acreditan automáticamente a tu saldo para canjear en el Panel de Creador.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
          Propinas Recibidas ({propinas.length})
        </Text>

        {propinas.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: palette.border, backgroundColor: palette.panel }]}>
            <Ionicons name="gift-outline" size={48} color={palette.textMuted} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>Sin propinas aún</Text>
            <Text style={[styles.emptySub, { color: palette.textMuted }]}>
              Comparte contenido exclusivo y anima a tus seguidores a apoyarte con Klic Coins. ¡Tus propinas se verán aquí!
            </Text>
          </View>
        ) : (
          propinas.map((propina) => (
            <View
              key={propina.id}
              style={[styles.tipCard, { backgroundColor: palette.panel, borderColor: palette.border }]}
            >
              {/* Info del Fan */}
              <View style={styles.cardHeader}>
                <View style={styles.fanInfo}>
                  {propina.sender?.avatar_url ? (
                    <Image source={{ uri: propina.sender.avatar_url }} style={styles.fanAvatar} />
                  ) : (
                    <View style={[styles.fanAvatarPlaceholder, { backgroundColor: palette.panelSoft }]}>
                      <Text style={[styles.fanLetter, { color: palette.secondary }]}>
                        {propina.sender?.nombre?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                  )}
                  <View>
                    <Text style={[styles.fanName, { color: palette.text }]}>
                      {propina.sender?.nombre || 'Seguidor de Klic'}
                    </Text>
                    <Text style={[styles.tipDate, { color: palette.textMuted }]}>
                      {new Date(propina.created_at).toLocaleDateString('es-CO', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </Text>
                  </View>
                </View>

                {/* Monto de la Propina */}
                <View style={[styles.amountBadge, { backgroundColor: palette.primary + '18', borderColor: palette.primary }]}>
                  <KlicCoin size={14} />
                  <Text style={[styles.amountText, { color: palette.primary }]}>+{propina.monto}</Text>
                </View>
              </View>

              {/* Mensaje de apoyo */}
              {propina.mensaje ? (
                <View style={[styles.messageBubble, { backgroundColor: palette.panelSoft }]}>
                  <Text style={[styles.messageText, { color: palette.text }]}>
                    "{propina.mensaje}"
                  </Text>
                </View>
              ) : null}

              {/* Foto Adjunta */}
              {propina.image_url ? (
                <TouchableOpacity
                  style={[styles.imageContainer, { borderColor: palette.border }]}
                  onPress={() => setActiveImage(propina.image_url)}
                  activeOpacity={0.9}
                >
                  <Image source={{ uri: propina.image_url }} style={styles.attachedImage} />
                  <View style={styles.zoomOverlay}>
                    <Ionicons name="expand-outline" size={20} color="#fff" />
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Lightbox Modal de Imágenes */}
      <Modal
        visible={!!activeImage}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveImage(null)}
      >
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity style={styles.closeLightbox} onPress={() => setActiveImage(null)} hitSlop={16}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {activeImage && (
            <Image source={{ uri: activeImage }} style={[styles.lightboxImage, { width: winW }]} />
          )}
        </View>
      </Modal>

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
  metricsCard: {
    borderWidth: 1.5,
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 26,
    elevation: 3,
  },
  metricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  giftBadge: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsSubText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricsTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  totalCoinsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.lg,
    gap: 10,
    marginBottom: 12,
  },
  totalCoinsText: {
    fontSize: 32,
    fontWeight: '900',
  },
  coinsLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  coinsDisclaimer: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 36,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  tipCard: {
    borderWidth: 1.5,
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fanInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fanAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  fanAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fanLetter: {
    fontSize: 16,
    fontWeight: '800',
  },
  fanName: {
    fontSize: 14,
    fontWeight: '700',
  },
  tipDate: {
    fontSize: 11,
    marginTop: 2,
  },
  amountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  amountText: {
    fontSize: 12,
    fontWeight: '800',
  },
  messageBubble: {
    borderRadius: radii.lg,
    padding: 12,
    marginTop: 14,
    borderLeftWidth: 3,
    borderLeftColor: palette.primary,
  },
  messageText: {
    fontSize: 13.5,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  imageContainer: {
    marginTop: 14,
    height: 180,
    borderRadius: radii.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
  },
  attachedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  zoomOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: '#07070b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeLightbox: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    height: '75%',
    resizeMode: 'contain',
  },
});
