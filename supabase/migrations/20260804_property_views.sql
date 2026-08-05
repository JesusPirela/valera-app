-- Algoritmo de propiedades personalizadas por prospectador.
--
-- Problema: muchas propiedades no son vistas ni publicadas porque el orden
-- del listado favorece siempre las mismas (las más recientes o aleatorias).
--
-- Solución: registrar cuántas veces cada usuario vio cada propiedad.
-- El listado ordena primero las nunca vistas, luego las menos vistas,
-- y cada prospectador tiene su propia experiencia independiente.

CREATE TABLE IF NOT EXISTS public.property_views (
  user_id        uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  propiedad_id   uuid         NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  view_count     integer      NOT NULL DEFAULT 1,
  last_viewed_at timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, propiedad_id)
);

CREATE INDEX IF NOT EXISTS ix_property_views_user
  ON public.property_views (user_id);

ALTER TABLE public.property_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_views_own ON public.property_views;
CREATE POLICY property_views_own ON public.property_views
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Registra o incrementa una vista de propiedad para el usuario actual.
-- ON CONFLICT incrementa el contador y actualiza el timestamp.
CREATE OR REPLACE FUNCTION public.registrar_vista_propiedad(p_propiedad_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.property_views (user_id, propiedad_id, view_count, last_viewed_at)
  VALUES (auth.uid(), p_propiedad_id, 1, now())
  ON CONFLICT (user_id, propiedad_id) DO UPDATE SET
    view_count     = property_views.view_count + 1,
    last_viewed_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.registrar_vista_propiedad(uuid) TO authenticated;
