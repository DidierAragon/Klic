import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { radii } from '../theme/ui';
import { useTema } from '../context/TemaContext';

const ITEMS = [
  { key: 'Home', label: 'Inicio', icon: '🏠' },
  { key: 'SmashOrPass', label: 'Klic', icon: '🔥' },
  { key: 'UploadPhoto', label: 'Subir', icon: '📸' },
  { key: 'Profile', label: 'Perfil', icon: '👤' },
  { key: 'Settings', label: 'Ajustes', icon: '⚙️' },
];

export default function MainMenu({ navigation, active }) {
  const { palette } = useTema();
  const styles = makeStyles(palette);

  return (
    <View style={styles.wrapper}>
      {ITEMS.map((item) => {
        const selected = item.key === active;
        return (
          <TouchableOpacity
            key={item.key}
            style={styles.item}
            onPress={() => navigation.navigate(item.key)}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={[styles.text, selected && { color: palette.primary, fontWeight: '700' }]}>
              {item.label}
            </Text>
            {selected && (
              <View style={[styles.dot, { backgroundColor: palette.primary }]} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (palette) => StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: palette.panel,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingBottom: 20,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  item: {
    flex: 1, alignItems: 'center',
    paddingVertical: 4, gap: 2,
  },
  icon: { fontSize: 20 },
  text: {
    color: palette.textMuted,
    fontSize: 10, fontWeight: '600',
  },
  dot: {
    width: 4, height: 4,
    borderRadius: 2, marginTop: 2,
  },
});