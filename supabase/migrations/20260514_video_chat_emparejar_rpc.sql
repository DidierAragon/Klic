-- Emparejamiento atómico en servidor (evita fallos de INSERT/DELETE desde el cliente con RLS o carreras).
-- Tras aplicar, el cliente usa supabase.rpc('emparejar_video_cola').

CREATE OR REPLACE FUNCTION public.emparejar_video_cola()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  partner uuid;
  sid uuid;
  u1 uuid;
  u2 uuid;
BEGIN
  me := auth.uid();
  IF me IS NULL THEN
    RETURN NULL;
  END IF;

  -- Serializa emparejamientos concurrentes (una pareja por transacción).
  PERFORM pg_advisory_xact_lock(778849331);

  IF NOT EXISTS (SELECT 1 FROM public.video_cola WHERE user_id = me) THEN
    RETURN NULL;
  END IF;

  SELECT vc.user_id INTO partner
  FROM public.video_cola vc
  WHERE vc.user_id <> me
  ORDER BY vc.en_espera_desde ASC
  LIMIT 1;

  IF partner IS NULL THEN
    RETURN NULL;
  END IF;

  IF me::text < partner::text THEN
    u1 := me;
    u2 := partner;
  ELSE
    u1 := partner;
    u2 := me;
  END IF;

  -- Solo el menor inserta (misma regla que la política RLS de INSERT en video_sesiones).
  IF me <> u1 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.video_sesiones (user1_id, user2_id, estado, inicio)
  VALUES (u1, u2, 'conectando', now())
  RETURNING id INTO sid;

  DELETE FROM public.video_cola WHERE user_id IN (me, partner);

  RETURN jsonb_build_object(
    'sesion_id', sid,
    'otro_user_id', partner,
    'es_caller', true
  );
END;
$$;

COMMENT ON FUNCTION public.emparejar_video_cola() IS
  'Empareja al usuario actual con el más antiguo en video_cola; solo el UUID menor crea la sesión y vacía la cola.';

REVOKE ALL ON FUNCTION public.emparejar_video_cola() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emparejar_video_cola() TO authenticated;
