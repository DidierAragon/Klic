import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

export function useLike(contenidoId, tipo) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contenidoId) return;
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: likeExiste }, { count: total }] = await Promise.all([
        supabase.from('likes').select('id')
          .eq('user_id', user.id)
          .eq('contenido_id', contenidoId)
          .eq('tipo', tipo)
          .maybeSingle(),
        supabase.from('likes')
          .select('*', { count: 'exact', head: true })
          .eq('contenido_id', contenidoId)
          .eq('tipo', tipo),
      ]);

      setLiked(!!likeExiste);
      setCount(total || 0);
    };
    cargar();
  }, [contenidoId, tipo]);

  const toggleLike = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (liked) {
        await supabase.from('likes').delete()
          .eq('user_id', user.id)
          .eq('contenido_id', contenidoId)
          .eq('tipo', tipo);
        setLiked(false);
        setCount(prev => Math.max(0, prev - 1));
      } else {
        await supabase.from('likes').insert({
          user_id: user.id,
          contenido_id: contenidoId,
          tipo,
        });
        setLiked(true);
        setCount(prev => prev + 1);
      }
    } catch (e) {
      console.warn('toggleLike error:', e);
    } finally {
      setLoading(false);
    }
  };

  return { liked, count, toggleLike, loading };
}