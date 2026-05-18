-- =====================================================================
-- Sprint: Sistema de Propinas (Tips) con Klic Coins y Notificaciones
-- =====================================================================

-- 1. Crear las tablas primero (para asegurar que las relaciones existan)
CREATE TABLE IF NOT EXISTS public.propinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id UUID,
  post_type TEXT,
  monto INTEGER NOT NULL CHECK (monto > 0),
  mensaje TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, -- destinatario
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, -- causante
  tipo TEXT NOT NULL, -- 'propina', 'comentario', 'like', etc.
  mensaje TEXT NOT NULL,
  leido BOOLEAN DEFAULT false NOT NULL,
  extra_info JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Limpieza de políticas previas en tablas públicas
DROP POLICY IF EXISTS "Permitir insertar propinas a cualquier autenticado" ON public.propinas;
DROP POLICY IF EXISTS "Permitir leer propinas enviadas o recibidas" ON public.propinas;
DROP POLICY IF EXISTS "Permitir leer propias notificaciones" ON public.notificaciones;
DROP POLICY IF EXISTS "Permitir insertar notificaciones a cualquier autenticado" ON public.notificaciones;
DROP POLICY IF EXISTS "Permitir marcar como leida una notificacion propia" ON public.notificaciones;

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.propinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- 3. Crear Políticas de RLS para tablas públicas
CREATE POLICY "Permitir insertar propinas a cualquier autenticado"
  ON public.propinas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Permitir leer propinas enviadas o recibidas"
  ON public.propinas FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Permitir leer propias notificaciones"
  ON public.notificaciones FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Permitir insertar notificaciones a cualquier autenticado"
  ON public.notificaciones FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = actor_id);

CREATE POLICY "Permitir marcar como leida una notificacion propia"
  ON public.notificaciones FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. POLÍTICAS DE RLS PARA EL BUCKET DE STORAGE 'fotos' (tips/)
-- Limpiar políticas de storage previas para evitar duplicados
DROP POLICY IF EXISTS "Permitir subir fotos de tips" ON storage.objects;
DROP POLICY IF EXISTS "Permitir leer fotos de tips" ON storage.objects;

-- Permitir a usuarios autenticados subir imágenes de propinas a su propia subcarpeta tips/uid/
CREATE POLICY "Permitir subir fotos de tips"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fotos' 
    AND (storage.foldername(name))[1] = 'tips'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Permitir el acceso de lectura a todas las imágenes en el bucket 'fotos' para que se muestren en la app
CREATE POLICY "Permitir leer fotos de tips"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'fotos');

-- 5. Función RPC para enviar propinas con monedas y generar notificaciones
CREATE OR REPLACE FUNCTION public.send_tip_with_coins(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_monto INTEGER,
  p_mensaje TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_post_id UUID DEFAULT NULL,
  p_post_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sender_balance INTEGER;
  v_receiver_exists BOOLEAN;
  v_sender_name TEXT;
BEGIN
  -- Verificar que el receptor exista
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = p_receiver_id) INTO v_receiver_exists;
  IF NOT v_receiver_exists THEN
    RETURN jsonb_build_object('success', false, 'message', 'El creador destinatario no existe');
  END IF;

  -- Evitar enviarse propina a sí mismo
  IF p_sender_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'No puedes enviarte propina a ti mismo');
  END IF;

  -- Obtener saldo del remitente
  SELECT balance INTO v_sender_balance FROM public.wallets WHERE user_id = p_sender_id;
  IF v_sender_balance IS NULL OR v_sender_balance < p_monto THEN
    RETURN jsonb_build_object('success', false, 'message', 'Saldo insuficiente de Klic Coins');
  END IF;

  -- Obtener nombre del remitente para la notificación
  SELECT nombre INTO v_sender_name FROM public.users WHERE id = p_sender_id;
  IF v_sender_name IS NULL THEN
    v_sender_name := 'Un seguidor';
  END IF;

  -- Descontar del remitente
  UPDATE public.wallets 
  SET balance = balance - p_monto 
  WHERE user_id = p_sender_id;

  -- Acreditar al destinatario (creando billetera si no existe)
  INSERT INTO public.wallets (user_id, balance)
  VALUES (p_receiver_id, p_monto)
  ON CONFLICT (user_id) 
  DO UPDATE SET balance = public.wallets.balance + p_monto;

  -- Registrar la propina
  INSERT INTO public.propinas (
    sender_id,
    receiver_id,
    monto,
    mensaje,
    image_url,
    post_id,
    post_type
  ) VALUES (
    p_sender_id,
    p_receiver_id,
    p_monto,
    p_mensaje,
    p_image_url,
    p_post_id,
    p_post_type
  );

  -- Registrar la notificación para el creador destinatario
  INSERT INTO public.notificaciones (
    user_id,
    actor_id,
    tipo,
    mensaje,
    extra_info
  ) VALUES (
    p_receiver_id,
    p_sender_id,
    'propina',
    v_sender_name || ' te envió una propina de ' || p_monto || ' Klic Coins 🎁. ¡Revisa tu Panel de Creador!',
    jsonb_build_object('monto', p_monto, 'post_id', p_post_id, 'post_type', p_post_type)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Propina enviada exitosamente');
END;
$$;
