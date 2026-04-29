import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Animated, PanResponder, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { radii } from '../../theme/ui';
import { useTema } from '../../context/TemaContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

export default function SmashOrPassScreen({ navigation }) {
  const { palette, glow } = useTema();
  const [fotos, setFotos] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [votando, setVotando] = useState(false);

  const position = useRef(new Animated.ValueXY()).current;
  const swipeLabel = useRef(new Animated.Value(0)).current;

  useEffect(() => { cargarFotos(); }, []);

  const cargarFotos = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      const { data: votados } = await supabase
        .from('votos').select('foto_id').eq('votante_id', user.id);
      const votadosSet = new Set((votados || []).map(v => v.foto_id));

      const { data } = await supabase
        .from('fotos_perfil')
        .select('*, users(nombre, avatar_url, fecha_nacimiento)')
        .neq('user_id', user.id)
        .limit(20);

      setFotos((data || []).filter(f => !votadosSet.has(f.id)));
      setIndex(0);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const calcularEdad = (fecha) => {
    if (!fecha) return null;
    const hoy = new Date();
    const nac = new Date(fecha);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  };

  const votar = async (decision) => {
    if (votando) return;
    const foto = fotos[index];
    if (!foto) return;

    setVotando(true);

    const toX = decision === 'smash' ? SCREEN_WIDTH * 1.5
      : decision === 'pass' ? -SCREEN_WIDTH * 1.5 : 0;
    const toY = decision === 'parcero' ? -300 : 0;

    Animated.timing(position, {
      toValue: { x: toX, y: toY },
      duration: 300,
      useNativeDriver: false,
    }).start(async () => {
      position.setValue({ x: 0, y: 0 });
      swipeLabel.setValue(0);

      try {
        const { data: { user } } = await supabase.auth.getUser();

        const { data: existing } = await supabase
          .from('votos').select('id')
          .eq('votante_id', user.id)
          .eq('foto_id', foto.id)
          .maybeSingle();

        if (!existing) {
          await supabase.from('votos').insert({
            votante_id: user.id, foto_id: foto.id, decision,
          });
        }

        if (decision === 'smash') {
          const { data: misFootos } = await supabase
            .from('fotos_perfil').select('id').eq('user_id', user.id);
          const ids = (misFootos || []).map(f => f.id);

          if (ids.length > 0) {
            const { data: reciproco } = await supabase
              .from('votos').select('id')
              .eq('votante_id', foto.user_id)
              .eq('decision', 'smash')
              .in('foto_id', ids)
              .limit(1).maybeSingle();

            if (reciproco) {
              const { data: matchExiste } = await supabase
                .from('matches').select('id')
                .or(`and(user1_id.eq.${user.id},user2_id.eq.${foto.user_id}),and(user1_id.eq.${foto.user_id},user2_id.eq.${user.id})`)
                .maybeSingle();

              if (!matchExiste) {
                await supabase.from('matches').insert({
                  user1_id: user.id, user2_id: foto.user_id,
                });
                Alert.alert('🔥 ¡Klic!', `Hiciste match con ${foto.users?.nombre || 'alguien'}`);
              }
            }
          }
        }

        setIndex(prev => prev + 1);
      } catch (e) {
        Alert.alert('Error', e.message);
      } finally {
        setVotando(false);
      }
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
        swipeLabel.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          votar('smash');
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          votar('pass');
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
          swipeLabel.setValue(0);
        }
      },
    })
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });

  const smashOpacity = swipeLabel.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1], extrapolate: 'clamp',
  });

  const passOpacity = swipeLabel.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0], extrapolate: 'clamp',
  });

  const styles = makeStyles(palette);

  if (loading) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
        <MainMenu navigation={navigation} active="SmashOrPass" />
      </View>
    );
  }

  if (index >= fotos.length) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.center}>
          <Ionicons name="sparkles-outline" size={64} color={palette.primary} />
          <Text style={styles.noMore}>Ya viste todos los perfiles</Text>
          <Text style={styles.noMoreSub}>Vuelve más tarde para ver nuevos</Text>
          <TouchableOpacity
            style={[styles.reloadBtn, { backgroundColor: palette.primary }]}
            onPress={cargarFotos}
          >
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={styles.reloadText}>Recargar</Text>
          </TouchableOpacity>
        </View>
        <MainMenu navigation={navigation} active="SmashOrPass" />
      </View>
    );
  }

  const foto = fotos[index];
  const edad = calcularEdad(foto.users?.fecha_nacimiento);

  return (
    <View style={styles.wrapper}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.logo, { color: palette.primary }]}>⚡ Klic</Text>
        <Text style={styles.counter}>{index + 1} / {fotos.length}</Text>
      </View>

      {/* Card swipeable */}
      <View style={styles.cardContainer}>
        <Animated.View
          style={[
            styles.card,
            { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }
          ]}
          {...panResponder.panHandlers}
        >
          <Image source={{ uri: foto.url }} style={styles.image} resizeMode="cover" />

          {/* Label SMASH */}
          <Animated.View style={[styles.labelSmash, { opacity: smashOpacity }]}>
            <Ionicons name="flash" size={20} color="#22d3ee" />
            <Text style={styles.labelSmashText}>SMASH</Text>
          </Animated.View>

          {/* Label PASS */}
          <Animated.View style={[styles.labelPass, { opacity: passOpacity }]}>
            <Ionicons name="close-circle" size={20} color="#fb7185" />
            <Text style={styles.labelPassText}>PASS</Text>
          </Animated.View>

          {/* Info */}
          <View style={styles.cardInfo}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardNombre}>
                {foto.users?.nombre || 'Usuario'}{edad ? `, ${edad}` : ''}
              </Text>
            </View>
            <View style={[styles.onlineDot, { backgroundColor: palette.secondary }]} />
          </View>
        </Animated.View>
      </View>

      {/* Botones */}
      <View style={styles.botones}>

        {/* Pass */}
        <TouchableOpacity
          style={styles.btnPass}
          onPress={() => votar('pass')}
          disabled={votando}
          activeOpacity={0.8}
        >
          <Ionicons name="close-circle-outline" size={32} color="#fb7185" />
          <Text style={styles.btnPassText}>Pass</Text>
        </TouchableOpacity>

        {/* Smash */}
        <TouchableOpacity
          style={[styles.btnSmash, { backgroundColor: palette.primary, shadowColor: palette.primary }]}
          onPress={() => votar('smash')}
          disabled={votando}
          activeOpacity={0.8}
        >
          <Ionicons name="flash-outline" size={38} color="#fff" />
          <Text style={styles.btnSmashText}>Smash</Text>
        </TouchableOpacity>

        {/* Parcero */}
        <TouchableOpacity
          style={[styles.btnParcero, { borderColor: palette.secondary }]}
          onPress={() => votar('parcero')}
          disabled={votando}
          activeOpacity={0.8}
        >
          <Ionicons name="hand-left-outline" size={32} color={palette.secondary} />
          <Text style={[styles.btnParceroText, { color: palette.secondary }]}>Parcero</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>← Desliza para votar →</Text>

      <MainMenu navigation={navigation} active="SmashOrPass" />
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: palette.bg, justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 12 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 52, paddingBottom: 8,
  },
  logo: { fontSize: 22, fontWeight: '900' },
  counter: { color: palette.textMuted, fontWeight: '600', fontSize: 13 },

  cardContainer: {
    flex: 1, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 16,
  },
  card: {
    width: '100%', maxWidth: 360,
    height: 460, borderRadius: radii.xl,
    overflow: 'hidden', backgroundColor: palette.panel,
    borderWidth: 1, borderColor: palette.border,
    elevation: 8,
  },
  image: { width: '100%', height: '100%', position: 'absolute' },

  labelSmash: {
    position: 'absolute', top: 40, left: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#00000088',
    borderWidth: 2.5, borderColor: '#22d3ee',
    borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 6,
    transform: [{ rotate: '-15deg' }],
  },
  labelSmashText: { color: '#22d3ee', fontWeight: '900', fontSize: 20 },

  labelPass: {
    position: 'absolute', top: 40, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#00000088',
    borderWidth: 2.5, borderColor: '#fb7185',
    borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 6,
    transform: [{ rotate: '15deg' }],
  },
  labelPassText: { color: '#fb7185', fontWeight: '900', fontSize: 20 },

  cardInfo: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#00000099',
    paddingHorizontal: 20, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  cardNombre: { color: '#fff', fontSize: 22, fontWeight: '800' },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },

  botones: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 20,
    gap: 16, paddingBottom: 4,
  },

  btnPass: {
    alignItems: 'center', justifyContent: 'center',
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: palette.panel,
    borderWidth: 1.5, borderColor: '#fb718540',
    gap: 2,
  },
  btnPassText: { color: '#fb7185', fontSize: 10, fontWeight: '700' },

  btnSmash: {
    alignItems: 'center', justifyContent: 'center',
    width: 90, height: 90, borderRadius: 45,
    shadowOpacity: 0.5, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10, gap: 2,
  },
  btnSmashText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  btnParcero: {
    alignItems: 'center', justifyContent: 'center',
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: palette.panel,
    borderWidth: 1.5, gap: 2,
  },
  btnParceroText: { fontSize: 10, fontWeight: '700' },

  hint: { color: palette.textMuted, fontSize: 11, textAlign: 'center', paddingBottom: 6 },

  noMore: { color: palette.text, fontSize: 20, fontWeight: '800' },
  noMoreSub: { color: palette.textMuted, fontSize: 14, textAlign: 'center' },
  reloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: radii.md, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8,
  },
  reloadText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});