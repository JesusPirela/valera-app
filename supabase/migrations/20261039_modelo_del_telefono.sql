-- Guarda qué teléfono usa cada persona.
--
-- Nace de un día entero depurando por qué no salía el cuadro de alarma en un
-- celular: resultó ser un Xiaomi, que trae candados propios encima de Android y
-- apaga de fábrica permisos que el sistema sí concede. No había forma de
-- saberlo desde aquí, y se perdió medio día en hipótesis.
--
-- Con esto, cuando tres personas reporten lo mismo se puede ver de inmediato si
-- tienen algo en común. Xiaomi, Huawei, Oppo y vivo dan guerra; Samsung,
-- Motorola y Google normalmente no.
--
-- El dato ya lo expone React Native (Platform.constants.Brand / .Model); solo
-- faltaba conservarlo. No se instala nada.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefono_marca  text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefono_modelo text;

COMMENT ON COLUMN public.profiles.telefono_marca IS
  'Fabricante del aparato (Platform.constants.Manufacturer). Solo Android; en iOS queda nulo.';
COMMENT ON COLUMN public.profiles.telefono_modelo IS
  'Modelo del aparato (Platform.constants.Model).';
