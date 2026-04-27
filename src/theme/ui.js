export const temas = {
  violeta: {
    nombre: 'Violeta',
    emoji: '💜',
    primary: '#8b5cf6',
    secondary: '#22d3ee',
    danger: '#fb7185',
  },
  verde: {
    nombre: 'Verde Menta',
    emoji: '🌿',
    primary: '#4a9e4a',
    secondary: '#DFF1DE',
    danger: '#fb7185',
  },
  cian: {
    nombre: 'Cian',
    emoji: '🩵',
    primary: '#3A6264',
    secondary: '#8EEFF5',
    danger: '#fb7185',
  },
  purpura: {
    nombre: 'Púrpura',
    emoji: '🔮',
    primary: '#C053F5',
    secondary: '#B850EC',
    danger: '#fb7185',
  },
  terracota: {
    nombre: 'Terracota',
    emoji: '🌅',
    primary: '#A88163',
    secondary: '#F5BC90',
    danger: '#fb7185',
  },
};

export const crearPaleta = (tema = temas.violeta) => ({
  bg: '#07070b',
  panel: '#111120',
  panelSoft: '#17172a',
  text: '#f4f6ff',
  textMuted: '#9aa0c7',
  primary: tema.primary,
  secondary: tema.secondary,
  danger: tema.danger,
  border: '#272741',
});

// Paleta por defecto (violeta)
export const palette = crearPaleta(temas.violeta);

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
};

export const crearGlow = (color) => ({
  shadowColor: color,
  shadowOpacity: 0.35,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
});

export const glow = crearGlow('#8b5cf6');