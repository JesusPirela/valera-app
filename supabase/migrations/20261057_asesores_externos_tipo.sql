-- Distinguir una alianza de un asesor independiente.
--
-- No son lo mismo y hoy viven revueltos en la misma lista: una alianza es un
-- acuerdo con otra inmobiliaria, y un independiente es alguien que nos apoya
-- por su cuenta. Al repartir una propiedad por zona importa saber cuál es
-- cuál, y hasta ahora había que acordarse.
--
-- Se deja NULO a propósito en los 24 que ya existen: marcarlos a todos como
-- una cosa u otra sería inventar un dato que nadie dio. La pantalla los
-- enseña como "Sin clasificar" y se van etiquetando al editarlos.
ALTER TABLE public.asesores_externos
  ADD COLUMN IF NOT EXISTS tipo text
  CHECK (tipo IS NULL OR tipo IN ('alianza', 'independiente'));

COMMENT ON COLUMN public.asesores_externos.tipo IS
  'alianza = acuerdo con otra inmobiliaria; independiente = asesor por su cuenta que nos apoya. Nulo = sin clasificar.';
