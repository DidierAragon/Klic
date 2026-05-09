import React, { useState, useRef } from 'react';
import {
  View, TouchableOpacity, StyleSheet, Animated,
  Pressable, Text, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTema } from '../context/TemaContext';
import { radii } from '../theme/ui';

const OPCIONES = [
  { key: 'video',   label: 'Video',    icon: 'videocam-outline',   color: '#fb7185' },
  { key: 'opinion', label: 'Opinión',  icon: 'chatbubble-outline', color: '#22d3ee' },
  { key: 'foto',    label: 'Foto',     icon: 'image-outline',      color: '#8b5cf6' },
];

export default function FAB({ navigation }) {
  const { palette } = useTema();
  const [abierto, setAbierto] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;
  const opacityBg = useRef(new Animated.Value(0)).current;

  const opcAnimations = OPCIONES.map(() => ({
    scale: useRef(new Animated.Value(0)).current,
    translateY: useRef(new Animated.Value(30)).current,
    opacity: useRef(new Animated.Value(0)).current,
  }));

  const abrir = () => {
    setAbierto(true);
    Animated.parallel([
      Animated.spring(rotation, {
        toValue: 1, useNativeDriver: true, tension: 100, friction: 8
      }),
      Animated.timing(opacityBg, {
        toValue: 1, duration: 200, useNativeDriver: true
      }),
      ...opcAnimations.map((anim, i) =>
        Animated.sequence([
          Animated.delay(i * 70),
          Animated.parallel([
            Animated.spring(anim.scale, {
              toValue: 1, useNativeDriver: true, tension: 120, friction: 7
            }),
            Animated.spring(anim.translateY, {
              toValue: 0, useNativeDriver: true, tension: 120, friction: 7
            }),
            Animated.timing(anim.opacity, {
              toValue: 1, duration: 150, useNativeDriver: true
            }),
          ]),
        ])
      ),
    ]).start();
  };

  const cerrar = () => {
    Animated.parallel([
      Animated.spring(rotation, {
        toValue: 0, useNativeDriver: true, tension: 100, friction: 8
      }),
      Animated.timing(opacityBg, {
        toValue: 0, duration: 180, useNativeDriver: true
      }),
      ...opcAnimations.map(anim =>
        Animated.parallel([
          Animated.timing(anim.scale, {
            toValue: 0, duration: 150, useNativeDriver: true
          }),
          Animated.timing(anim.opacity, {
            toValue: 0, duration: 150, useNativeDriver: true
          }),
        ])
      ),
    ]).start(() => setAbierto(false));
  };

  const seleccionar = (key) => {
    cerrar();
    setTimeout(() => {
      navigation.navigate('UploadPhoto', { tipoInicial: key });
    }, 220);
  };

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  const BOTTOM_FAB = Platform.OS === 'ios' ? 108 : 88;
  const SPACING = 68; // espacio entre cada opción

  return (
    <>
      {/* Overlay */}
      {abierto && (
        <Animated.View
          style={[styles.overlay, { opacity: opacityBg }]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrar} />
        </Animated.View>
      )}

      {/* Opciones — cada una posicionada individualmente */}
      {OPCIONES.map((opc, i) => {
        const anim = opcAnimations[i];
        const bottomPos = BOTTOM_FAB + 70 + i * SPACING;

        return (
          <Animated.View
            key={opc.key}
            style={[
              styles.opcionWrapper,
              {
                bottom: bottomPos,
                opacity: anim.opacity,
                transform: [{ scale: anim.scale }, { translateY: anim.translateY }],
              }
            ]}
            pointerEvents={abierto ? 'auto' : 'none'}
          >
            <View style={[styles.opcionLabel, {
              backgroundColor: palette.panel,
              borderColor: palette.border,
            }]}>
              <Text style={[styles.opcionLabelText, { color: palette.text }]}>
                {opc.label}
              </Text>
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

      {/* Botón principal FAB */}
      <TouchableOpacity
        style={[styles.fab, {
          bottom: BOTTOM_FAB,
          backgroundColor: abierto ? '#fb7185' : palette.primary,
          shadowColor: abierto ? '#fb7185' : palette.primary,
        }]}
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 90,
  },
  opcionWrapper: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 101,
  },
  opcionLabel: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: radii.md, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowRadius: 4, elevation: 4,
  },
  opcionLabelText: { fontSize: 14, fontWeight: '600' },
  opcionBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3,
    shadowRadius: 6, elevation: 5,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
    shadowOpacity: 0.4, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});