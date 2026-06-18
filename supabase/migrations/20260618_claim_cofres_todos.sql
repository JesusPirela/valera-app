-- ══════════════════════════════════════════════════════════════
-- Reclamar TODOS los cofres por nivel a los que el usuario tiene derecho
-- según su nivel actual (no solo el nivel exacto). Idempotente: la tabla
-- cofres_nivel_historia tiene UNIQUE(user_id, nivel), así que los ya
-- reclamados se saltan. Resuelve a quienes subieron antes del cambio o
-- por error no recibieron sus cofres.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_cofres_nivel_todos()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_xp     integer;
  v_nivel  integer;
  v_max    integer;
  v_cofres integer;
  v_total  integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;

  SELECT xp INTO v_xp FROM public.user_stats WHERE id = auth.uid();
  -- Nivel actual desde XP (misma fórmula que la app)
  v_max := CASE
    WHEN COALESCE(v_xp, 0) <= 0 THEN 1
    ELSE 1 + floor((-485 + sqrt(235225 + 60 * v_xp)) / 30)::int
  END;

  FOR v_nivel IN 1..GREATEST(v_max, 1) LOOP
    v_cofres := CASE
      WHEN v_nivel = 1                          THEN 2
      WHEN v_nivel = 5                          THEN 1
      WHEN v_nivel >= 10 AND v_nivel % 10 = 0   THEN 2
      ELSE 0
    END;
    IF v_cofres > 0 THEN
      BEGIN
        INSERT INTO public.cofres_nivel_historia(user_id, nivel, cofres_otorgados)
        VALUES (auth.uid(), v_nivel, v_cofres);
        INSERT INTO public.user_stats(id, cofres_pendientes)
        VALUES (auth.uid(), v_cofres)
        ON CONFLICT (id) DO UPDATE
          SET cofres_pendientes = user_stats.cofres_pendientes + EXCLUDED.cofres_pendientes;
        v_total := v_total + v_cofres;
      EXCEPTION WHEN unique_violation THEN
        -- ese nivel ya estaba reclamado; continuar
      END;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_cofres_nivel_todos() TO authenticated;
