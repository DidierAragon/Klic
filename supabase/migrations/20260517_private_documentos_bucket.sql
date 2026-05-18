-- =====================================================================
-- Sprint: Bucket privado 'documentos' en Supabase Storage
-- Reglas:
--   1. Solo el usuario puede subir, actualizar y eliminar su propio documento (dentro de su carpeta: userId/)
--   2. Solo los administradores (es_admin = true) pueden ver/revisar todos los documentos.
-- =====================================================================

-- 1. Asegurar columnas y tipos de datos correctos en public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS es_admin BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nivel_verificacion TEXT DEFAULT 'sin_verificar';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS documento_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS documento_verificado BOOLEAN DEFAULT false;

-- Forzar tipos de datos correctos (en caso de que hayan sido creados con tipos incorrectos como INTEGER)
ALTER TABLE public.users ALTER COLUMN nivel_verificacion TYPE TEXT USING nivel_verificacion::text;
ALTER TABLE public.users ALTER COLUMN documento_url TYPE TEXT USING documento_url::text;
ALTER TABLE public.users ALTER COLUMN documento_verificado TYPE BOOLEAN USING documento_verificado::boolean;

-- 2. Asegurar que el bucket 'documentos' existe y es privado (public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos', 'documentos', false, null, null)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. Eliminar políticas previas para evitar duplicidad o conflictos
DROP POLICY IF EXISTS "Permitir a usuarios subir su propio documento" ON storage.objects;
DROP POLICY IF EXISTS "Permitir a usuarios actualizar su propio documento" ON storage.objects;
DROP POLICY IF EXISTS "Permitir a usuarios eliminar su propio documento" ON storage.objects;
DROP POLICY IF EXISTS "Permitir a admins revisar todos los documentos" ON storage.objects;

-- 5. Crear políticas de acceso seguro en storage.objects para el bucket 'documentos'

-- A) INSERT: Permitir a usuarios autenticados subir un documento si la ruta coincide con su UID
CREATE POLICY "Permitir a usuarios subir su propio documento"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documentos' AND 
  split_part(name, '/', 1) = auth.uid()::text
);

-- B) UPDATE: Permitir a usuarios autenticados sobreescribir/actualizar su propio documento (necesario para upsert)
CREATE POLICY "Permitir a usuarios actualizar su propio documento"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documentos' AND 
  split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'documentos' AND 
  split_part(name, '/', 1) = auth.uid()::text
);

-- C) DELETE: Permitir a usuarios autenticados borrar su propio documento
CREATE POLICY "Permitir a usuarios eliminar su propio documento"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documentos' AND 
  split_part(name, '/', 1) = auth.uid()::text
);

-- D) SELECT: Permitir ÚNICAMENTE a los administradores (es_admin = true) leer/ver los documentos
CREATE POLICY "Permitir a admins revisar todos los documentos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documentos' AND
  (SELECT es_admin FROM public.users WHERE id = auth.uid()) = true
);
