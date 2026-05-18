-- =====================================================================
-- Sprint: Restricciones de Acceso Personalizables por Post
-- =====================================================================

-- 1. Agregar columna 'restriccion' a las tablas de contenido
ALTER TABLE public.fotos_perfil ADD COLUMN IF NOT EXISTS restriccion TEXT DEFAULT 'publico';
ALTER TABLE public.opiniones ADD COLUMN IF NOT EXISTS restriccion TEXT DEFAULT 'publico';
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS restriccion TEXT DEFAULT 'publico';

-- 2. Migrar de forma retrocompatible el contenido premium existente
-- Si ya tiene precio, el comportamiento original era 'premium_suscripcion' (desbloqueable por compra o suscripción)
UPDATE public.fotos_perfil SET restriccion = 'premium_suscripcion' WHERE precio > 0 AND (restriccion IS NULL OR restriccion = 'publico');
UPDATE public.opiniones SET restriccion = 'premium_suscripcion' WHERE precio > 0 AND (restriccion IS NULL OR restriccion = 'publico');
UPDATE public.videos SET restriccion = 'premium_suscripcion' WHERE precio > 0 AND (restriccion IS NULL OR restriccion = 'publico');
