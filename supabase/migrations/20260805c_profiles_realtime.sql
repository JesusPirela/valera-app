-- Habilitar Realtime en profiles para que, al inhabilitar una cuenta, el cliente
-- reciba el cambio de `activo` al instante y cierre la sesión de inmediato.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN OTHERS THEN NULL;   -- ya estaba en la publicación
END $$;

-- REPLICA IDENTITY FULL para que el payload/RLS de Realtime tenga todas las columnas.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
