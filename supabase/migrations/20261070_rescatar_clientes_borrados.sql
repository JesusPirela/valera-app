-- Rescate de los clientes que se borraron de verdad antes del arreglo.
--
-- Hasta la migración anterior, "eliminar_cliente" borraba la fila. En la
-- bitácora quedaron 297 clientes con su fila completa en datos_antes, y
-- ninguno había vuelto a la tabla. 45 son pruebas ("ZZ TEMPORAL", "PRUEBA
-- ... (borrar)"); los otros 252 son clientes de verdad, y 112 de ellos iban
-- en etapas avanzadas: cita agendada, seguimiento de cierre, apartado.
--
-- Vuelven a la base PERO a la papelera: con eliminado_at puesto en la fecha
-- en que se borraron y eliminado_por en quien los borró. Así nadie los ve de
-- pronto reaparecer en su CRM, y gerencia decide cuáles valen la pena.
--
-- Se comprobó antes de tocar nada:
--  · Las 41 columnas guardadas existen hoy, así que la fila se reconstruye
--    entera y no a trozos.
--  · De las llaves foráneas, solo responsable_id tenía problema: 21 apuntan
--    a cuentas que ya no existen. Esas se restauran SIN responsable, que es
--    lo cierto (su dueño ya no está), en vez de dejarlas fuera del rescate.

-- ─── Qué se restauró, para poder deshacerlo ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rescate_clientes_20261030 (
  cliente_id   UUID PRIMARY KEY,
  nombre       TEXT,
  estado       TEXT,
  borrado_el   TIMESTAMPTZ,
  sin_dueno    BOOLEAN,
  restaurado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Para deshacer el rescate por completo:
--   DELETE FROM public.clientes c
--    USING public.rescate_clientes_20261030 r
--    WHERE c.id = r.cliente_id;

WITH borrados AS (
  -- El DELETE más reciente de cada cliente; si se borró dos veces, manda el
  -- último estado conocido.
  SELECT DISTINCT ON (a.registro_id)
         a.registro_id, a.datos_antes, a.created_at AS borrado_el, a.user_id AS borrado_por
    FROM public.audit_log a
   WHERE a.tabla = 'clientes'
     AND a.accion = 'DELETE'
     AND a.datos_antes IS NOT NULL
   ORDER BY a.registro_id, a.created_at DESC
),
reales AS (
  SELECT b.*,
         -- Si el responsable ya no tiene cuenta, el cliente vuelve sin dueño.
         ((b.datos_antes->>'responsable_id') IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM auth.users u
                           WHERE u.id = (b.datos_antes->>'responsable_id')::uuid)) AS sin_dueno
    FROM borrados b
   WHERE lower(coalesce(b.datos_antes->>'nombre','')) !~ '(prueba|zz temporal|test|borrar)'
     AND NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = b.registro_id)
),
listas AS (
  SELECT r.registro_id, r.borrado_el, r.sin_dueno,
         r.datos_antes
           || jsonb_build_object('eliminado_at', to_jsonb(r.borrado_el))
           || jsonb_build_object('eliminado_por',
                CASE WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.borrado_por)
                     THEN to_jsonb(r.borrado_por) ELSE 'null'::jsonb END)
           || CASE WHEN r.sin_dueno THEN jsonb_build_object('responsable_id', 'null'::jsonb)
                   ELSE '{}'::jsonb END
         AS fila
    FROM reales r
),
insertados AS (
  INSERT INTO public.clientes
  SELECT (jsonb_populate_record(NULL::public.clientes, l.fila)).*
    FROM listas l
  ON CONFLICT (id) DO NOTHING
  RETURNING id, nombre, estado
)
INSERT INTO public.rescate_clientes_20261030 (cliente_id, nombre, estado, borrado_el, sin_dueno)
SELECT i.id, i.nombre, i.estado, l.borrado_el, l.sin_dueno
  FROM insertados i
  JOIN listas l ON l.registro_id = i.id
ON CONFLICT (cliente_id) DO NOTHING;
