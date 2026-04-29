-- Permitir que cada usuario borre sus propias notificaciones
CREATE POLICY "notif_delete_own" ON notificaciones
  FOR DELETE USING (auth.uid() = user_id);
