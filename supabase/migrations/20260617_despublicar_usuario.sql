-- ══════════════════════════════════════════════════════════════
-- Despublicar publicaciones de un usuario (panel admin → Usuarios).
--   • get_publicaciones_usuario  → lista las propiedades que el usuario
--     tiene publicadas (admin/supervisor).
--   • admin_despublicar_propiedad → quita UNA publicación de ese usuario.
--   • admin_despublicar_todas     → quita TODAS las publicaciones del usuario.
-- "Despublicar" borra la fila de propiedad_publicacion y las entradas de
-- publicacion_log de ese par usuario+propiedad (el trigger tr_publicacion_log
-- no dispara en DELETE, así que no hay efectos colaterales).
-- ══════════════════════════════════════════════════════════════

-- ── Lista de publicaciones del usuario ────────────────────────
CREATE OR REPLACE FUNCTION public.get_publicaciones_usuario(p_user_id uuid)
RETURNS TABLE (
  propiedad_id uuid,
  codigo       text,
  titulo       text,
  veces        integer,
  fecha        timestamptz,
  imagen       text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    pp.propiedad_id,
    pr.codigo::text,
    pr.titulo::text,
    COALESCE(pp.veces_publicada, 0)::int,
    pp.fecha_publicacion,
    (SELECT pi.url FROM public.propiedad_imagenes pi
       WHERE pi.propiedad_id = pp.propiedad_id
       ORDER BY pi.orden ASC LIMIT 1)::text
  FROM public.propiedad_publicacion pp
  JOIN public.propiedades pr ON pr.id = pp.propiedad_id
  WHERE pp.user_id = p_user_id
    AND (pp.publicada = true OR COALESCE(pp.veces_publicada, 0) > 0)
  ORDER BY pp.fecha_publicacion DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_publicaciones_usuario(uuid) TO authenticated;

-- ── Despublicar una propiedad de un usuario ───────────────────
CREATE OR REPLACE FUNCTION public.admin_despublicar_propiedad(
  p_user_id     uuid,
  p_propiedad_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.publicacion_log
    WHERE user_id = p_user_id AND propiedad_id = p_propiedad_id;

  DELETE FROM public.propiedad_publicacion
    WHERE user_id = p_user_id AND propiedad_id = p_propiedad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_despublicar_propiedad(uuid, uuid) TO authenticated;

-- ── Despublicar todas las publicaciones de un usuario ─────────
CREATE OR REPLACE FUNCTION public.admin_despublicar_todas(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.propiedad_publicacion
  WHERE user_id = p_user_id AND (publicada = true OR COALESCE(veces_publicada, 0) > 0);

  DELETE FROM public.publicacion_log WHERE user_id = p_user_id;
  DELETE FROM public.propiedad_publicacion WHERE user_id = p_user_id;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_despublicar_todas(uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
