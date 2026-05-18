-- =====================================================================
-- Sprint: Suscripciones de Creadores y Renovación Automática con Stripe
-- =====================================================================

-- 1. Agregar columnas de suscripción y Stripe a public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS precio_suscripcion NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nombre_suscripcion TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS descripcion_suscripcion TEXT;

-- Columnas de integración con Stripe
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- 2. Crear la tabla de suscripciones activas
CREATE TABLE IF NOT EXISTS public.suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'incomplete', -- 'active', 'canceled', 'incomplete', 'past_due'
  precio NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  
  -- Un suscriptor solo puede tener una suscripción activa/inactiva por creador
  CONSTRAINT unique_subscriber_creator UNIQUE (subscriber_id, creator_id)
);

-- Habilitar RLS en public.suscripciones
ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;

-- 3. Crear Políticas de Seguridad RLS en la tabla 'suscripciones'

-- A) SELECT: Un usuario puede ver sus propias suscripciones (como suscriptor) o las que tiene recibidas (como creador)
DROP POLICY IF EXISTS "Permitir a usuarios ver sus suscripciones" ON public.suscripciones;
CREATE POLICY "Permitir a usuarios ver sus suscripciones"
ON public.suscripciones
FOR SELECT
TO authenticated
USING (
  subscriber_id = auth.uid() OR
  creator_id = auth.uid()
);

-- B) INSERT: El propio usuario puede iniciar una suscripción (o el rol service_role)
DROP POLICY IF EXISTS "Permitir a usuarios iniciar una suscripción" ON public.suscripciones;
CREATE POLICY "Permitir a usuarios iniciar una suscripción"
ON public.suscripciones
FOR INSERT
TO authenticated
WITH CHECK (
  subscriber_id = auth.uid()
);

-- C) UPDATE: Permitir al usuario o al sistema actualizar su propia suscripción
DROP POLICY IF EXISTS "Permitir actualizar suscripciones" ON public.suscripciones;
CREATE POLICY "Permitir actualizar suscripciones"
ON public.suscripciones
FOR UPDATE
TO authenticated
USING (
  subscriber_id = auth.uid() OR
  creator_id = auth.uid()
)
WITH CHECK (
  subscriber_id = auth.uid() OR
  creator_id = auth.uid()
);
