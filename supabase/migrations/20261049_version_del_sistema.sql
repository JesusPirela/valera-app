-- Qué versión de iOS o de Android trae cada teléfono.
--
-- Hace falta para decidir si AlarmKit es viable: esa API existe desde iOS 26 y
-- hoy no hay forma de saber cuántos de los 35 iPhone la tienen. Sin el dato,
-- cualquier plan que dependa de ella es adivinar.
--
-- Sirve igual del lado de Android: los candados de segundo plano cambiaron en
-- Android 12, 14 y 15, y saber la versión explica por qué a unos les llega el
-- aviso al instante y a otros no.
--
-- Se guarda tal cual lo reporta el sistema: "26.0" en iPhone, el número de API
-- en Android (36, 35...). Convertirlo aquí solo serviría para equivocarse.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS so_version text;

COMMENT ON COLUMN public.profiles.so_version IS
  'Version del sistema operativo del telefono: "26.0" en iOS, numero de API en Android. Lo escribe la app al abrir.';
