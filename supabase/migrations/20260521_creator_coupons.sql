-- =====================================================================
-- Sprint: Códigos de Descuento Únicos y Membresías Gratuitas
-- =====================================================================

-- 1. Crear tabla de códigos de descuento
CREATE TABLE IF NOT EXISTS public.codigos_descuento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creador_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  codigo TEXT UNIQUE NOT NULL, -- e.g., 'PASS-ABC123'
  porcentaje_descuento INTEGER NOT NULL CHECK (porcentaje_descuento > 0 AND porcentaje_descuento <= 100),
  usado BOOLEAN DEFAULT false NOT NULL,
  usado_por_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en códigos de descuento
ALTER TABLE public.codigos_descuento ENABLE ROW LEVEL SECURITY;

-- 2. Políticas de Seguridad RLS
DROP POLICY IF EXISTS "Permitir a creadores ver sus codigos" ON public.codigos_descuento;
CREATE POLICY "Permitir a creadores ver sus codigos"
  ON public.codigos_descuento FOR SELECT
  TO authenticated
  USING (auth.uid() = creador_id);

DROP POLICY IF EXISTS "Permitir a creadores insertar sus codigos" ON public.codigos_descuento;
CREATE POLICY "Permitir a creadores insertar sus codigos"
  ON public.codigos_descuento FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creador_id);

DROP POLICY IF EXISTS "Permitir a creadores eliminar sus codigos inactivos" ON public.codigos_descuento;
CREATE POLICY "Permitir a creadores eliminar sus codigos inactivos"
  ON public.codigos_descuento FOR DELETE
  TO authenticated
  USING (auth.uid() = creador_id AND usado = false);

DROP POLICY IF EXISTS "Permitir a usuarios verificar codigos" ON public.codigos_descuento;
-- Esta política permite a cualquier usuario autenticado buscar un código específico por texto
CREATE POLICY "Permitir a usuarios verificar codigos"
  ON public.codigos_descuento FOR SELECT
  TO authenticated
  USING (true);

-- 3. Función RPC para canjear un cupón
CREATE OR REPLACE FUNCTION public.redeem_coupon(
  p_user_id UUID,
  p_codigo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coupon_id UUID;
  v_creador_id UUID;
  v_porcentaje INTEGER;
  v_usado BOOLEAN;
  v_nombre_creador TEXT;
BEGIN
  -- Convertir código a mayúsculas para evitar problemas de capitalización
  p_codigo := upper(trim(p_codigo));

  -- Buscar información del cupón
  SELECT id, creador_id, porcentaje_descuento, usado
  INTO v_coupon_id, v_creador_id, v_porcentaje, v_usado
  FROM public.codigos_descuento
  WHERE upper(codigo) = p_codigo;

  -- 1. Validaciones
  IF v_coupon_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Código de descuento inválido o no existe');
  END IF;

  IF v_usado THEN
    RETURN jsonb_build_object('success', false, 'message', 'Este código ya ha sido utilizado por otro usuario');
  END IF;

  IF v_creador_id = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'No puedes canjear tus propios cupones');
  END IF;

  -- Obtener nombre del creador
  SELECT nombre INTO v_nombre_creador FROM public.users WHERE id = v_creador_id;

  -- 2. Procesar Canje de Descuento del 100% (Membresía Gratuita)
  IF v_porcentaje = 100 THEN
    -- Marcar código como usado
    UPDATE public.codigos_descuento
    SET usado = true, usado_por_id = p_user_id
    WHERE id = v_coupon_id;

    -- Conceder suscripción mensual gratis (1 mes de duración)
    INSERT INTO public.suscripciones (subscriber_id, creator_id, status, precio, current_period_end)
    VALUES (p_user_id, v_creador_id, 'active', 0, now() + interval '1 month')
    ON CONFLICT (subscriber_id, creator_id)
    DO UPDATE SET 
      status = 'active', 
      precio = 0, 
      current_period_end = now() + interval '1 month',
      stripe_subscription_id = NULL; -- Reiniciar Stripe ID ya que es promocional

    -- Registrar notificación al creador informando que alguien usó su código gratis
    INSERT INTO public.notificaciones (user_id, actor_id, tipo, mensaje)
    VALUES (
      v_creador_id,
      p_user_id,
      'suscripcion',
      '¡Felicitaciones! Un suscriptor ha activado tu membresía gratis por 1 mes usando tu código promocional ' || p_codigo || ' 🎫'
    );

    RETURN jsonb_build_object(
      'success', true, 
      'message', '¡Canje exitoso! Tu membresía gratuita con ' || coalesce(v_nombre_creador, 'el creador') || ' ha sido activada por 1 mes 🎉',
      'porcentaje', 100,
      'creador_id', v_creador_id
    );
  
  ELSE
    -- 3. Procesar Canje con Descuento Parcial (se marca como usado al finalizar el checkout Stripe en la app)
    -- Aquí simplemente confirmamos que es válido para que la app aplique visualmente el precio con descuento
    RETURN jsonb_build_object(
      'success', true,
      'message', '¡Código válido! Se aplicará un descuento del ' || v_porcentaje || '% en tu compra 🎫',
      'porcentaje', v_porcentaje,
      'creador_id', v_creador_id
    );
  END IF;
END;
$$;

-- 4. Función RPC complementaria para marcar como usado un código de descuento parcial una vez finalizada la compra
CREATE OR REPLACE FUNCTION public.mark_coupon_used(
  p_user_id UUID,
  p_codigo TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.codigos_descuento
  SET usado = true, usado_por_id = p_user_id
  WHERE upper(codigo) = upper(trim(p_codigo));
  
  RETURN true;
END;
$$;
