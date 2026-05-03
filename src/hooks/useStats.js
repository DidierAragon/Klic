import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

export function useStats(userId) {
  const [stats, setStats] = useState({ fotos: 0, matches: 0, votosRecibidos: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const cargar = async () => {
      try {
        const { data: misFootos } = await supabase
          .from('fotos_perfil').select('id').eq('user_id', userId);
        const ids = (misFootos || []).map(f => f.id);

        const [
          { count: fotos },
          { count: matches },
          { count: votos },
        ] = await Promise.all([
          supabase.from('fotos_perfil')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId),
          supabase.from('matches')
            .select('*', { count: 'exact', head: true })
            .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
          ids.length > 0
            ? supabase.from('votos')
                .select('*', { count: 'exact', head: true })
                .eq('decision', 'smash')
                .in('foto_id', ids)
            : Promise.resolve({ count: 0 }),
        ]);

        setStats({
          fotos: fotos || 0,
          matches: matches || 0,
          votosRecibidos: votos || 0,
        });
      } catch (e) {
        console.warn('useStats error:', e);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [userId]);

  return { stats, loading };
}