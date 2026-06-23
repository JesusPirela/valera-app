-- Nuevo artículo en tienda: Pack de Iconos y Colores Premium
-- Desbloquea 12 colores adicionales y 16 avatares animados en el perfil.
-- El admin marca la compra como "entregado" y la app lo detecta automáticamente.

INSERT INTO public.store_items (nombre, descripcion, costo_coins, tipo, disponible, stock, icono, orden)
VALUES (
  'Pack Premium: Iconos y Colores',
  'Desbloquea 12 colores exclusivos y 16 avatares animados para personalizar tu perfil al máximo. ¡Destácate del equipo!',
  500,
  'pack_iconos',
  true,
  null,
  '🎨',
  5
)
ON CONFLICT DO NOTHING;
