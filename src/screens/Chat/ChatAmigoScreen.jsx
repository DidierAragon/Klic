import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

export default function ChatAmigoScreen({ route, navigation }) {
  const { amistadId, otroUsuario } = route.params;
  const { palette } = useTema();
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const currentUserIdRef = useRef(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser?.id]);

  const cargarMensajes = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      const { data, error } = await supabase
        .from('mensajes_amigos')
        .select('*')
        .eq('amistad_id', amistadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMensajes(data || []);

      if (user) {
        await supabase.from('mensajes_amigos')
          .update({ leido: true })
          .eq('amistad_id', amistadId)
          .neq('sender_id', user.id)
          .eq('leido', false);
      }
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [amistadId]);

  useEffect(() => { cargarMensajes(); }, [cargarMensajes]);

  useEffect(() => {
    const aid = String(amistadId);
    const channel = supabase
      .channel(`chat-amigo-${aid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes_amigos',
          filter: `amistad_id=eq.${aid}`,
        },
        async (payload) => {
          const row = payload.new;
          setMensajes((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row]
          );
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
          if (row.sender_id !== currentUserIdRef.current) {
            await supabase
              .from('mensajes_amigos')
              .update({ leido: true })
              .eq('id', row.id);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [amistadId]);

  const enviarMensaje = async () => {
    if (!texto.trim() || enviando || !currentUser) return;
    const textoEnviar = texto.trim();
    setTexto('');
    setEnviando(true);
    try {
      const { data: nuevo, error } = await supabase
        .from('mensajes_amigos')
        .insert({
          amistad_id: amistadId,
          sender_id: currentUser.id,
          contenido: textoEnviar,
        })
        .select('*')
        .single();
      if (error) throw error;
      setMensajes((prev) =>
        prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]
      );
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      Alert.alert('Error', e.message);
      setTexto(textoEnviar);
    } finally { setEnviando(false); }
  };

  const formatearHora = (fecha) =>
    new Date(fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  const formatearFecha = (fecha) => {
    const d = new Date(fecha);
    const hoy = new Date();
    const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
    if (d.toDateString() === hoy.toDateString()) return 'Hoy';
    if (d.toDateString() === ayer.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  };

  const mensajesConFecha = () => {
    const resultado = [];
    let fechaAnterior = null;
    mensajes.forEach(msg => {
      const fechaMsg = new Date(msg.created_at).toDateString();
      if (fechaMsg !== fechaAnterior) {
        resultado.push({ type: 'fecha', id: `fecha-${msg.created_at}`, fecha: msg.created_at });
        fechaAnterior = fechaMsg;
      }
      resultado.push({ type: 'mensaje', ...msg });
    });
    return resultado;
  };

  const styles = makeStyles(palette);

  const renderItem = ({ item }) => {
    if (item.type === 'fecha') {
      return (
        <View style={styles.fechaRow}>
          <View style={[styles.fechaLine, { backgroundColor: palette.border }]} />
          <Text style={[styles.fechaText, { color: palette.textMuted }]}>
            {formatearFecha(item.fecha)}
          </Text>
          <View style={[styles.fechaLine, { backgroundColor: palette.border }]} />
        </View>
      );
    }

    const esMio = item.sender_id === currentUser?.id;
    return (
      <View style={[styles.msgRow, esMio && styles.msgRowMio]}>
        <View style={[
          styles.bubble,
          esMio
            ? [styles.bubbleMio, { backgroundColor: palette.primary }]
            : [styles.bubbleOtro, { backgroundColor: palette.panel }],
        ]}>
          <Text style={[styles.msgTexto, { color: esMio ? '#fff' : palette.text }]}>
            {item.contenido}
          </Text>
          <View style={styles.msgFooter}>
            <Text style={[styles.msgHora, {
              color: esMio ? 'rgba(255,255,255,0.65)' : palette.textMuted
            }]}>
              {formatearHora(item.created_at)}
            </Text>
            {esMio && (
              <Ionicons
                name={item.leido ? 'checkmark-done' : 'checkmark'}
                size={12}
                color={item.leido ? '#22d3ee' : 'rgba(255,255,255,0.65)'}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, { backgroundColor: palette.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.panel }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <View style={[styles.headerAvatar, { backgroundColor: palette.primary + '33' }]}>
          {otroUsuario?.avatar_url
            ? <Image source={{ uri: otroUsuario.avatar_url }} style={styles.headerAvatarImg} />
            : <Text style={[styles.headerAvatarInitial, { color: palette.primary }]}>
                {otroUsuario?.nombre?.[0]?.toUpperCase() || '?'}
              </Text>
          }
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerNombre, { color: palette.text }]}>
            {otroUsuario?.nombre || 'Amigo'}
          </Text>
          <View style={styles.headerStatus}>
            <View style={[styles.statusDot, { backgroundColor: palette.secondary }]} />
            <Text style={[styles.statusText, { color: palette.secondary }]}>Amigo</Text>
          </View>
        </View>
      </View>

      {/* Mensajes */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={mensajesConFecha()}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.lista}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            mensajes.length > 0 &&
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIcon, { backgroundColor: palette.primary + '22' }]}>
                <Ionicons name="people" size={32} color={palette.primary} />
              </View>
              <Text style={[styles.emptyText, { color: palette.text }]}>
                ¡Son amigos! 👥
              </Text>
              <Text style={[styles.emptySub, { color: palette.textMuted }]}>
                Di hola a {otroUsuario?.nombre}
              </Text>
              <View style={styles.sugerencias}>
                {['👋 Hola!', '¿Cómo estás?', '¡Qué bueno conectar!'].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sugerenciaBtn, { borderColor: palette.border, backgroundColor: palette.panel }]}
                    onPress={() => setTexto(s)}
                  >
                    <Text style={[styles.sugerenciaText, { color: palette.text }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />
      )}

      {/* Input */}
      <View style={[styles.inputRow, { backgroundColor: palette.panel, borderTopColor: palette.border }]}>
        <TextInput
          style={[styles.input, {
            backgroundColor: palette.panelSoft,
            color: palette.text, borderColor: palette.border,
          }]}
          placeholder={`Mensaje para ${otroUsuario?.nombre}...`}
          placeholderTextColor={palette.textMuted}
          value={texto}
          onChangeText={setTexto}
          multiline maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: texto.trim() ? palette.primary : palette.panelSoft }]}
          onPress={enviarMensaje}
          disabled={!texto.trim() || enviando}
        >
          {enviando
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={18} color={texto.trim() ? '#fff' : palette.textMuted} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingBottom: 12,
    paddingHorizontal: 12, gap: 10, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  headerAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarInitial: { fontSize: 16, fontWeight: '800' },
  headerNombre: { fontSize: 16, fontWeight: '700' },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  lista: { padding: 12, paddingBottom: 4 },
  fechaRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginVertical: 12,
  },
  fechaLine: { flex: 1, height: 1 },
  fechaText: { fontSize: 11, fontWeight: '600', paddingHorizontal: 4 },
  msgRow: { flexDirection: 'row', marginBottom: 3 },
  msgRowMio: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', padding: 10, borderRadius: radii.md, gap: 3 },
  bubbleMio: { borderBottomRightRadius: 4 },
  bubbleOtro: { borderBottomLeftRadius: 4 },
  msgTexto: { fontSize: 15, lineHeight: 21 },
  msgFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  msgHora: { fontSize: 10 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 8, gap: 8, borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
  },
  input: {
    flex: 1, borderRadius: radii.pill,
    borderWidth: 1, paddingHorizontal: 14,
    paddingVertical: 9, fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyBox: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyText: { fontSize: 20, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center' },
  sugerencias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 },
  sugerenciaBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1 },
  sugerenciaText: { fontSize: 13, fontWeight: '600' },
});