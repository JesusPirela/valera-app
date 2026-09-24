-- Los contadores de user_stats se van desincronizando de la realidad.
--
-- Se llevan sumando y restando a mano desde muchos sitios (triggers de alta y
-- baja, despublicar, borrado suave de clientes, importaciones). Si cualquiera
-- de esos caminos se salta su resta, el número queda inflado para siempre y
-- nadie se entera hasta que alguien lo nota a ojo. Ya pasó dos veces: Angela
-- Francisca con total_propiedades = 920 contra 22 reales, porque despublicar
-- no revertía el premio; y Alexis Plus marcando 9 clientes contra 287 reales.
--
-- Al medirlo, de 104 usuarios estaban mal:
--     49  total_propiedades
--     57  total_clientes
--      3  total_cursos
--      6  total_ventas
--
-- Esta función los vuelve a calcular desde los datos de origen, que son la
-- verdad, y se programa cada noche para que no haga falta perseguirlos.
--
-- NO TOCA xp, valera_coins NI LAS RACHAS. El historial de xp_transactions no
-- cuadra con los saldos (Alexis Plus: 7,599 de saldo contra 70,112 en el
-- historial), así que recalcular el XP desde ahí rompería el ranking y le
-- cambiaría el nivel a la gente. Eso se arregla aparte y a mano; aquí solo van
-- los contadores que se pueden derivar con certeza.
--
-- Tampoco toca total_seguimientos ni total_interacciones: se alimentan de la
-- actividad registrada y no hay una fuente única de la que reconstruirlos.
--
-- Aplicada el 2026-09-23: corrigió 68 usuarios y dejó 0 desviados, con xp y
-- valera_coins intactos (comprobado contra el respaldo). Los valores previos
-- quedaron guardados en la tabla public.user_stats_respaldo_20260923 por si
-- hubiera que volver atrás:
--
--   UPDATE public.user_stats s
--      SET total_propiedades = b.total_propiedades, total_clientes = b.total_clientes,
--          total_cursos = b.total_cursos, total_ventas = b.total_ventas
--     FROM public.user_stats_respaldo_20260923 b WHERE b.id = s.id;
--   SELECT cron.unschedule('recalcular-contadores-user-stats');

CREATE OR REPLACE FUNCTION public.recalcular_contadores_user_stats()
RETURNS TABLE(usuarios_corregidos int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_n int;
BEGIN
  WITH real AS (
    SELECT s.id,
      COALESCE((SELECT SUM(pp.veces_publicada)::int FROM public.propiedad_publicacion pp
                 WHERE pp.user_id = s.id), 0) AS r_props,
      (SELECT COUNT(*)::int FROM public.clientes c
        WHERE c.responsable_id = s.id AND c.eliminado_at IS NULL) AS r_cli,
      (SELECT COUNT(*)::int FROM public.vu_certificados vc
        WHERE vc.user_id = s.id) AS r_cur,
      (SELECT COUNT(*)::int FROM public.clientes c
        WHERE c.responsable_id = s.id AND c.eliminado_at IS NULL AND c.estado = 'compro') AS r_ven
    FROM public.user_stats s
  ), corregidos AS (
    UPDATE public.user_stats s
       SET total_propiedades = r.r_props,
           total_clientes    = r.r_cli,
           total_cursos      = r.r_cur,
           total_ventas      = r.r_ven
      FROM real r
     WHERE r.id = s.id
       AND (s.total_propiedades IS DISTINCT FROM r.r_props
         OR s.total_clientes    IS DISTINCT FROM r.r_cli
         OR s.total_cursos      IS DISTINCT FROM r.r_cur
         OR s.total_ventas      IS DISTINCT FROM r.r_ven)
    RETURNING s.id
  )
  SELECT COUNT(*)::int INTO v_n FROM corregidos;

  RETURN QUERY SELECT v_n;
END $fn$;

-- Cada noche a las 2:00 de la mañana (hora de México).
SELECT cron.schedule(
  'recalcular-contadores-user-stats',
  '0 8 * * *',
  $cron$ SELECT public.recalcular_contadores_user_stats(); $cron$
);
