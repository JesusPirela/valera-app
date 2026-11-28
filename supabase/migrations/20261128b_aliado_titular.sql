-- CUENTAS DE INMOBILIARIA ALIADA · Diferenciar al titular del agente.
--
-- Hasta aquí aliado_admin y aliado_agente podían exactamente lo mismo: la
-- diferencia estaba pensada pero no construida. Se decidieron DOS privilegios
-- extra para el titular, y nada más por ahora:
--
--   1. Puede editar el logo y el sitio web de SU propia agencia (el resto de
--      los datos — nombre, teléfono, correo, exclusiva — siguen siendo solo
--      de un admin nuestro).
--   2. Puede invitar a su propia gente: crear cuentas aliado_agente de SU
--      misma inmobiliaria, hasta un tope (columna `limite_usuarios`, 3 de
--      fábrica) sin tener que pedírnoslo a nosotros.

-- -- 1. Cuántas cuentas le caben a cada inmobiliaria aliada ----------------------
ALTER TABLE public.inmobiliarias
  ADD COLUMN IF NOT EXISTS limite_usuarios int NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.inmobiliarias.limite_usuarios IS
  'Cuántas cuentas (titular + agentes) puede tener esta inmobiliaria aliada. Lo decide un admin.';

-- Columna nueva: se agrega al mismo grant de lectura column-level de
-- 20261127_aliados_3 (GRANT es aditivo, no hace falta repetir las demás).
GRANT SELECT (limite_usuarios) ON public.inmobiliarias TO authenticated;

-- -- 2. El titular puede tocar SU fila, pero no cualquier columna ---------------
-- RLS decide QUÉ FILA (la suya); un trigger decide QUÉ COLUMNAS, porque RLS
-- no puede limitar columnas (igual que se documentó en 20261127_aliados_2).
DROP POLICY IF EXISTS inmobiliarias_aliado_admin_write ON public.inmobiliarias;
CREATE POLICY inmobiliarias_aliado_admin_write ON public.inmobiliarias
  FOR UPDATE TO authenticated
  USING (public.es_aliado_admin() AND id = public.mi_inmobiliaria())
  WITH CHECK (public.es_aliado_admin() AND id = public.mi_inmobiliaria());

CREATE OR REPLACE FUNCTION public.fn_inmobiliarias_proteger_columnas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  -- Quien no es admin (o sea, el titular aliado editando la suya) solo puede
  -- cambiar logo_url y sitio_web. Cualquier otro cambio se rechaza entero: es
  -- preferible que truene a que se cuele un dato que no le toca tocar.
  IF NEW.nombre             IS DISTINCT FROM OLD.nombre
     OR NEW.telefono        IS DISTINCT FROM OLD.telefono
     OR NEW.email           IS DISTINCT FROM OLD.email
     OR NEW.asesor_referencia IS DISTINCT FROM OLD.asesor_referencia
     OR NEW.exclusiva       IS DISTINCT FROM OLD.exclusiva
     OR NEW.es_aliada       IS DISTINCT FROM OLD.es_aliada
     OR NEW.limite_usuarios IS DISTINCT FROM OLD.limite_usuarios
  THEN
    RAISE EXCEPTION 'Solo un administrador de Valera puede cambiar esos datos';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_inmobiliarias_proteger_columnas ON public.inmobiliarias;
CREATE TRIGGER tr_inmobiliarias_proteger_columnas
  BEFORE UPDATE ON public.inmobiliarias
  FOR EACH ROW EXECUTE FUNCTION public.fn_inmobiliarias_proteger_columnas();

-- -- 3. Su equipo: quién más ya tiene cuenta en SU inmobiliaria ------------------
-- Los perfiles de la misma organización ya se podían leer completos desde
-- 20261127_aliados_1 (perfiles_misma_organizacion); esto solo entrega,
-- además, cuántos caben en total, para que la pantalla sepa si ya se llenó.
CREATE OR REPLACE FUNCTION public.mi_equipo_aliado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inmob uuid := public.mi_inmobiliaria();
  v_limite int;
BEGIN
  IF v_inmob IS NULL THEN RAISE EXCEPTION 'No perteneces a ninguna inmobiliaria aliada'; END IF;
  SELECT limite_usuarios INTO v_limite FROM public.inmobiliarias WHERE id = v_inmob;
  RETURN jsonb_build_object(
    'limite', v_limite,
    'equipo', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.role, t.nombre)
      FROM (
        SELECT id, nombre, role, created_at
        FROM public.profiles
        WHERE inmobiliaria_id = v_inmob
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mi_equipo_aliado() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mi_equipo_aliado() TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- REVERTIR
--   drop function public.mi_equipo_aliado();
--   drop trigger tr_inmobiliarias_proteger_columnas on public.inmobiliarias;
--   drop function public.fn_inmobiliarias_proteger_columnas();
--   drop policy inmobiliarias_aliado_admin_write on public.inmobiliarias;
--   alter table public.inmobiliarias drop column limite_usuarios;
