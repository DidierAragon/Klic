import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { useTema } from '../../context/TemaContext';
import { radii } from '../../theme/ui';
import KlicCoin from '../../components/KlicCoin';

export default function MyPurchasesScreen({ navigation }) {
  const { palette } = useTema();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchases, setPurchases] = useState([]);

  const fetchPurchases = useCallback(async (isRefreshing = false) => {
    if (!isRefreshing) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Obtener las compras filtrando por comprador_id
      const { data: comprasData, error } = await supabase
        .from('compras')
        .select('id, user_id, contenido_id, tipo_contenido, monto_pagado, created_at')
        .eq('comprador_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!comprasData || comprasData.length === 0) {
        setPurchases([]);
        return;
      }

      // 2. Obtener IDs únicos de creadores para traer sus nombres y avatares
      const creatorIds = [...new Set(comprasData.map(c => c.user_id).filter(Boolean))];
      let creatorsMap = {};
      if (creatorIds.length > 0) {
        const { data: creators } = await supabase
          .from('users')
          .select('id, nombre, avatar_url')
          .in('id', creatorIds);
        
        if (creators) {
          creatorsMap = Object.fromEntries(creators.map(u => [u.id, u]));
        }
      }

      // 3. Enriquecer las compras con detalles del contenido y del creador
      const enrichedPurchases = await Promise.all(comprasData.map(async (compra) => {
        let contentDetails = null;
        // Mapear el tipo de contenido a la tabla correcta
        // Basado en CreatorDashboardScreen: fotos_perfil, videos, opiniones
        const table = compra.tipo_contenido;
        
        if (table && compra.contenido_id) {
          const { data: details } = await supabase
            .from(table)
            .select('*')
            .eq('id', compra.contenido_id)
            .maybeSingle();
          contentDetails = details;
        }
        
        return {
          ...compra,
          vendedor: creatorsMap[compra.user_id] || { nombre: 'Creador Klic' },
          content: contentDetails
        };
      }));

      setPurchases(enrichedPurchases);
    } catch (e) {
      console.warn('Error fetching purchases:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPurchases(true);
  };

  const renderItem = ({ item }) => {
    const date = new Date(item.created_at).toLocaleDateString('es-CO', {
      day: 'numeric', month: 'short', year: 'numeric'
    });

    const isOpinion = item.tipo_contenido === 'opiniones';
    const isVideo = item.tipo_contenido === 'videos';

    return (
      <View style={[styles.purchaseCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <TouchableOpacity 
          style={styles.contentRow}
          activeOpacity={0.7}
          onPress={() => {
            if (!item.content) {
              Alert.alert('Publicación eliminada', 'Lo sentimos, esta publicación ha sido eliminada por el creador.');
              return;
            }
            navigation.navigate('PostDetail', { 
              postId: item.contenido_id, 
              postType: item.tipo_contenido === 'fotos_perfil' ? 'foto' : 
                        item.tipo_contenido === 'videos' ? 'video' : 'opinion' 
            });
          }}
        >
          {/* Thumbnail */}
          <View style={[styles.thumbContainer, { backgroundColor: palette.panelSoft }]}>
            {isOpinion ? (
              <Ionicons name="chatbubble-ellipses-outline" size={24} color={palette.primary} />
            ) : (
              <Image 
                source={{ uri: item.content?.url }} 
                style={styles.thumbnail}
                resizeMode="cover"
              />
            )}
            {isVideo && (
              <View style={styles.videoBadge}>
                <Ionicons name="play" size={10} color="#fff" />
              </View>
            )}
          </View>

          {/* Details */}
          <View style={styles.details}>
            <Text style={[styles.creatorName, { color: palette.text }]}>
              {item.vendedor?.nombre || 'Creador Klic'}
            </Text>
            <Text style={[styles.contentType, { color: palette.textMuted }]}>
              {item.tipo_contenido === 'fotos_perfil' ? 'Fotografía Premium' : 
               item.tipo_contenido === 'videos' ? 'Video Exclusivo' : 'Opinión de Pago'}
            </Text>
            <View style={styles.priceRow}>
              <KlicCoin size={14} />
              <Text style={[styles.priceText, { color: palette.primary }]}>
                {Math.round(item.monto_pagado * 100)}
              </Text>
              <Text style={[styles.dateText, { color: palette.textMuted }]}> • {date}</Text>
            </View>
          </View>

          {/* Action Button (Ojo) */}
          <TouchableOpacity 
            style={[styles.accessBtn, { backgroundColor: palette.panelSoft, borderWidth: 1, borderColor: palette.border }]}
            onPress={() => {
              navigation.navigate('UserProfile', { userId: item.user_id });
            }}
          >
            <Ionicons name="eye-outline" size={18} color={palette.primary} />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  };

  const styles = makeStyles(palette);

  return (
    <SafeAreaView style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: palette.text }]}>Contenido Adquirido</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={purchases}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="cart-outline" size={64} color={palette.textMuted} />
              <Text style={[styles.emptyTitle, { color: palette.text }]}>Sin compras aún</Text>
              <Text style={[styles.emptySub, { color: palette.textMuted }]}>
                El contenido premium que compres aparecerá aquí.
              </Text>
              <TouchableOpacity 
                style={[styles.exploreBtn, { backgroundColor: palette.primary }]}
                onPress={() => navigation.navigate('Home')}
              >
                <Text style={styles.exploreBtnText}>Explorar contenido</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  purchaseCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 12,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbContainer: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 2,
  },
  details: {
    flex: 1,
    gap: 2,
  },
  creatorName: {
    fontSize: 15,
    fontWeight: '700',
  },
  contentType: {
    fontSize: 12,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  priceText: {
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 4,
  },
  dateText: {
    fontSize: 11,
  },
  accessBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  exploreBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.pill,
  },
  exploreBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
