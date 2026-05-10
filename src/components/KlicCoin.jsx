import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function KlicCoin({ size = 40 }) {
  const innerSize = size * 0.91;
  const fontSize = size * 0.44;

  return (
    <View style={[styles.outer, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient
        colors={['#b8860b', '#3D2400']}
        start={{ x: 0.38, y: 0.32 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      
      <View style={[styles.inner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        <LinearGradient
          colors={['#FFE566', '#A06A00']}
          start={{ x: 0.38, y: 0.35 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: innerSize / 2 }]}
        />
        
        {/* Decorative dashed lines (simplified as borders for RN) */}
        <View style={[styles.deco1, { 
          inset: size * 0.036, 
          borderRadius: innerSize / 2,
          borderWidth: 1,
          borderColor: '#7A520033',
          borderStyle: 'dashed'
        }]} />
        
        <Text style={[styles.text, { fontSize, textShadowOffset: { width: 2, height: 3 } }]}>
          K
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  inner: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  deco1: {
    position: 'absolute',
    opacity: 0.3,
  },
  text: {
    fontWeight: '900',
    color: '#3D2400',
    fontFamily: 'serif',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowRadius: 6,
  }
});
