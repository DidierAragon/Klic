import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLike } from '../hooks/useLike';
import { useTema } from '../context/TemaContext';

export default function LikeButton({ contenidoId, tipo }) {
  const { palette } = useTema();
  const { liked, count, toggleLike, loading } = useLike(contenidoId, tipo);

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={toggleLike}
      disabled={loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.primary} />
      ) : (
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={20}
          color={liked ? '#fb7185' : palette.textMuted}
        />
      )}
      <Text style={[styles.count, { color: liked ? '#fb7185' : palette.textMuted }]}>
        {count}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 6,
  },
  count: { fontSize: 12, fontWeight: '600' },
});