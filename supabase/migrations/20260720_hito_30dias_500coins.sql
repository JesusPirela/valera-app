-- Actualiza el premio del hito de 30 días seguidos de racha:
-- antes: 200 coins + 1 protector → ahora: 500 coins + 1 protector

CREATE OR REPLACE FUNCTION public.premio_hito_racha(p_dias integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_dias
    WHEN 7   THEN jsonb_build_object('coins',   50, 'protectores', 0)
    WHEN 15  THEN jsonb_build_object('coins',  100, 'protectores', 0)
    WHEN 30  THEN jsonb_build_object('coins',  500, 'protectores', 1)
    WHEN 45  THEN jsonb_build_object('coins',  300, 'protectores', 0)
    WHEN 60  THEN jsonb_build_object('coins',  500, 'protectores', 1)
    WHEN 100 THEN jsonb_build_object('coins', 1000, 'protectores', 2)
    WHEN 180 THEN jsonb_build_object('coins', 2000, 'protectores', 2)
    WHEN 365 THEN jsonb_build_object('coins', 5000, 'protectores', 3)
    ELSE NULL
  END
$$;

NOTIFY pgrst, 'reload schema';
