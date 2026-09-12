-- Agrega 'gerente' a la restricción CHECK de profiles.role.
--
-- La columna role tiene un CHECK (profiles_role_check) que lista los roles
-- permitidos. Cada rol nuevo lo amplió: supervisor (20260612) y asesor
-- (20260618). Sin este cambio, asignar 'gerente' —por SQL o por la Edge
-- Function cambiar-rol— falla con "violates check constraint profiles_role_check".

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'admin'::text,
    'prospectador'::text,
    'prospectador_plus'::text,
    'nuevo'::text,
    'supervisor'::text,
    'asesor'::text,
    'gerente'::text
  ]));
