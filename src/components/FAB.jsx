import React, { useState, useRef } from 'react';
import {
  View, TouchableOpacity, StyleSheet, Animated,
  Modal, Pressable, Text, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTema } from '../context/TemaContext';
import { radii } from '../theme/ui';

const OPCIONES = [
  { key: 'foto',    label: 'Foto',    icon: 'image-outline',     color: '#8b5cf6' },
  { key: 'opinion', label: 'Opinión', icon: 'chatbubble-outline', color: '#22d3ee' },
  { key: 'video',   label: 'Video',   icon: 'videocam-outline',  color: '#fb7185' },
];

export default function FAB({ navigation }) {
  const { palette } = useTema();
  const [abierto, setAbierto] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;
  const opacityBg = useRef(new Animated.Value(0)).current;
  const opcAnimations = OPCIONES.map(() => ({
    scale: useRef(new Animated.Value(0)).current,
    translateY: useRef(new Animated.Value(20)).current,
    opacity: useRef(new Animated.Value(0)).current,
  }));

  const abrir = () => {
    setAbierto(true);
    Animated.parallel([
      Animated.spring(rotation, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }),
      Animated.timing(opacityBg, { toValue: 1, duration: 200, useNativeDriver: true }),
      ...opcAnimations.map((anim, i) =>
        Animated.sequence([
          Animated.delay(i * 60),
          Animated.parallel([
            Animated.spring(anim.scale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 7 }),
            Animated.spring(anim.translateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 7 }),
            Animated.timing(anim.opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          ]),
        ])
      ),
    ]).start();
  };

  const cerrar = () => {
    Animated.parallel([
      Animated.spring(rotation, { toValue: 0, useNativeDriver: true, tension: 100, friction: 8 }),
      Animated.timing(opacityBg, { toValue: 0, duration: 180, useNativeDriver: true }),
      ...opcAnimations.map(anim =>
        Animated.parallel([
          Animated.timing(anim.scale, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(anim.opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        ])
      ),
    ]).start(() => setAbierto(false));
  };

  const seleccionar = (key) => {
    cerrar();
    setTimeout(() => {
      navigation.navigate('UploadPhoto', { tipoInicial: key });
    }, 200);
  };

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <>
      {/* Overlay oscuro */}
      {abierto && (
        <Animated.View
          style={[styles.overlay, { opacity: opacityBg }]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrar} />
        </Animated.View>
      )}

      {/* Opciones */}
      {abierto && (
        <View style={styles.opciones}>
          {OPCIONES.map((opc, i) => {
            const anim = opcAnimations[i];
            return (
              <Animated.View
                key={opc.key}
                style={[
                  styles.opcionRow,
                  {
                    opacity: anim.opacity,
                    transform: [{ scale: anim.scale }, { translateY: anim.translateY }],
                  }
                ]}
              >
                <View style={[styles.opcionLabel, { backgroundColor: palette.panel, borderColor: palette.border }]}>
                  <Text style={[styles.opcionLabelText, { color: palette.text }]}>{opc.label}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.opcionBtn, { backgroundColor: opc.color }]}
                  onPress={() => seleccionar(opc.key)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={opc.icon} size={22} color="#fff" />
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      )}

      {/* Botón principal */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: palette.primary, shadowColor: palette.primary }]}
        onPress={abierto ? cerrar : abrir}
        activeOpacity={0.9}
      >
        <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
          <Ionicons name="add" size={28} color="#fff" />
        </Animated.View>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 90,
  },
  opciones: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 90,
    right: 20,
    zIndex: 100,
    gap: 12,
    alignItems: 'flex-end',
  },
  opcionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  opcionLabel: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radii.md, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 4, elevation: 3,
  },
  opcionLabelText: { fontSize: 14, fontWeight: '600' },
  opcionBtn: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3,
    shadowRadius: 6, elevation: 5,
  },
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 105 : 85,
    right: 20,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
    shadowOpacity: 0.4, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});