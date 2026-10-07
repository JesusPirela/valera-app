-- La forma de pago de la cita sale del CRM y se escribe igual en los dos lados.
--
-- Hoy es texto libre y está como estaban los estados: "infonavit" (110),
-- "Infonavit" (100), "Crédito Infonavit" (13), "Crédito infonavit" (6) son lo
-- mismo; "Recursos propios" (15), "Recurso propio" (12) y "recurso propio"
-- (10) también. Así no se puede ni filtrar ni contar.
--
-- La lista manda desde el CRM (clientes.tipo_credito): Infonavit, Fovisste,
-- Bancario, Contado, Otro. Es donde el dato nace, así que es donde debe
-- definirse.

CREATE TABLE IF NOT EXISTS public.citas_venta_pago_respaldo AS
  SELECT id, detalles_pago, now() AS respaldado_at FROM public.citas_venta;

-- ── De lo que esté escrito a la etiqueta del CRM ─────────────────────────────
CREATE OR REPLACE FUNCTION public.normaliza_forma_pago(p text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'extensions' AS $fn$
DECLARE n text := public.normaliza_nombre(p);
BEGIN
  IF n = '' THEN RETURN NULL; END IF;
  -- Cofinavit va ANTES que infonavit: lleva "infonavit" dentro y si no se
  -- comprobara primero, acabaría contado como Infonavit a secas.
  IF n LIKE '%cofinavit%'                          THEN RETURN 'Otro';       END IF;
  IF n LIKE '%infonavit%'                          THEN RETURN 'Infonavit';  END IF;
  IF n LIKE '%fovisste%' OR n LIKE '%fovissste%'   THEN RETURN 'Fovisste';   END IF;
  IF n LIKE '%bancario%' OR n LIKE '%banco%'
     OR n LIKE '%hipotecario%'                     THEN RETURN 'Bancario';   END IF;
  -- "Recursos propios", "recurso propio", "efectivo" y "contado" son lo mismo:
  -- paga sin crédito.
  IF n LIKE '%contado%' OR n LIKE '%recurso%'
     OR n LIKE '%efectivo%'                        THEN RETURN 'Contado';    END IF;
  RETURN 'Otro';
END $fn$;

GRANT EXECUTE ON FUNCTION public.normaliza_forma_pago(text) TO authenticated;

-- ── La forma de pago que el CRM tiene para esa cita ──────────────────────────
-- Se busca al cliente por tres caminos, del más fiable al menos:
--   1) la cita del dashboard, que sí guarda el cliente_id;
--   2) el teléfono (10 dígitos, ignorando cómo esté escrito);
--   3) el nombre normalizado.
CREATE OR REPLACE FUNCTION public.forma_pago_de_la_cita(p_cita_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_nombre text; v_tel text; v_cc uuid; v_tipo text;
BEGIN
  SELECT cliente_nombre, regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g'), cita_coordinacion_id
    INTO v_nombre, v_tel, v_cc
    FROM public.citas_venta WHERE id = p_cita_id;

  IF v_cc IS NOT NULL THEN
    SELECT c.tipo_credito INTO v_tipo
      FROM public.citas_coordinacion ct
      JOIN public.clientes c ON c.id = ct.cliente_id
     WHERE ct.id = v_cc;
    IF v_tipo IS NOT NULL THEN RETURN public.normaliza_forma_pago(v_tipo); END IF;
  END IF;

  IF length(v_tel) >= 10 THEN
    SELECT c.tipo_credito INTO v_tipo
      FROM public.clientes c
     WHERE c.eliminado_at IS NULL AND c.tipo_credito IS NOT NULL
       AND regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') = v_tel
     LIMIT 1;
    IF v_tipo IS NOT NULL THEN RETURN public.normaliza_forma_pago(v_tipo); END IF;
  END IF;

  SELECT c.tipo_credito INTO v_tipo
    FROM public.clientes c
   WHERE c.eliminado_at IS NULL AND c.tipo_credito IS NOT NULL
     AND public.normaliza_nombre(c.nombre) = public.normaliza_nombre(v_nombre)
     AND public.normaliza_nombre(v_nombre) <> ''
   LIMIT 1;

  RETURN public.normaliza_forma_pago(v_tipo);
END $fn$;

GRANT EXECUTE ON FUNCTION public.forma_pago_de_la_cita(uuid) TO authenticated;

-- ── Se llena sola al crear o cambiar el cliente de la cita ───────────────────
-- Solo si está VACÍA: si alguien la escribió a mano, manda esa. Lo automático
-- rellena huecos, no corrige a la persona.
CREATE OR REPLACE FUNCTION public.fn_citas_venta_forma_pago()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_tipo text;
BEGIN
  IF NEW.detalles_pago IS NOT NULL AND trim(NEW.detalles_pago) <> '' THEN
    -- Lo que venga escrito se guarda con la etiqueta del CRM, no tal cual.
    NEW.detalles_pago := public.normaliza_forma_pago(NEW.detalles_pago);
    RETURN NEW;
  END IF;

  SELECT c.tipo_credito INTO v_tipo
    FROM public.clientes c
   WHERE c.eliminado_at IS NULL AND c.tipo_credito IS NOT NULL
     AND ( (length(regexp_replace(coalesce(NEW.telefono, ''), '[^0-9]', '', 'g')) >= 10
            AND regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g')
              = regexp_replace(coalesce(NEW.telefono, ''), '[^0-9]', '', 'g'))
        OR (public.normaliza_nombre(NEW.cliente_nombre) <> ''
            AND public.normaliza_nombre(c.nombre) = public.normaliza_nombre(NEW.cliente_nombre)) )
   LIMIT 1;

  NEW.detalles_pago := public.normaliza_forma_pago(v_tipo);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS tr_citas_venta_forma_pago ON public.citas_venta;
CREATE TRIGGER tr_citas_venta_forma_pago
  BEFORE INSERT OR UPDATE OF cliente_nombre, telefono, detalles_pago ON public.citas_venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_citas_venta_forma_pago();

-- ── Limpiar lo escrito y rellenar lo vacío ───────────────────────────────────
UPDATE public.citas_venta
   SET detalles_pago = public.normaliza_forma_pago(detalles_pago)
 WHERE nullif(trim(detalles_pago), '') IS NOT NULL
   AND detalles_pago IS DISTINCT FROM public.normaliza_forma_pago(detalles_pago);

UPDATE public.citas_venta cv
   SET detalles_pago = public.forma_pago_de_la_cita(cv.id)
 WHERE nullif(trim(cv.detalles_pago), '') IS NULL
   AND public.forma_pago_de_la_cita(cv.id) IS NOT NULL;

SELECT coalesce(detalles_pago, '(sin forma de pago)') AS valor, COUNT(*) AS n
  FROM public.citas_venta GROUP BY 1 ORDER BY 2 DESC;
