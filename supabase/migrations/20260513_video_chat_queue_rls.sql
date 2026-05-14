-- Video chat: cola, sesiones y señalización WebRTC.
-- Corrige emparejamiento cuando RLS impedía ver otras filas en video_cola.
-- Aplica en el proyecto Supabase: supabase db push / SQL editor.

-- ── Tablas (idempotente) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.video_cola (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  en_espera_desde timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.video_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  user2_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'conectando',
  inicio timestamptz NOT NULL DEFAULT now(),
  fin timestamptz
);

DO $c$
BEGIN
  ALTER TABLE public.video_sesiones
    ADD CONSTRAINT video_sesiones_user_order CHECK (user1_id::text < user2_id::text);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$c$;

DO $c$
BEGIN
  ALTER TABLE public.video_sesiones
    ADD CONSTRAINT video_sesiones_distinct_users CHECK (user1_id <> user2_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$c$;

CREATE UNIQUE INDEX IF NOT EXISTS video_sesiones_pair_uidx
  ON public.video_sesiones (user1_id, user2_id);

CREATE INDEX IF NOT EXISTS video_sesiones_user2_estado_idx
  ON public.video_sesiones (user2_id, estado);

CREATE TABLE IF NOT EXISTS public.webrtc_senalizacion (
  id bigserial PRIMARY KEY,
  sesion_id uuid NOT NULL REFERENCES public.video_sesiones (id) ON DELETE CASCADE,
  emisor_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS webrtc_senalizacion_sesion_idx
  ON public.webrtc_senalizacion (sesion_id);

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.video_cola ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webrtc_senalizacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "video_cola_select_match" ON public.video_cola;
CREATE POLICY "video_cola_select_match"
  ON public.video_cola FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "video_cola_insert_own" ON public.video_cola;
CREATE POLICY "video_cola_insert_own"
  ON public.video_cola FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "video_cola_delete_own" ON public.video_cola;
CREATE POLICY "video_cola_delete_own"
  ON public.video_cola FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "video_sesiones_select_participants" ON public.video_sesiones;
CREATE POLICY "video_sesiones_select_participants"
  ON public.video_sesiones FOR SELECT TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

DROP POLICY IF EXISTS "video_sesiones_insert_ordered_caller" ON public.video_sesiones;
CREATE POLICY "video_sesiones_insert_ordered_caller"
  ON public.video_sesiones FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user1_id
    AND user1_id::text < user2_id::text
  );

DROP POLICY IF EXISTS "video_sesiones_update_participants" ON public.video_sesiones;
CREATE POLICY "video_sesiones_update_participants"
  ON public.video_sesiones FOR UPDATE TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id)
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

DROP POLICY IF EXISTS "webrtc_select_session" ON public.webrtc_senalizacion;
CREATE POLICY "webrtc_select_session"
  ON public.webrtc_senalizacion FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.video_sesiones s
      WHERE s.id = sesion_id
        AND (s.user1_id = auth.uid() OR s.user2_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "webrtc_insert_session" ON public.webrtc_senalizacion;
CREATE POLICY "webrtc_insert_session"
  ON public.webrtc_senalizacion FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = emisor_id
    AND EXISTS (
      SELECT 1 FROM public.video_sesiones s
      WHERE s.id = sesion_id
        AND (s.user1_id = auth.uid() OR s.user2_id = auth.uid())
    )
  );

-- Realtime (solo si aún no está en la publicación)
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'video_cola'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_cola;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'video_sesiones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_sesiones;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'webrtc_senalizacion'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webrtc_senalizacion;
  END IF;
END
$pub$;
