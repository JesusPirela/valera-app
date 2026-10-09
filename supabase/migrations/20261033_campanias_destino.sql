-- Guarda a dónde manda cada campaña, para que "0 leads" deje de parecer una falla.
--
-- Caso real: CAMPAÑA BETO VALENCIA salía con 0 leads y el asesor reportaba que
-- sí le habían llegado unos 7 clientes. Ninguna de las dos cosas era falsa. Esa
-- campaña es de clic-a-WhatsApp: quien toca el anuncio abre una conversación
-- directa con el asesor y nunca llena un formulario, así que Facebook no tiene
-- ningún lead que entregarnos. Cero es la respuesta correcta.
--
-- El problema era que la app no lo decía. Con el destino guardado, la pantalla
-- puede explicar por qué esa campaña no trae leads en vez de aparentar estar rota.
--
-- Valores que manda Facebook en destination_type:
--   ON_AD     → formulario instantáneo. Es el único que produce leads descargables.
--   WHATSAPP  → abre WhatsApp con el anunciante.
--   MESSENGER → abre Messenger.
--   PHONE_CALL, WEBSITE, INSTAGRAM_DIRECT → llamada, sitio, DM de Instagram.
ALTER TABLE public.campanias ADD COLUMN IF NOT EXISTS destino text;

COMMENT ON COLUMN public.campanias.destino IS
  'destination_type de Meta. Solo ON_AD (formulario instantáneo) genera leads descargables.';
