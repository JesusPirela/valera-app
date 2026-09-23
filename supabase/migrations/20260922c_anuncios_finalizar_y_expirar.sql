-- Finalizar un anuncio a mano + que caduque solo al día siguiente del evento.
--
-- Antes un anuncio de prioridad alta/crítica seguía saliéndole a la gente
-- hasta que cada quien lo marcaba como visto: no había forma de apagarlo, y
-- una reunión ya pasada seguía apareciendo.
--
-- 1) anuncios.expira_at: a partir de esa hora deja de mostrarse. La app la
--    calcula como la medianoche SIGUIENTE al evento, así sigue visible todo
--    el día del evento.
-- 2) finalizar_anuncio / reactivar_anuncio: apagan o reencienden el anuncio
--    sin borrarlo (se conservan historial y confirmaciones).
-- 3) get_mi_anuncio_pendiente ahora filtra los expirados.
-- 4) crear_anuncio recibe p_expira_at. Se hace DROP + CREATE (no REPLACE)
--    porque cambiar la firma con REPLACE dejaría DOS sobrecargas y PostgREST
--    respondería 300 "Could not choose the best candidate function" — es el
--    mismo error que rompió el período de Estadísticas.
--
-- Aplicada a producción el 2026-09-22 y verificada.

ALTER TABLE public.anuncios ADD COLUMN IF NOT EXISTS expira_at timestamptz;

CREATE OR REPLACE FUNCTION public.finalizar_anuncio(p_anuncio_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo admin'; END IF;
  UPDATE public.anuncios SET activo = false WHERE id = p_anuncio_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.reactivar_anuncio(p_anuncio_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo admin'; END IF;
  UPDATE public.anuncios SET activo = true WHERE id = p_anuncio_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_mi_anuncio_pendiente()
RETURNS TABLE(id uuid, titulo text, cuerpo text, prioridad text, es_reunion boolean,
              evento_cuando text, pide_confirmacion boolean, confirmacion text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $fn$
  select a.id, a.titulo, a.cuerpo, a.prioridad, a.es_reunion,
         a.evento_cuando, a.pide_confirmacion, d.confirmacion, a.created_at
  from public.anuncio_destinatarios d
  join public.anuncios a on a.id = d.anuncio_id
  where d.user_id = auth.uid()
    and a.activo
    and (a.expira_at is null or now() < a.expira_at)
    and (
      (a.prioridad = 'critica' and (d.visto = false or (a.pide_confirmacion and d.confirmacion is null)))
      or (a.prioridad = 'alta' and d.visto = false)
    )
  order by case a.prioridad when 'critica' then 0 when 'alta' then 1 else 2 end,
           a.created_at desc
  limit 1;
$fn$;

DROP FUNCTION IF EXISTS public.crear_anuncio(text,text,text,boolean,text,boolean,text[],uuid[],boolean);

CREATE FUNCTION public.crear_anuncio(
  p_titulo text, p_cuerpo text, p_prioridad text DEFAULT 'normal',
  p_es_reunion boolean DEFAULT false, p_evento_cuando text DEFAULT NULL,
  p_pide_confirmacion boolean DEFAULT false, p_roles text[] DEFAULT '{}',
  p_user_ids uuid[] DEFAULT '{}', p_todos boolean DEFAULT false,
  p_expira_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_id uuid; v_msg text; v_n int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede publicar anuncios';
  END IF;
  IF coalesce(btrim(p_titulo),'') = '' OR coalesce(btrim(p_cuerpo),'') = '' THEN
    RAISE EXCEPTION 'El anuncio necesita título y contenido';
  END IF;

  INSERT INTO public.anuncios(titulo, cuerpo, prioridad, es_reunion, evento_cuando,
                              pide_confirmacion, audiencia, creado_por, expira_at)
  VALUES (btrim(p_titulo), btrim(p_cuerpo), coalesce(p_prioridad,'normal'),
          coalesce(p_es_reunion,false), nullif(btrim(coalesce(p_evento_cuando,'')),''),
          coalesce(p_pide_confirmacion,false),
          jsonb_build_object('todos', coalesce(p_todos,false),
                             'roles', to_jsonb(p_roles),
                             'user_ids', to_jsonb(p_user_ids)),
          auth.uid(), p_expira_at)
  RETURNING id INTO v_id;

  v_msg := CASE WHEN coalesce(p_es_reunion,false) AND nullif(btrim(coalesce(p_evento_cuando,'')),'') IS NOT NULL
                THEN '📅 ' || btrim(p_evento_cuando) || ' — ' || btrim(p_cuerpo)
                ELSE btrim(p_cuerpo) END;

  WITH base AS (
    SELECT pr.id FROM public.profiles pr
    WHERE coalesce(pr.activo, true) = true AND pr.id <> auth.uid()
      AND ( coalesce(p_todos,false)
        OR (array_length(p_roles,1) IS NOT NULL AND pr.role = ANY(p_roles))
        OR (array_length(p_user_ids,1) IS NOT NULL AND pr.id = ANY(p_user_ids)) )
  ),
  ins_dest AS (
    INSERT INTO public.anuncio_destinatarios(anuncio_id, user_id)
    SELECT v_id, id FROM base ON CONFLICT (anuncio_id, user_id) DO NOTHING RETURNING 1
  ),
  ins_notif AS (
    INSERT INTO public.notificaciones(user_id, titulo, mensaje, tipo)
    SELECT id, btrim(p_titulo), left(v_msg, 500), 'anuncio' FROM base RETURNING 1
  )
  SELECT count(*) INTO v_n FROM ins_dest;

  RETURN jsonb_build_object('anuncio_id', v_id, 'destinatarios', v_n);
END $fn$;
