-- Directorio de asesores para el chatbot de WhatsApp.
-- Make usa este directorio para construir la tarjeta de contacto dinámica
-- que se envía al cliente cuando el bot lo conecta con su asesor asignado.

CREATE TABLE IF NOT EXISTS public.prospectadores (
  email    TEXT PRIMARY KEY,
  nombre   TEXT NOT NULL,
  whatsapp TEXT NOT NULL  -- formato 521XXXXXXXXXX, listo para https://wa.me/{whatsapp}
);

-- Seed: primer asesor
INSERT INTO public.prospectadores (email, nombre, whatsapp)
VALUES ('lopezvalenciaruben@gmail.com', 'Ruben Lopez', '5214428157256')
ON CONFLICT (email) DO NOTHING;

-- Para agregar un nuevo asesor:
-- INSERT INTO public.prospectadores (email, nombre, whatsapp)
-- VALUES ('correo@ejemplo.com', 'Nombre Apellido', '521XXXXXXXXXX')
-- ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre, whatsapp = EXCLUDED.whatsapp;

SELECT pg_notify('pgrst', 'reload schema');
