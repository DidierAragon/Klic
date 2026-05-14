-- Asegura que emparejar_video_cola vea todas las filas de la cola aunque el dueño
-- de la función no coincida con las políticas TO authenticated (RLS).
-- Política UPDATE: el cliente usa upsert() sobre video_cola; sin UPDATE la
-- segunda búsqueda del mismo usuario puede fallar en silencio.

CREATE OR REPLACE FUNCTION public.emparejar_video_cola()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
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

DROP POLICY IF EXISTS "video_cola_update_own" ON public.video_cola;
CREATE POLICY "video_cola_update_own"
  ON public.video_cola FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
