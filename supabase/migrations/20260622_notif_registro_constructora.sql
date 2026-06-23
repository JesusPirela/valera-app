-- =========================================================
-- Notificación dirigida + columna de acción + push real
-- =========================================================
-- El registro de un cliente con constructora ya no abre WhatsApp en el
-- celular del prospectador (eso lo enviaría desde SU número) — en vez de
-- eso, se le avisa al admin que subió esa propiedad (created_by), con el
-- mensaje y el link de WhatsApp ya armados, para que LO ENVÍE ÉL desde su
-- propio número.

-- Columna genérica para que una notificación pueda traer una acción/URL
-- asociada (ej. abrir un link de WhatsApp en vez de navegar a una pantalla).
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS accion_url TEXT;

-- Ampliar el CHECK de tipo para incluir el nuevo tipo.
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda','ruleta','cofre','lead_caliente','apartado',
    'registro_constructora'
  ]));

-- RPC genérica para notificar a UN usuario específico (no a todos los
-- admins, como notificar_admins_nuevo_cliente) — reusable para cualquier
-- caso futuro donde se necesite avisarle a una persona puntual.
CREATE OR REPLACE FUNCTION public.notificar_usuario(
  p_user_id      UUID,
  p_titulo       TEXT,
  p_mensaje      TEXT,
  p_tipo         TEXT DEFAULT 'recordatorio',
  p_propiedad_id UUID DEFAULT NULL,
  p_cliente_id   UUID DEFAULT NULL,
  p_accion_url   TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, propiedad_id, cliente_id, accion_url)
  VALUES (p_user_id, p_titulo, p_mensaje, p_tipo, p_propiedad_id, p_cliente_id, p_accion_url);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT pg_notify('pgrst', 'reload schema');
