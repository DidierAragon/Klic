/**
 * Envía o reactiva una solicitud de amistad entre dos usuarios (tabla `amigos` con user1_id < user2_id).
 */
export async function enviarSolicitudAmistad(supabase, currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    return { ok: false, message: 'Usuario no válido' };
  }

  const u1 = currentUserId < targetUserId ? currentUserId : targetUserId;
  const u2 = currentUserId < targetUserId ? targetUserId : currentUserId;

  const { data: row, error: selErr } = await supabase
    .from('amigos')
    .select('id, estado, solicitante_id')
    .eq('user1_id', u1)
    .eq('user2_id', u2)
    .maybeSingle();

  if (selErr) return { ok: false, message: selErr.message };

  if (!row) {
    const { error } = await supabase.from('amigos').insert({
      user1_id: u1,
      user2_id: u2,
      solicitante_id: currentUserId,
      estado: 'pendiente',
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, action: 'sent' };
  }

  if (row.estado === 'aceptado') {
    return { ok: false, message: 'Ya son amigos' };
  }

  if (row.estado === 'pendiente') {
    if (row.solicitante_id === currentUserId) {
      return { ok: false, message: 'Ya enviaste una solicitud a esta persona' };
    }
    return {
      ok: false,
      message: 'Esta persona ya te envió una solicitud. Ábrela en Social → Amigos.',
    };
  }

  if (row.estado === 'rechazado') {
    const { error } = await supabase
      .from('amigos')
      .update({
        estado: 'pendiente',
        solicitante_id: currentUserId,
      })
      .eq('id', row.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, action: 'resent' };
  }

  return { ok: false, message: 'No se pudo enviar la solicitud' };
}
