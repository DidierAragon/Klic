import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../services/supabase';
import MainMenu from '../../components/MainMenu';
import { palette, radii } from '../../theme/ui';

export default function ProfileScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [photosCount, setPhotosCount] = useState(0);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      setEmail(user.email || '');

      const [{ data: profileData }, { count }] = await Promise.all([
        supabase.from('users').select('nombre, fecha_nacimiento').eq('id', user.id).maybeSingle(),
        supabase.from('fotos_perfil').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      setProfile(profileData || null);
      setPhotosCount(count || 0);
      setLoading(false);
    };

    loadProfile();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mi perfil</Text>
      {loading ? (
        <ActivityIndicator size="large" color={palette.primary} />
      ) : (
        <View style={styles.card}>
          <Text style={styles.name}>{profile?.nombre || 'Usuario'}</Text>
          <Text style={styles.meta}>{email}</Text>
          <Text style={styles.meta}>Nacimiento: {profile?.fecha_nacimiento || 'Sin dato'}</Text>
          <Text style={styles.meta}>Fotos publicadas: {photosCount}</Text>
        </View>
      )}
      <MainMenu navigation={navigation} active="Profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingHorizontal: 20,
    paddingTop: 60,
    justifyContent: 'space-between',
  },
  title: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 24,
  },
  card: {
    flex: 1,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    padding: 20,
    gap: 10,
  },
  name: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
  },
  meta: {
    color: palette.textMuted,
    fontSize: 15,
  },
});
