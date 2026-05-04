-- Ejecuta esto en el SQL Editor de Supabase (o con supabase db push) si aún no aplicaste la migración.
-- Añade respuestas (parent_id), likes por comentario y reportes.

ALTER TABLE public.comentarios
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comentarios(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comentarios_parent_id ON public.comentarios(parent_id);

CREATE TABLE IF NOT EXISTS public.comentarios_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comentario_id uuid NOT NULL REFERENCES public.comentarios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comentario_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comentarios_likes_comentario ON public.comentarios_likes(comentario_id);

CREATE TABLE IF NOT EXISTS public.comentarios_reportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comentario_id uuid NOT NULL REFERENCES public.comentarios(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comentario_id, reporter_user_id)
);

ALTER TABLE public.comentarios_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_reportes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comentarios_likes_select" ON public.comentarios_likes;
CREATE POLICY "comentarios_likes_select" ON public.comentarios_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "comentarios_likes_insert_own" ON public.comentarios_likes;
CREATE POLICY "comentarios_likes_insert_own" ON public.comentarios_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comentarios_likes_delete_own" ON public.comentarios_likes;
CREATE POLICY "comentarios_likes_delete_own" ON public.comentarios_likes
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "comentarios_reportes_insert_own" ON public.comentarios_reportes;
CREATE POLICY "comentarios_reportes_insert_own" ON public.comentarios_reportes
  FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);

DROP POLICY IF EXISTS "comentarios_reportes_select_own" ON public.comentarios_reportes;
CREATE POLICY "comentarios_reportes_select_own" ON public.comentarios_reportes
  FOR SELECT USING (auth.uid() = reporter_user_id);
