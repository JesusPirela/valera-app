-- Arreglo de un destrozo propio.
--
-- Al revertir los teléfonos a la descripción (20261012) quité la nota que yo
-- había agregado, pero la expresión solo borraba HASTA EL FIN DE LA PRIMERA
-- LÍNEA. Las propiedades cuyo teléfono eran varios números en líneas
-- separadas se quedaron con los números de la 2ª línea en adelante colgando
-- en inv_notas, duplicando lo que ya está en la descripción.
--
-- No respaldé inv_notas — ese fue el hueco. Pero el trigger de auditoría
-- (tr_audit_propiedades) sí guarda datos_antes en cada UPDATE, así que el
-- valor original es recuperable. Se restaura TAL CUAL era antes del primer
-- cambio de hoy, en vez de intentar adivinar qué línea sobra.
--
-- Comprobado en la auditoría: de las 11 afectadas, 9 tenían inv_notas en NULL
-- y 2 tenían una nota de texto SIN teléfono ("Es dueño", "Si dejan
-- publicarla…"). O sea que ningún teléfono vivía en inv_notas antes de mí.

WITH primer_cambio AS (
  -- El datos_antes del UPDATE más viejo de hoy = cómo estaba antes de que yo
  -- tocara nada.
  SELECT DISTINCT ON (a.registro_id)
         a.registro_id,
         a.datos_antes->>'inv_notas' AS notas_originales
    FROM public.audit_log a
   WHERE a.tabla = 'propiedades'
     AND a.accion = 'UPDATE'
     AND (a.created_at AT TIME ZONE 'America/Mexico_City')::date
         = (now() AT TIME ZONE 'America/Mexico_City')::date
   ORDER BY a.registro_id, a.created_at ASC
)
UPDATE public.propiedades p
   SET inv_notas = pc.notas_originales
  FROM primer_cambio pc
 WHERE pc.registro_id = p.id
   AND p.inventario_seccion IS NOT NULL
   -- Solo las que quedaron con un teléfono colgando en las notas.
   AND p.inv_notas IS NOT NULL
   AND p.inv_notas ~ '[0-9]{7}'
   AND COALESCE(p.inv_notas, '') <> COALESCE(pc.notas_originales, '');

-- ── Comprobación ─────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.propiedades
    WHERE inventario_seccion IS NOT NULL
      AND inv_notas IS NOT NULL AND inv_notas ~ '[0-9]{7}')      AS notas_con_telefono_colgando,
  (SELECT COUNT(*) FROM public.propiedades
    WHERE inventario_seccion IS NOT NULL
      AND inv_notas LIKE '%estaba en la descripción%')            AS notas_mias_que_quedan,
  (SELECT COUNT(*) FROM public.propiedades
    WHERE inventario_seccion IS NOT NULL
      AND descripcion IS NOT NULL AND descripcion ~ '[0-9]{3}')   AS inventario_con_su_telefono,
  (SELECT COUNT(*) FROM public.propiedades
    WHERE inventario_seccion IS NOT NULL AND inv_notas IS NOT NULL) AS inventario_con_notas;
