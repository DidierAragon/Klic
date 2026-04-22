import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { palette, radii } from '../theme/ui';

const ITEMS = [
  { key: 'Profile', label: 'Perfil' },
  { key: 'SmashOrPass', label: 'Smash' },
  { key: 'UploadPhoto', label: 'Subir' },
  { key: 'Settings', label: 'Ajustes' },
];

export default function MainMenu({ navigation, active }) {
  return (
    <View style={styles.wrapper}>
      {ITEMS.map((item) => {
        const selected = item.key === active;
        return (
          <TouchableOpacity
            key={item.key}
            style={[styles.item, selected && styles.itemActive]}
            onPress={() => navigation.navigate(item.key)}
          >
            <Text style={[styles.text, selected && styles.textActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: palette.panel,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    padding: 6,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    marginTop: 16,
    marginBottom: 10,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radii.pill,
    paddingVertical: 10,
  },
  itemActive: {
    backgroundColor: palette.primary,
  },
  text: {
    color: palette.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  textActive: {
    color: palette.text,
  },
});
