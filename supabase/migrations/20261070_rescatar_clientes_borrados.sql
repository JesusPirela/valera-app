-- Rescate de los clientes que se borraron de verdad antes del arreglo.
--
-- Hasta la migración 20261069, "eliminar_cliente" borraba la fila. En la
-- bitácora quedaron 297 clientes con su fila completa en datos_antes, y
-- ninguno había vuelto a la tabla. De esos:
--
--   45   son pruebas ("ZZ TEMPORAL", "PRUEBA … (borrar)")  → fuera
--   88   tienen un teléfono que YA está en un cliente activo, o sea que
--        alguien los volvió a dar de alta después            → fuera
--   164  no están en ningún lado                             → ESTOS vuelven
--
-- De los 164: 29 iban en cita agendada, 12 en cita por agendar, 6 en cita a
-- futuro y 3 en seguimiento de cierre. Esos son los que duelen.
--
-- Vuelven a la base PERO a la papelera: con eliminado_at en la fecha en que
-- se borraron y eliminado_por en quien los borró. Así nadie los ve reaparecer
-- en su CRM, y gerencia decide cuáles restaura.
--
-- Comprobado antes de tocar nada:
--  · Las 41 columnas guardadas existen hoy, así que la fila se reconstruye
--    entera y no a trozos.
--  · De las llaves foráneas, solo responsable_id tenía problema: 21 apuntan a
--    cuentas que ya no existen. Esas se restauran SIN responsable, que es lo
--    cierto, en vez de dejarlas fuera del rescate.

-- ─── Qué se restauró, para poder deshacerlo ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rescate_clientes_20261030 (
  cliente_id    UUID PRIMARY KEY,
  nombre        TEXT,
  estado        TEXT,
  borrado_el    TIMESTAMPTZ,
  sin_dueno     BOOLEAN,
  restaurado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Para deshacer el rescate por completo:
--   DELETE FROM public.clientes c
--    USING public.rescate_clientes_20261030 r
--    WHERE c.id = r.cliente_id;

-- El INSERT se arma solo con las columnas REALES de la tabla. Hace falta
-- hacerlo así porque clientes tiene columnas generadas (nombre_busqueda), y
-- Postgres no deja insertarles un valor; jsonb_populate_record las devuelve
-- todas, incluidas esas, y el insert directo falla.
DO $rescate$
DECLARE
  v_cols TEXT;
  v_sql  TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'clientes'
     AND is_generated = 'NEVER';

  v_sql := format($f$
    WITH borrados AS (
      -- El DELETE más reciente de cada cliente; si se borró dos veces, manda
      -- el último estado conocido.
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
             ((b.datos_antes->>'responsable_id') IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM auth.users u
                               WHERE u.id = (b.datos_antes->>'responsable_id')::uuid)) AS sin_dueno
        FROM borrados b
       WHERE lower(coalesce(b.datos_antes->>'nombre','')) !~ '(prueba|zz temporal|test|borrar)'
         AND NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = b.registro_id)
         -- Los que ya volvieron por su cuenta se quedan fuera: traerlos sería
         -- meter una copia vieja al lado de la buena.
         AND NOT EXISTS (
           SELECT 1 FROM public.clientes c
            WHERE c.eliminado_at IS NULL
              AND regexp_replace(coalesce(c.telefono,''), '\D', '', 'g') <> ''
              AND regexp_replace(coalesce(c.telefono,''), '\D', '', 'g')
                = regexp_replace(coalesce(b.datos_antes->>'telefono',''), '\D', '', 'g')
         )
    ),
    listas AS (
      SELECT r.registro_id, r.borrado_el, r.sin_dueno,
             -- Cinco columnas obligatorias de hoy no existían cuando se
             -- borraron estas filas (188 vienen sin ellas): se rellenan con
             -- el mismo valor por omisión que tiene la tabla. jsonb_strip_nulls
             -- quita las claves que vienen en nulo, para que el valor por
             -- omisión gane en vez de que un nulo rompa el NOT NULL.
             jsonb_build_object(
               'wa_count', 0,
               'call_count', 0,
               'enviado_crm', false,
               'cierre_completado', false,
               -- Esta NO se pone en falso a ciegas: se deduce del origen del
               -- lead, que sí viene guardado. Si no, 61 leads de campaña de
               -- Facebook volverían marcados como si no lo fueran y saldrían
               -- mal en los reportes de campañas.
               'es_lead_campania',
               lower(coalesce(r.datos_antes->>'fuente_lead','')) ~ '(campan|campa|_ads|meta|grupo_fb|marketplace)'
             )
               || jsonb_strip_nulls(r.datos_antes)
               || jsonb_build_object('eliminado_at', to_jsonb(r.borrado_el))
               || jsonb_build_object('eliminado_por',
                    CASE WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.borrado_por)
                         THEN to_jsonb(r.borrado_por) ELSE 'null'::jsonb END)
               -- 19 de los 164 tenían de responsable a alguien cuya cuenta ya
               -- no existe, y responsable_id NO admite nulo. Se aparcan bajo
               -- la cuenta de Andrés Valera (admin), que es donde se van a
               -- revisar de todas formas: estos clientes entran a la papelera,
               -- que solo ve el mando. Quedan marcados con sin_dueno en la
               -- tabla de rescate, para saber cuáles hay que reasignar al
               -- restaurarlos.
               || CASE WHEN r.sin_dueno
                       THEN jsonb_build_object('responsable_id',
                              to_jsonb('9bfe9db6-a274-42b6-a2cd-9bd3237b88cf'::uuid))
                       ELSE '{}'::jsonb END
             AS fila
        FROM reales r
    ),
    insertados AS (
      INSERT INTO public.clientes (%1$s)
      SELECT %1$s FROM (
        SELECT (jsonb_populate_record(NULL::public.clientes, l.fila)).*
          FROM listas l
      ) x
      ON CONFLICT (id) DO NOTHING
      RETURNING id, nombre, estado
    )
    INSERT INTO public.rescate_clientes_20261030 (cliente_id, nombre, estado, borrado_el, sin_dueno)
    SELECT i.id, i.nombre, i.estado, l.borrado_el, l.sin_dueno
      FROM insertados i
      JOIN listas l ON l.registro_id = i.id
    ON CONFLICT (cliente_id) DO NOTHING
  $f$, v_cols);

  EXECUTE v_sql;
END
$rescate$;
