import React, { useState, useCallback } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  ActivityIndicator, Text, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useTema } from '../context/TemaContext';

export default function VideoPlayer({ url, height = 280, bloqueado = false }) {
  const { palette } = useTema();
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.volume = 1.0;
  });

  const playerFullscreen = useVideoPlayer(url, (p) => {
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
    } finally {
      setLoading(false);
    }
  }, [playing, player, bloqueado]);

  const abrirFullscreen = async () => {
    player.pause();
    setPlaying(false);
    setFullscreen(true);
    try {
      await playerFullscreen.play();
    } catch (e) { console.warn(e); }
  };

  const cerrarFullscreen = () => {
    playerFullscreen.pause();
    setFullscreen(false);
  };

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
    <>
      {/* Modal pantalla completa */}
      <Modal
        visible={fullscreen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={cerrarFullscreen}
      >
        <View style={styles.fullscreenContainer}>
          <VideoView
            player={playerFullscreen}
            style={styles.fullscreenVideo}
            contentFit="contain"
            nativeControls
          />
          <TouchableOpacity
            style={[styles.closeFullscreen, { top: insets.top + 12 }]}
            onPress={cerrarFullscreen}
          >
            <View style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Video en feed */}
      <View style={[styles.container, { height }]}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
        />

        {/* Overlay play */}
        {!playing && (
          <TouchableOpacity
            style={styles.playOverlay}
            onPress={togglePlay}
            activeOpacity={0.8}
          >
            <View style={[styles.playBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
              {loading
                ? <ActivityIndicator size="large" color="#fff" />
                : <Ionicons name="play" size={42} color="#fff" />
              }
            </View>
          </TouchableOpacity>
        )}

        {/* Controles cuando está reproduciendo */}
        {playing && (
          <View style={styles.controls}>
            <TouchableOpacity onPress={togglePlay} style={styles.controlBtn}>
              <Ionicons name="pause" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={abrirFullscreen} style={styles.controlBtn}>
              <Ionicons name="expand" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Botón fullscreen cuando no está reproduciendo */}
        {!playing && !loading && (
          <TouchableOpacity
            style={styles.expandBtn}
            onPress={abrirFullscreen}
          >
            <Ionicons name="expand-outline" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </>
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

  controls: {
    position: 'absolute',
    bottom: 10, right: 10,
    flexDirection: 'row', gap: 8,
  },
  controlBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  expandBtn: {
    position: 'absolute',
    bottom: 10, right: 10,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Fullscreen
  fullscreenContainer: {
    flex: 1, backgroundColor: '#000',
    justifyContent: 'center', alignItems: 'center',
  },
  fullscreenVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  closeFullscreen: {
    position: 'absolute',
    left: 16,
    zIndex: 2,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },

  errorBox: {
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  errorText: { fontSize: 13 },
});