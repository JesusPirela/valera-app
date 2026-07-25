-- Capa de figuras del usuario, INDEPENDIENTE del color de fondo.
-- color_acento = fondo (color o patrón de tienda); figura_acento = figura que
-- cae encima (casa/llave/edificio/estrella/diamante/corona), o NULL = ninguna.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS figura_acento text;
