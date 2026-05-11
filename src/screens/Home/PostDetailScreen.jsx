import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ActivityIndicator, ScrollView, Share, Alert, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { useTema } from '../../context/TemaContext';
import { radii } from '../../theme/ui';
import VideoPlayer from '../../components/VideoPlayer';
import LikeButton from '../../components/LikeButton';
import { enviarSolicitudAmistad } from '../../utils/amigos';

export default function PostDetailScreen({ route, navigation }) {
  const { palette } = useTema();
  const { width: winW, height: winH } = useWindowDimensions();
  const { postId, postType } = route.params;
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const videoPreviewHeight = Math.min(
    Math.max(260, Math.round(winW * (16 / 9))),
    Math.round(winH * 0.58),
    640,
  );

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);

        const table = postType === 'foto' ? 'fotos_perfil' : 
                     postType === 'video' ? 'videos' : 'opiniones';
        
        const { data, error } = await supabase
          .from(table)
          .select('*, users(id, nombre, avatar_url)')
          .eq('id', postId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          Alert.alert('No disponible', 'Esta publicación ha sido eliminada.');
          navigation.goBack();
          return;
        }

        setPost({ 
          ...data, 
          __tipo: postType === 'foto' ? 'foto' : postType === 'video' ? 'video' : 'opinion',
          precio: data.precio || 0
        });
      } catch (e) {
        console.warn(e);
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [postId, postType]);

  const compartir = async (item, tipo) => {
    try {
      const mensaje = tipo === 'opinion'
        ? `"${item.contenido}" — ${item.users?.nombre || 'Usuario'} en Klic ⚡`
        : `Mira este contenido de ${item.users?.nombre || 'alguien'} en Klic ⚡\n${item.url}`;

      await Share.share({
        message: mensaje,
        title: 'Compartir desde Klic',
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const abrirComentarios = (item, tipo) => {
    navigation.navigate('Comentarios', {
      contenidoId: item.id,
      tipo,
      autor: item.users?.nombre || 'Usuario',
    });
  };

  const abrirPerfilAutor = (item) => {
    const uid = item.user_id;
    if (!uid) return;
    if (uid === currentUser?.id) navigation.navigate('Profile');
    else navigation.navigate('UserProfile', { userId: uid });
  };

  const renderAvatar = (usuario) => (
    <View style={[styles.avatarPlaceholder, { backgroundColor: palette.primary + '33' }]}>
      {usuario?.avatar_url
        ? <Image source={{ uri: usuario.avatar_url }} style={styles.avatarImg} />
        : <Text style={[styles.avatarInitial, { color: palette.primary }]}>
            {usuario?.nombre?.[0]?.toUpperCase() || '?'}
          </Text>
      }
    </View>
  );

  const renderPostHeader = (item) => (
    <View style={styles.postHeader}>
      <TouchableOpacity
        onPress={() => abrirPerfilAutor(item)}
        activeOpacity={0.7}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        {renderAvatar(item.users)}
        <View style={{ flex: 1 }}>
          <Text style={styles.postNombre}>{item.users?.nombre || 'Usuario'}</Text>
          <Text style={styles.postFecha}>
            {new Date(item.created_at).toLocaleDateString('es-CO', {
              day: 'numeric', month: 'short'
            })}
          </Text>
        </View>
      </TouchableOpacity>
      {item.precio > 0 && (
        <View style={[styles.priceTag, { backgroundColor: palette.primary + '30' }]}>
          <Ionicons name="pricetag" size={12} color={palette.primary} />
          <Text style={[styles.priceTagText, { color: palette.primary }]}>${item.precio}</Text>
        </View>
      )}
      <TouchableOpacity style={[styles.klicBtn, { borderColor: palette.primary }]}>
        <Ionicons name="flash-outline" size={12} color={palette.primary} />
        <Text style={[styles.klicBtnText, { color: palette.primary }]}>Klic</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAcciones = (item, tipo) => (
    <View style={styles.postActions}>
      <LikeButton contenidoId={item.id} tipo={tipo} />
      
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={async () => {
          if (!currentUser) return Alert.alert('Sesión', 'Inicia sesión');
          const uid = item.user_id;
          if (!uid || uid === currentUser.id) return;
          const res = await enviarSolicitudAmistad(supabase, currentUser.id, uid);
          if (!res.ok) Alert.alert('Amigos', res.message);
          else Alert.alert('Listo', res.action === 'resent' ? 'Solicitud reenviada' : 'Solicitud enviada');
        }}
      >
        <Ionicons name="people-outline" size={20} color={palette.secondary} />
        <Text style={[styles.actionCount, { color: palette.secondary }]}>Amigo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => abrirComentarios(item, tipo)}
        activeOpacity={0.7}
      >
        <Ionicons name="chatbubble-outline" size={20} color={palette.textMuted} />
        <Text style={styles.actionCount}>Comentar</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => compartir(item, tipo)}
        activeOpacity={0.7}
      >
        <Ionicons name="paper-plane-outline" size={20} color={palette.textMuted} />
        <Text style={styles.actionCount}>Compartir</Text>
      </TouchableOpacity>
    </View>
  );

  const styles = makeStyles(palette);

  if (loading) {
    return (
      <View style={[styles.wrapper, styles.center]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!post) return null;

  return (
    <SafeAreaView style={styles.wrapper}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Publicación Adquirida</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.postCard}>
          {renderPostHeader(post)}
          
          <View style={styles.mediaContent}>
            {post.__tipo === 'foto' && (
              <Image source={{ uri: post.url }} style={styles.postImage} resizeMode="cover" />
            )}
            {post.__tipo === 'video' && (
              <VideoPlayer url={post.url} height={videoPreviewHeight} bloqueado={false} />
            )}
            {post.__tipo === 'opinion' && (
              <View style={styles.opinionBox}>
                <Text style={styles.opinionTexto}>{post.contenido}</Text>
              </View>
            )}
          </View>

          {post.__tipo === 'video' && post.descripcion && (
            <Text style={styles.videoDesc}>{post.descripcion}</Text>
          )}

          {renderAcciones(post, post.__tipo === 'foto' ? 'foto' : post.__tipo === 'video' ? 'video' : 'opinion')}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  headerIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: palette.text, fontSize: 18, fontWeight: '800' },
  
  postCard: { backgroundColor: palette.panel, marginBottom: 2 },
  postHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarInitial: { fontSize: 18, fontWeight: '800' },
  postNombre: { color: palette.text, fontWeight: '700', fontSize: 14 },
  postFecha: { color: palette.textMuted, fontSize: 12 },
  
  priceTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm },
  priceTagText: { fontSize: 12, fontWeight: '800' },
  klicBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 },
  klicBtnText: { fontSize: 12, fontWeight: '700' },
  
  mediaContent: { position: 'relative', overflow: 'hidden' },
  postImage: { width: '100%', height: 400 },
  opinionBox: { paddingVertical: 4 },
  opinionTexto: { color: palette.text, fontSize: 15, lineHeight: 22, paddingHorizontal: 16, paddingBottom: 12 },
  
  videoDesc: { color: palette.textMuted, fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 },
  
  postActions: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10, gap: 2 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  actionCount: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
});
