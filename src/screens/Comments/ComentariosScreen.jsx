import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

const REPORT_MOTIVES = [
  { key: 'spam', label: 'Spam o publicidad' },
  { key: 'harassment', label: 'Acoso u odio' },
  { key: 'sexual', label: 'Contenido sexual' },
  { key: 'other', label: 'Otro' },
];

function buildThreadedRows(items) {
  if (!items?.length) return [];
  const sorted = [...items].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const nodes = new Map(sorted.map((i) => [i.id, { ...i, _replies: [] }]));
  const roots = [];
  for (const item of sorted) {
    const node = nodes.get(item.id);
    const pid = item.parent_id;
    if (pid && nodes.has(pid)) {
      nodes.get(pid)._replies.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortFn = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  roots.sort(sortFn);
  const sortTree = (n) => {
    n._replies.sort(sortFn);
    n._replies.forEach(sortTree);
  };
  roots.forEach(sortTree);
  const out = [];
  const walk = (n, depth) => {
    out.push({ node: n, depth });
    for (const r of n._replies) walk(r, depth + 1);
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}

async function fetchLikesMap(commentIds, userId) {
  const map = {};
  if (!commentIds.length) return map;
  for (const id of commentIds) {
    map[id] = { count: 0, liked: false };
  }
  const { data, error } = await supabase
    .from('comentarios_likes')
    .select('comentario_id, user_id')
    .in('comentario_id', commentIds);
  if (error) {
    console.warn('comentarios_likes:', error.message);
    return map;
  }
  for (const row of data || []) {
    if (!map[row.comentario_id]) map[row.comentario_id] = { count: 0, liked: false };
    map[row.comentario_id].count += 1;
    if (userId && row.user_id === userId) map[row.comentario_id].liked = true;
  }
  return map;
}

function CommentRow({
  item,
  depth,
  palette,
  styles,
  currentUser,
  likesMap,
  onToggleLike,
  onReply,
  onDelete,
  onReport,
  formatearFecha,
  likeBusyId,
}) {
  const esMio = item.user_id === currentUser?.id;
  const likeInfo = likesMap[item.id] || { count: 0, liked: false };
  const indent = Math.min(depth, 4) * 12;
  const avatarSize = depth > 0 ? 30 : 38;

  return (
    <View style={[styles.commentWrap, { marginLeft: indent }]}>
      <View
        style={[
          styles.avatarRing,
          { width: avatarSize + 4, height: avatarSize + 4, borderColor: palette.border },
        ]}
      >
        <View
          style={[
            styles.commentAvatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: palette.primary + '28',
            },
          ]}
        >
          {item.users?.avatar_url ? (
            <Image
              source={{ uri: item.users.avatar_url }}
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
              }}
            />
          ) : (
            <Text
              style={[
                styles.avatarInitial,
                { fontSize: depth > 0 ? 11 : 13, color: palette.primary },
              ]}
            >
              {item.users?.nombre?.[0]?.toUpperCase() || '?'}
            </Text>
          )}
        </View>
      </View>

      <View
        style={[
          styles.commentCard,
          {
            backgroundColor: esMio ? palette.primary + '14' : palette.panelSoft,
            borderColor: esMio ? palette.primary + '44' : palette.border,
          },
        ]}
      >
        <View style={styles.commentCardHeader}>
          <Text style={[styles.commentAuthor, { color: palette.text }]} numberOfLines={1}>
            {item.users?.nombre || 'Usuario'}
            {esMio ? (
              <Text style={[styles.youBadge, { color: palette.primary }]}> · Tú</Text>
            ) : null}
          </Text>
          <Text style={[styles.commentTime, { color: palette.textMuted }]}>
            {formatearFecha(item.created_at)}
          </Text>
        </View>

        {depth > 0 && item.parent_id ? (
          <View style={styles.replyHintRow}>
            <Ionicons name="return-down-forward" size={12} color={palette.textMuted} />
            <Text style={[styles.replyHint, { color: palette.textMuted }]} numberOfLines={1}>
              Respuesta
            </Text>
          </View>
        ) : null}

        <Text style={[styles.commentBody, { color: palette.text }]}>{item.texto}</Text>

        <View style={styles.commentActions}>
          <Pressable
            style={styles.actionPill}
            onPress={() => onToggleLike(item.id)}
            disabled={likeBusyId === item.id}
            hitSlop={8}
          >
            {likeBusyId === item.id ? (
              <ActivityIndicator size="small" color={palette.primary} />
            ) : (
              <>
                <Ionicons
                  name={likeInfo.liked ? 'heart' : 'heart-outline'}
                  size={17}
                  color={likeInfo.liked ? palette.danger : palette.textMuted}
                />
                {likeInfo.count > 0 ? (
                  <Text
                    style={[
                      styles.actionCount,
                      { color: likeInfo.liked ? palette.danger : palette.textMuted },
                    ]}
                  >
                    {likeInfo.count}
                  </Text>
                ) : null}
              </>
            )}
          </Pressable>

          <Pressable style={styles.actionPill} onPress={() => onReply(item)} hitSlop={8}>
            <Ionicons name="chatbubble-outline" size={15} color={palette.textMuted} />
            <Text style={[styles.actionLabel, { color: palette.textMuted }]}>Responder</Text>
          </Pressable>

          {!esMio && currentUser ? (
            <Pressable style={styles.actionPill} onPress={() => onReport(item)} hitSlop={8}>
              <Ionicons name="flag-outline" size={15} color={palette.textMuted} />
              <Text style={[styles.actionLabel, { color: palette.textMuted }]}>Reportar</Text>
            </Pressable>
          ) : null}

          {esMio ? (
            <Pressable style={styles.actionPill} onPress={() => onDelete(item.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={15} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function ComentariosScreen({ route, navigation }) {
  const { contenidoId, tipo, autor } = route.params;
  const { palette } = useTema();
  const insets = useSafeAreaInsets();
  const [comentarios, setComentarios] = useState([]);
  const [likesMap, setLikesMap] = useState({});
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [likeBusyId, setLikeBusyId] = useState(null);
  const flatListRef = useRef(null);

  const threadedRows = useMemo(
    () => buildThreadedRows(comentarios),
    [comentarios]
  );

  const cargarComentarios = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      const { data, error } = await supabase
        .from('comentarios')
        .select(
          'id, user_id, contenido_id, tipo, texto, created_at, parent_id, users(nombre, avatar_url)'
        )
        .eq('contenido_id', contenidoId)
        .eq('tipo', tipo)
        .order('created_at', { ascending: true });

      if (error) throw error;
      const rows = data || [];
      setComentarios(rows);
      const ids = rows.map((r) => r.id);
      setLikesMap(await fetchLikesMap(ids, user?.id));
    } catch (e) {
      console.warn(e);
      if (e.message?.includes('parent_id') || e.code === '42703') {
        Alert.alert(
          'Actualización pendiente',
          'Aplica la migración SQL en Supabase (archivo supabase/migrations/…comentarios_likes…) para respuestas y likes.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [contenidoId, tipo]);

  useEffect(() => {
    cargarComentarios();
  }, [cargarComentarios]);

  useEffect(() => {
    const channel = supabase
      .channel(`comentarios-${contenidoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comentarios',
          filter: `contenido_id=eq.${contenidoId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('comentarios')
            .select(
              'id, user_id, contenido_id, tipo, texto, created_at, parent_id, users(nombre, avatar_url)'
            )
            .eq('id', payload.new.id)
            .maybeSingle();
          if (data) {
            setComentarios((prev) =>
              prev.some((c) => c.id === data.id) ? prev : [...prev, data]
            );
            setLikesMap((prev) => ({ ...prev, [data.id]: prev[data.id] || { count: 0, liked: false } }));
            setTimeout(
              () => flatListRef.current?.scrollToEnd({ animated: true }),
              120
            );
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [contenidoId]);

  const enviarComentario = async () => {
    if (!texto.trim() || enviando) return;
    if (!currentUser) {
      Alert.alert('Error', 'Debes iniciar sesión');
      return;
    }

    setEnviando(true);
    try {
      const row = {
        user_id: currentUser.id,
        contenido_id: contenidoId,
        tipo,
        texto: texto.trim(),
      };
      if (replyingTo?.id) row.parent_id = replyingTo.id;

      const { error } = await supabase.from('comentarios').insert(row);
      if (error) throw error;
      setTexto('');
      setReplyingTo(null);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setEnviando(false);
    }
  };

  const eliminarComentario = async (comentarioId) => {
    Alert.alert('Eliminar comentario', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('comentarios')
            .delete()
            .eq('id', comentarioId);
          if (error) {
            Alert.alert('Error', error.message);
          } else {
            await cargarComentarios();
          }
        },
      },
    ]);
  };

  const toggleLikeComentario = async (commentId) => {
    if (!currentUser) {
      Alert.alert('Inicia sesión', 'Necesitas una cuenta para dar me gusta.');
      return;
    }
    const cur = likesMap[commentId] || { count: 0, liked: false };
    setLikeBusyId(commentId);
    const nextLiked = !cur.liked;
    const nextCount = Math.max(0, cur.count + (nextLiked ? 1 : -1));
    setLikesMap((m) => ({
      ...m,
      [commentId]: { count: nextCount, liked: nextLiked },
    }));
    try {
      if (cur.liked) {
        const { error } = await supabase
          .from('comentarios_likes')
          .delete()
          .eq('comentario_id', commentId)
          .eq('user_id', currentUser.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('comentarios_likes').insert({
          comentario_id: commentId,
          user_id: currentUser.id,
        });
        if (error) throw error;
      }
    } catch (e) {
      setLikesMap((m) => ({
        ...m,
        [commentId]: { count: cur.count, liked: cur.liked },
      }));
      Alert.alert('No se pudo actualizar', e.message || 'Intenta de nuevo.');
    } finally {
      setLikeBusyId(null);
    }
  };

  const reportarComentario = (item) => {
    if (!currentUser) {
      Alert.alert('Inicia sesión', 'Debes iniciar sesión para reportar.');
      return;
    }
    Alert.alert('Reportar comentario', '¿Qué motivo describe mejor el problema?', [
      ...REPORT_MOTIVES.map(({ key, label }) => ({
        text: label,
        onPress: () => enviarReporte(item.id, key),
      })),
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const enviarReporte = async (comentarioId, motivo) => {
    try {
      const { error } = await supabase.from('comentarios_reportes').insert({
        comentario_id: comentarioId,
        reporter_user_id: currentUser.id,
        motivo,
      });
      if (error) {
        if (error.code === '23505') {
          Alert.alert('Listo', 'Ya habías reportado este comentario.');
          return;
        }
        throw error;
      }
      Alert.alert('Gracias', 'Recibimos tu reporte y lo revisaremos.');
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo enviar el reporte.');
    }
  };

  const formatearFecha = (fecha) => {
    const d = new Date(fecha);
    const ahora = new Date();
    const diff = Math.floor((ahora - d) / 1000);
    if (diff < 60) return 'Ahora';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  };

  const styles = makeStyles(palette);

  const renderRow = ({ item: { node, depth } }) => (
    <CommentRow
      item={node}
      depth={depth}
      palette={palette}
      styles={styles}
      currentUser={currentUser}
      likesMap={likesMap}
      onToggleLike={toggleLikeComentario}
      onReply={(c) => {
        setReplyingTo({ id: c.id, nombre: c.users?.nombre || 'Usuario' });
        flatListRef.current?.scrollToEnd({ animated: true });
      }}
      onDelete={eliminarComentario}
      onReport={reportarComentario}
      formatearFecha={formatearFecha}
      likeBusyId={likeBusyId}
    />
  );

  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, { backgroundColor: palette.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View
        style={[
          styles.header,
          {
            borderBottomColor: palette.border,
            paddingTop: Math.max(insets.top, 12) + 8,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: palette.text }]}>Comentarios</Text>
          <Text style={[styles.headerSub, { color: palette.textMuted }]} numberOfLines={1}>
            Publicación de {autor}
          </Text>
        </View>
        <View style={[styles.countPill, { backgroundColor: palette.panelSoft }]}>
          <Ionicons name="chatbubbles-outline" size={14} color={palette.primary} />
          <Text style={[styles.headerCount, { color: palette.text }]}>{comentarios.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={threadedRows}
          keyExtractor={(row) => row.node.id}
          renderItem={renderRow}
          contentContainerStyle={styles.lista}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIconWrap, { backgroundColor: palette.panelSoft }]}>
                <Ionicons name="chatbubbles-outline" size={40} color={palette.primary} />
              </View>
              <Text style={[styles.emptyText, { color: palette.text }]}>Sin comentarios aún</Text>
              <Text style={[styles.emptySub, { color: palette.textMuted }]}>
                Sé el primero en comentar o dar tu opinión
              </Text>
            </View>
          }
          onContentSizeChange={() =>
            comentarios.length > 0 &&
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />
      )}

      {replyingTo ? (
        <View
          style={[
            styles.replyBanner,
            { backgroundColor: palette.panel, borderTopColor: palette.border },
          ]}
        >
          <Ionicons name="return-down-forward" size={16} color={palette.primary} />
          <Text style={[styles.replyBannerText, { color: palette.text }]} numberOfLines={1}>
            Respondiendo a <Text style={{ fontWeight: '700' }}>{replyingTo.nombre}</Text>
          </Text>
          <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={12}>
            <Ionicons name="close-circle" size={22} color={palette.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: palette.panel,
            borderTopColor: palette.border,
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: palette.panelSoft,
              color: palette.text,
              borderColor: palette.border,
            },
          ]}
          placeholder={replyingTo ? 'Escribe tu respuesta…' : 'Escribe un comentario…'}
          placeholderTextColor={palette.textMuted}
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={enviarComentario}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: texto.trim() ? palette.primary : palette.panelSoft },
          ]}
          onPress={enviarComentario}
          disabled={!texto.trim() || enviando}
          activeOpacity={0.8}
        >
          {enviando ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name="send"
              size={18}
              color={texto.trim() ? '#fff' : palette.textMuted}
            />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette) =>
  StyleSheet.create({
    wrapper: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 14,
      paddingHorizontal: 16,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    headerSub: { fontSize: 12, marginTop: 2 },
    countPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.pill,
    },
    headerCount: { fontSize: 13, fontWeight: '700' },

    lista: { padding: 14, paddingBottom: 12, gap: 4 },

    commentWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 12,
    },
    avatarRing: {
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    commentAvatar: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarInitial: { fontWeight: '800' },

    commentCard: {
      flex: 1,
      borderRadius: radii.md,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    commentCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 6,
    },
    commentAuthor: { fontSize: 14, fontWeight: '700', flex: 1 },
    youBadge: { fontWeight: '600' },
    commentTime: { fontSize: 11, flexShrink: 0 },
    replyHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    replyHint: { fontSize: 11, fontStyle: 'italic' },
    commentBody: { fontSize: 15, lineHeight: 22 },

    commentActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 4,
      marginTop: 10,
    },
    actionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: radii.pill,
    },
    actionCount: { fontSize: 12, fontWeight: '600', minWidth: 8 },
    actionLabel: { fontSize: 12, fontWeight: '600' },

    replyBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    replyBannerText: { flex: 1, fontSize: 13 },

    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 10,
      gap: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    input: {
      flex: 1,
      borderRadius: radii.lg,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
      maxHeight: 120,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },

    emptyBox: {
      alignItems: 'center',
      paddingVertical: 56,
      gap: 10,
      paddingHorizontal: 24,
    },
    emptyIconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    emptyText: { fontSize: 17, fontWeight: '700' },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  });
