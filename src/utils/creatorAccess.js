import { supabase } from '../services/supabase';

/**
 * Acceso al panel de creador: flag en users O al menos un ítem publicado con precio > 0.
 */
export async function usuarioPuedePanelCreador(userId) {
  if (!userId) return false;

  const { data: perfil } = await supabase
    .from('users')
    .select('es_creador')
    .eq('id', userId)
    .maybeSingle();

  if (perfil?.es_creador) return true;

  const [f, v, o] = await Promise.all([
    supabase
      .from('fotos_perfil')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('precio', 0),
    supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('precio', 0),
    supabase
      .from('opiniones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('precio', 0),
  ]);

  const n = (f.count || 0) + (v.count || 0) + (o.count || 0);
  return n > 0;
}
