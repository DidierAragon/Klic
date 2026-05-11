import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';
import { enviarSolicitudAmistad } from '../../utils/amigos';

export default function SearchUsersScreen({ navigation }) {
  const { palette } = useTema();
  const [currentUser, setCurrentUser] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [siguiendo, setSiguiendo] = useState([]);
  const [amigoUserIds, setAmigoUserIds] = useState(() => new Set());
  const [pendingSentIds, setPendingSentIds] = useState(() => new Set());

  const cargarContexto = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    if (!user) return;

    const [
      { data: amigosData },
      { data: siguiendoData },
      { data: pendingOutData },
    ] = await Promise.all([
      supabase.from('amigos')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .eq('estado', 'aceptado'),
      supabase.from('seguidores').select('seguido_id').eq('seguidor_id', user.id),
      supabase.from('amigos')
        .select('user1_id, user2_id')
        .eq('estado', 'pendiente')
        .eq('solicitante_id', user.id)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
    ]);

    const otros = (amigosData || []).map((a) =>
      a.user1_id === user.id ? a.user2_id : a.user1_id
    ).filter(Boolean);
    setAmigoUserIds(new Set(otros));
    setSiguiendo((siguiendoData || []).map((s) => s.seguido_id));
    const pendOut = (pendingOutData || []).map((r) =>
      r.user1_id === user.id ? r.user2_id : r.user1_id
    ).filter(Boolean);
    setPendingSentIds(new Set(pendOut));
  }, []);

  useEffect(() => {
    cargarContexto();
  }, [cargarContexto]);

  const buscar = async (texto) => {
    setBusqueda(texto);
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    if (!currentUser?.id) return;
    setBuscando(true);
    try {
      const safe = texto.trim().replace(/%/g, '').replace(/,/g, '');
      const pattern = `%${safe}%`;
      const { data } = await supabase
        .from('users')
        .select('id, nombre, avatar_url, alias')
        .or(`nombre.ilike.${pattern},alias.ilike.${pattern}`)
        .neq('id', currentUser.id)
        .limit(25);
      setResultados(data || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setBuscando(false);
    }
  };

  const seguir = async (userId) => {
    const { error } = await supabase.from('seguidores').insert({
      seguidor_id: currentUser.id,
      seguido_id: userId,
    });
    if (error) Alert.alert('Error', error.message);
    else setSiguiendo((p) => [...p, userId]);
  };

  const dejarDeSeguir = async (userId) => {
    const { error } = await supabase
      .from('seguidores')
      .delete()
      .eq('seguidor_id', currentUser.id)
      .eq('seguido_id', userId);
    if (error) Alert.alert('Error', error.message);
    else setSiguiendo((p) => p.filter((id) => id !== userId));
  };

  const onAmigo = async (userId) => {
    const res = await enviarSolicitudAmistad(supabase, currentUser.id, userId);
    if (!res.ok) Alert.alert('Amigos', res.message);
    else {
      Alert.alert('Listo', res.action === 'resent' ? 'Solicitud reenviada' : 'Solicitud enviada');
      setPendingSentIds((prev) => new Set([...prev, userId]));
    }
  };

  const irPerfil = (userId) => {
    if (!userId) return;
    if (userId === currentUser?.id) navigation.navigate('Profile');
    else navigation.navigate('UserProfile', { userId });
  };

  const styles = makeStyles(palette);

  const renderAvatar = (u, size = 48) => (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.primary + '28',
        },
      ]}
    >
      {u?.avatar_url ? (
        <Image
          source={{ uri: u.avatar_url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={[styles.avatarInitial, { color: palette.primary, fontSize: size * 0.36 }]}>
          {u?.nombre?.[0]?.toUpperCase() || '?'}
        </Text>
      )}
    </View>
  );

  const renderItem = ({ item }) => {
    const yaSigo = siguiendo.includes(item.id);
    const yaAmigo = amigoUserIds.has(item.id);
    const pend = pendingSentIds.has(item.id);
    return (
      <View style={[styles.card, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <TouchableOpacity
          style={styles.cardMain}
          onPress={() => irPerfil(item.id)}
          activeOpacity={0.75}
        >
          {renderAvatar(item, 50)}
          <View style={styles.cardText}>
            <Text style={[styles.nombre, { color: palette.text }]} numberOfLines={1}>
              {item.nombre}
            </Text>
            {item.alias ? (
              <Text style={[styles.alias, { color: palette.textMuted }]} numberOfLines={1}>
                @{item.alias}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.pill,
              {
                backgroundColor: yaSigo ? palette.panelSoft : palette.primary,
                borderColor: yaSigo ? palette.border : palette.primary,
              },
            ]}
            onPress={() => (yaSigo ? dejarDeSeguir(item.id) : seguir(item.id))}
          >
            <Text
              style={[styles.pillText, { color: yaSigo ? palette.textMuted : '#fff' }]}
            >
              {yaSigo ? 'Siguiendo' : 'Seguir'}
            </Text>
          </TouchableOpacity>
          {yaAmigo ? (
            <View style={[styles.iconPill, { borderColor: palette.secondary }]}>
              <Ionicons name="people" size={16} color={palette.secondary} />
            </View>
          ) : pend ? (
            <View style={[styles.iconPill, { borderColor: palette.border }]}>
              <Ionicons name="time-outline" size={16} color={palette.textMuted} />
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.iconPill, { borderColor: palette.border }]}
              onPress={() => onAmigo(item.id)}
            >
              <Ionicons name="person-add-outline" size={16} color={palette.secondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, { backgroundColor: palette.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: palette.text }]}>Buscar personas</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.searchWrap, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <Ionicons name="search" size={20} color={palette.primary} />
        <TextInput
          style={[styles.input, { color: palette.text }]}
          placeholder="Nombre o @alias"
          placeholderTextColor={palette.textMuted}
          value={busqueda}
          onChangeText={buscar}
          autoCorrect={false}
          autoFocus
        />
        {busqueda.length > 0 ? (
          <TouchableOpacity onPress={() => { setBusqueda(''); setResultados([]); }}>
            <Ionicons name="close-circle" size={20} color={palette.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {busqueda.trim().length < 2 ? (
        <View style={styles.hintBox}>
          <Ionicons name="people-outline" size={48} color={palette.textMuted} />
          <Text style={[styles.hintTitle, { color: palette.text }]}>
            Encuentra a tus amigos
          </Text>
          <Text style={[styles.hintSub, { color: palette.textMuted }]}>
            Escribe al menos 2 caracteres para buscar por nombre o alias.
          </Text>
        </View>
      ) : buscando ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={resultados}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.hintBox}>
              <Ionicons name="search-outline" size={44} color={palette.textMuted} />
              <Text style={[styles.hintTitle, { color: palette.text }]}>Sin resultados</Text>
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette) =>
  StyleSheet.create({
    wrapper: { flex: 1 },
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
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: radii.lg,
      borderWidth: 1,
    },
    input: { flex: 1, fontSize: 16 },
    list: { padding: 16, paddingBottom: 32, gap: 10 },
    card: {
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardText: { flex: 1, minWidth: 0 },
    nombre: { fontSize: 16, fontWeight: '700' },
    alias: { fontSize: 13, marginTop: 2 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
      borderWidth: 1,
    },
    pillText: { fontSize: 12, fontWeight: '700' },
    iconPill: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarInitial: { fontWeight: '800' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    hintBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 10,
    },
    hintTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
    hintSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  });
