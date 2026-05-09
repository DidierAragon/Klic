-- Marca permanente tras primera compra verificada con Stripe (webhook).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tarjeta_verificada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.tarjeta_verificada IS
  'true cuando la primera compra completada pasó verificación de tarjeta en Stripe y el usuario es mayor de edad en perfil.';
