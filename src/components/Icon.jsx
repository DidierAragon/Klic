import { Ionicons } from '@expo/vector-icons';
import { useTema } from '../context/TemaContext';

export default function Icon({ name, size = 22, color }) {
  const { palette } = useTema();
  return (
    <Ionicons
      name={name}
      size={size}
      color={color || palette.primary}
    />
  );
}