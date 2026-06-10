-- =========================================================
-- Permitir el rol 'supervisor' en profiles.role
-- =========================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'prospectador'::text, 'prospectador_plus'::text, 'nuevo'::text, 'supervisor'::text]));

SELECT pg_notify('pgrst', 'reload schema');
