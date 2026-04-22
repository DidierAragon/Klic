import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { glow, palette, radii } from '../../theme/ui';

export default function SmashOrPassScreen({ navigation }) {
  const [fotos, setFotos] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarFotos();
  }, []);

  const cargarFotos = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user;
      if (!currentUser) {
        Alert.alert('Sesión expirada', 'Inicia sesión nuevamente');
        return;
      }

      const { data: votedRows, error: votedError } = await supabase
        .from('votos')
        .select('foto_id')
        .eq('votante_id', currentUser.id);

      if (votedError) {
        throw votedError;
      }

      const votedSet = new Set((votedRows || []).map((item) => item.foto_id));

      const { data, error } = await supabase
        .from('fotos_perfil')
        .select('*, users(nombre, avatar_url)')
        .neq('user_id', currentUser.id)
        .limit(20);

      if (error) {
        throw error;
      }

      const disponibles = (data || []).filter((foto) => !votedSet.has(foto.id));
      setFotos(disponibles);
      setIndex(0);
    } catch (error) {
      Alert.alert('Error', error.message || 'No pudimos cargar las fotos');
      setFotos([]);
    }
    setLoading(false);
  };

  const votar = async (decision) => {
    const foto = fotos[index];
    if (!foto) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      }

      if (foto.user_id === user.id) {
        setIndex((prev) => prev + 1);
        return;
      }

      const { data: existingVote, error: existingVoteError } = await supabase
        .from('votos')
        .select('id')
        .eq('votante_id', user.id)
        .eq('foto_id', foto.id)
        .maybeSingle();

      if (existingVoteError) {
        throw existingVoteError;
      }

      if (!existingVote) {
        const { error: voteError } = await supabase.from('votos').insert({
          votante_id: user.id,
          foto_id: foto.id,
          decision,
        });

        if (voteError) {
          throw voteError;
        }
      }

      // Verificar match mutuo por usuarios, no por la misma foto.
      if (decision === 'smash') {
        const { data: myPhotos, error: myPhotosError } = await supabase
          .from('fotos_perfil')
          .select('id')
          .eq('user_id', user.id);

        if (myPhotosError) {
          throw myPhotosError;
        }

        const myPhotoIds = (myPhotos || []).map((item) => item.id);

        if (myPhotoIds.length > 0) {
          const { data: reciprocalVote, error: reciprocalError } = await supabase
            .from('votos')
            .select('id')
            .eq('votante_id', foto.user_id)
            .eq('decision', 'smash')
            .in('foto_id', myPhotoIds)
            .limit(1)
            .maybeSingle();

          if (reciprocalError) {
            throw reciprocalError;
          }

          if (reciprocalVote) {
            const { data: existingMatch, error: matchCheckError } = await supabase
              .from('matches')
              .select('id')
              .or(`and(user1_id.eq.${user.id},user2_id.eq.${foto.user_id}),and(user1_id.eq.${foto.user_id},user2_id.eq.${user.id})`)
              .maybeSingle();

            if (matchCheckError) {
              throw matchCheckError;
            }

            if (!existingMatch) {
              const { error: matchInsertError } = await supabase.from('matches').insert({
                user1_id: user.id,
                user2_id: foto.user_id,
              });

              if (matchInsertError) {
                throw matchInsertError;
              }
            }

            Alert.alert('Match!', `Hiciste match con ${foto.users?.nombre || 'alguien'}`);
          }
        }
      }

      setIndex((prev) => prev + 1);
    } catch (error) {
      Alert.alert('Error', error.message || 'No pudimos guardar tu voto');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
        <MainMenu navigation={navigation} active="SmashOrPass" />
      </View>
    );
  }

  if (index >= fotos.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.noMore}>No hay más fotos por ahora</Text>
        <TouchableOpacity style={styles.button} onPress={cargarFotos}>
          <Text style={styles.buttonText}>Explorar de nuevo</Text>
        </TouchableOpacity>
        <MainMenu navigation={navigation} active="SmashOrPass" />
      </View>
    );
  }

  const fotoActual = fotos[index];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Smash or Pass</Text>
      <Text style={styles.counter}>{index + 1} / {Math.max(fotos.length, 1)}</Text>

      <View style={styles.card}>
        <Image
          source={{ uri: fotoActual.url }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.captionRow}>
          <Text style={styles.nombre}>{fotoActual.users?.nombre || 'Usuario'}</Text>
          <Text style={styles.signal}>ONLINE</Text>
        </View>
      </View>

      <View style={styles.botones}>
        <TouchableOpacity style={styles.pass} onPress={() => votar('pass')}>
          <Text style={styles.btnText}>Pass</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.smash} onPress={() => votar('smash')}>
          <Text style={styles.btnText}>Smash</Text>
        </TouchableOpacity>
      </View>
      <MainMenu navigation={navigation} active="SmashOrPass" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg, alignItems: 'center', paddingTop: 56, paddingHorizontal: 18 },
  center: { flex: 1, backgroundColor: palette.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  title: { fontSize: 34, fontWeight: '800', color: palette.text, marginBottom: 4 },
  counter: { color: palette.textMuted, marginBottom: 16, fontWeight: '600' },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: palette.panel,
    borderColor: palette.border,
    borderWidth: 1,
  },
  image: { width: '100%', height: 430 },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  nombre: { color: palette.text, fontSize: 22, fontWeight: '700' },
  signal: {
    color: palette.secondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  botones: { flexDirection: 'row', marginTop: 24, gap: 16, marginBottom: 8 },
  pass: {
    backgroundColor: palette.panelSoft,
    borderRadius: radii.pill,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: palette.border,
  },
  smash: {
    backgroundColor: palette.primary,
    borderRadius: radii.pill,
    paddingVertical: 16,
    paddingHorizontal: 28,
    ...glow,
  },
  btnText: { fontSize: 17, color: palette.text, fontWeight: '700' },
  noMore: { color: palette.textMuted, fontSize: 18, marginBottom: 20, textAlign: 'center' },
  button: { backgroundColor: palette.primary, borderRadius: radii.md, padding: 16, ...glow },
  buttonText: { color: palette.text, fontWeight: '700', fontSize: 16 },
});