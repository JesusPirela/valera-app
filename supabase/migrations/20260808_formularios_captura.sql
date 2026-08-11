-- Formularios de captura de leads en links/colecciones compartidas.
-- Un asesor genera un link con formulario (elige qué campos del CRM pedir); el
-- cliente que lo abre se registra y entra como cliente en el CRM del asesor.

CREATE TABLE IF NOT EXISTS public.formularios_captura (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- token del link
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo       text NOT NULL,                -- 'ficha' | 'coleccion'
  ref        text NOT NULL,                -- código (ficha) o token (colección)
  titulo     text,                         -- para mostrar en la página pública
  campos     text[] NOT NULL DEFAULT '{}', -- campos OPCIONALES del CRM a pedir
  activo     boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (owner_id, tipo, ref)
);
ALTER TABLE public.formularios_captura ENABLE ROW LEVEL SECURITY;

-- El dueño gestiona los suyos.
DROP POLICY IF EXISTS fc_owner ON public.formularios_captura;
CREATE POLICY fc_owner ON public.formularios_captura FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Lectura pública (anon) para renderizar el formulario, solo si está activo.
DROP POLICY IF EXISTS fc_public_read ON public.formularios_captura;
CREATE POLICY fc_public_read ON public.formularios_captura FOR SELECT
  USING (activo = true);
