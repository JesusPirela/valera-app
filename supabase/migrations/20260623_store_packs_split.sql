-- Reemplazar el pack único por dos packs separados:
-- • pack_color   — desbloquea 1 color premium a elegir
-- • pack_avatar  — desbloquea 1 avatar premium animado a elegir

-- Eliminar el pack anterior si aún no fue comprado
DELETE FROM public.store_items WHERE tipo = 'pack_iconos';

-- Pack de color
INSERT INTO public.store_items (nombre, descripcion, costo_coins, tipo, disponible, stock, icono, orden)
VALUES (
  'Color Premium',
  'Desbloquea 1 color exclusivo para personalizar el tema de tu app. Elige el que más te guste entre 12 opciones.',
  500,
  'pack_color',
  true,
  null,
  '🎨',
  5
)
ON CONFLICT DO NOTHING;

-- Pack de avatar
INSERT INTO public.store_items (nombre, descripcion, costo_coins, tipo, disponible, stock, icono, orden)
VALUES (
  'Avatar Animado',
  'Desbloquea 1 avatar animado exclusivo para tu perfil. Elige entre 16 avatares premium con efectos especiales.',
  500,
  'pack_avatar',
  true,
  null,
  '✨',
  6
)
ON CONFLICT DO NOTHING;
