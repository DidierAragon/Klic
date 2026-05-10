import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, Text, TouchableOpacity, View, Animated, Platform
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { radii } from '../theme/ui';
import { useTema } from '../context/TemaContext';
import { supabase } from '../services/supabase';
import { usuarioPuedePanelCreador } from '../utils/creatorAccess';

const ITEMS_BASE = [
  { key: 'Home', label: 'Inicio', icon: 'home-outline', iconActive: 'home' },
  { key: 'SmashOrPass', label: 'Klic', icon: 'flash-outline', iconActive: 'flash' },
  { key: 'Social', label: 'Social', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { key: 'Matches', label: 'Matches', icon: 'heart-outline', iconActive: 'heart' },
  { key: 'Profile', label: 'Perfil', icon: 'person-outline', iconActive: 'person' },
];

const CREATOR_TAB = {
  key: 'CreatorDashboard',
  label: 'Ventas',
  icon: 'wallet-outline',
  iconActive: 'wallet',
};

function itemsDelMenu(mostrarVentas) {
  if (!mostrarVentas) return ITEMS_BASE;
  const i = ITEMS_BASE.findIndex((x) => x.key === 'Profile');
  return [...ITEMS_BASE.slice(0, i), CREATOR_TAB, ...ITEMS_BASE.slice(i)];
}

function NavItem({ item, isActive, onPress, palette }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(isActive ? 1 : 0.6)).current;

  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1.15,
          useNativeDriver: true,
          tension: 120,
          friction: 6,
        }),
        Animated.spring(translateY, {
          toValue: -4,
          useNativeDriver: true,
          tension: 120,
          friction: 6,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 120,
          friction: 6,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 6,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive]);

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, tension: 200, friction: 5 }),
      Animated.spring(scale, { toValue: isActive ? 1.15 : 1, useNativeDriver: true, tension: 200, friction: 5 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity
      style={styles.item}
      onPress={handlePress}
      activeOpacity={1}
    >
      <Animated.View style={[
        styles.iconContainer,
        isActive && { backgroundColor: palette.primary + '20' },
        { transform: [{ scale }, { translateY }], opacity }
      ]}>
        <Ionicons
          name={isActive ? item.iconActive : item.icon}
          size={22}
          color={isActive ? palette.primary : palette.textMuted}
        />
      </Animated.View>
      <Animated.Text style={[
        styles.label,
        { opacity, color: isActive ? palette.primary : palette.textMuted },
        isActive && { fontWeight: '700' }
      ]}>
        {item.label}
      </Animated.Text>
      {isActive && (
        <View style={[styles.activeDot, { backgroundColor: palette.primary }]} />
      )}
    </TouchableOpacity>
  );
}

export default function MainMenu({ navigation, active }) {
  const { palette } = useTema();
  const [items, setItems] = useState(ITEMS_BASE);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setItems(ITEMS_BASE);
          return;
        }
        const puede = await usuarioPuedePanelCreador(user.id);
        if (!cancelled) setItems(itemsDelMenu(puede));
      })();
      return () => { cancelled = true; };
    }, [])
  );

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.panel, borderTopColor: palette.border }]}>
      {items.map((item) => (
        <NavItem
          key={item.key}
          item={item}
          isActive={item.key === active}
          onPress={() => navigation.navigate(item.key)}
          palette={palette}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  item: {
    flex: 1, alignItems: 'center',
    paddingVertical: 2, gap: 3,
  },
  iconContainer: {
    width: 44, height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 9, fontWeight: '600' },
  activeDot: {
    width: 4, height: 4,
    borderRadius: 2, marginTop: 1,
  },
});
