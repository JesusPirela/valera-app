-- ═══════════════════════════════════════════════════════════════════════════
-- Auditoría de seguridad 06/jul/2026 — cierres de RLS
--
-- PENDIENTE DE APLICAR EN PRODUCCIÓN (Management API o SQL editor).
-- Verificado contra el código del cliente: ninguno de estos cambios rompe
-- funcionalidad (la ficha pública NO lee profiles; las inserciones legítimas
-- de notificaciones son de usuarios autenticados; vu_puntos solo lo escribe
-- la RPC completar_leccion, que es SECURITY DEFINER e ignora RLS).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) profiles: la política `profiles_select_own` (pese al nombre) daba lectura
--    TOTAL a `public` (incluye anon). Cualquiera con la anon key —que viaja en
--    el bundle web— podía descargar nombres, TELÉFONOS, PUSH TOKENS y notas
--    internas (notas_bloque) de todo el equipo. Se elimina; la lectura para
--    usuarios autenticados se conserva vía `perfiles_lectura_publica`.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

-- 2) notificaciones: `notif_insert_service` permitía INSERT a `public` (anon):
--    cualquiera podía inyectar notificaciones falsas/phishing a cualquier
--    usuario. El backend usa service_role (ignora RLS); los inserts del cliente
--    son siempre de usuarios autenticados.
DROP POLICY IF EXISTS notif_insert_service ON public.notificaciones;
CREATE POLICY notif_insert_auth ON public.notificaciones
  FOR INSERT TO authenticated WITH CHECK (true);

-- 3) vu_puntos: `vu_puntos_insert_service` permitía INSERT a `public`:
--    cualquiera podía regalarse puntos de University. Solo escribe la RPC
--    completar_leccion (SECURITY DEFINER).
DROP POLICY IF EXISTS vu_puntos_insert_service ON public.vu_puntos;
