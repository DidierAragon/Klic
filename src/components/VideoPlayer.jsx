import React, { useRef, useState, useCallback } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  ActivityIndicator, Text
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useTema } from '../context/TemaContext';

export default function VideoPlayer({ url, height = 300, bloqueado = false }) {
  const { palette } = useTema();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef(null);

  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.volume = 1.0;
  });

  const togglePlay = useCallback(async () => {
    if (bloqueado || !player) return;
    try {
      setLoading(true);
      if (playing) {
        player.pause();
        setPlaying(false);
      } else {
        await player.play();
        setPlaying(true);
      }
    } catch (e) {
      setError(true);
      console.warn('VideoPlayer error:', e);
    } finally {
      setLoading(false);
    }
  }, [playing, player, bloqueado]);

  if (error) {
    return (
      <View style={[styles.errorBox, { height, backgroundColor: palette.panelSoft }]}>
        <Ionicons name="alert-circle-outline" size={36} color={palette.textMuted} />
        <Text style={[styles.errorText, { color: palette.textMuted }]}>
          No se pudo cargar el video
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <VideoView
        ref={ref}
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={playing}
      />

      {/* Overlay con botón play cuando no está reproduciendo */}
      {!playing && (
        <TouchableOpacity
          style={styles.playOverlay}
          onPress={togglePlay}
          activeOpacity={0.8}
        >
          <View style={[styles.playBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            {loading
              ? <ActivityIndicator size="large" color="#fff" />
              : <Ionicons name="play" size={42} color="#fff" />
            }
          </View>
        </TouchableOpacity>
      )}

      {/* Botón pausa cuando está reproduciendo */}
      {playing && (
        <TouchableOpacity
          style={styles.pauseOverlay}
          onPress={togglePlay}
          activeOpacity={0.7}
        >
          <View style={[styles.pauseBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
            <Ionicons name="pause" size={20} color="#fff" />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtn: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center',
  },
  pauseOverlay: {
    position: 'absolute',
    top: 10, right: 10,
  },
  pauseBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  errorBox: {
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  errorText: { fontSize: 13 },
});