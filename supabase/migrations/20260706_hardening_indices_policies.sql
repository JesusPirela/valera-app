-- ═══════════════════════════════════════════════════════════════════════════
-- Hardening + rendimiento (2ª pasada de auditoría, 06/jul/2026)
-- Generado desde el estado real de la base (advisors de Supabase):
--   A) 42 índices para foreign keys sin cobertura (joins/cascades lentos).
--   B) 34 funciones con search_path fijo (previene hijacking de search_path).
--   C) 73 funciones SECURITY DEFINER sin EXECUTE para anon (defensa en
--      profundidad; ninguna ruta anónima usa RPCs — verificado en el cliente).
--   D) 124 políticas RLS con auth.*() envuelto en (SELECT ...) → se evalúa UNA
--      vez por query (initplan) en vez de una vez POR FILA (en notificaciones,
--      51k filas, eran 51k evaluaciones por consulta).
--   E) Cierre del listado anónimo del bucket propiedades (enumeración); las
--      URLs públicas directas /object/public/ no usan RLS y siguen igual.
-- ═══════════════════════════════════════════════════════════════════════════
-- A) Índices de foreign keys (42)
CREATE INDEX IF NOT EXISTS idx_campaign_leads_responsable_id ON public.campaign_leads(responsable_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_reactivaciones_cliente_id ON public.chatbot_reactivaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_citas_coordinacion_cliente_id ON public.citas_coordinacion(cliente_id);
CREATE INDEX IF NOT EXISTS idx_citas_coordinacion_coordinado_por ON public.citas_coordinacion(coordinado_por);
CREATE INDEX IF NOT EXISTS idx_citas_coordinacion_propiedad_id ON public.citas_coordinacion(propiedad_id);
CREATE INDEX IF NOT EXISTS idx_citas_coordinacion_prospectador_id ON public.citas_coordinacion(prospectador_id);
CREATE INDEX IF NOT EXISTS idx_cofres_entregas_admin_id ON public.cofres_entregas(admin_id);
CREATE INDEX IF NOT EXISTS idx_cofres_entregas_target_user_id ON public.cofres_entregas(target_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_pool_cliente_id ON public.leads_pool(cliente_id);
CREATE INDEX IF NOT EXISTS idx_leads_pool_compra_id ON public.leads_pool(compra_id);
CREATE INDEX IF NOT EXISTS idx_leads_pool_created_by ON public.leads_pool(created_by);
CREATE INDEX IF NOT EXISTS idx_notificaciones_chatbot_lead_id ON public.notificaciones(chatbot_lead_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_cliente_id ON public.notificaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_propiedad_id ON public.notificaciones(propiedad_id);
CREATE INDEX IF NOT EXISTS idx_profiles_bloque_id ON public.profiles(bloque_id);
CREATE INDEX IF NOT EXISTS idx_propiedad_publicada_propiedad_id ON public.propiedad_publicada(propiedad_id);
CREATE INDEX IF NOT EXISTS idx_propiedades_asesor_id ON public.propiedades(asesor_id);
CREATE INDEX IF NOT EXISTS idx_propiedades_created_by ON public.propiedades(created_by);
CREATE INDEX IF NOT EXISTS idx_propiedades_inmobiliaria_id ON public.propiedades(inmobiliaria_id);
CREATE INDEX IF NOT EXISTS idx_proyecto_actividades_proyecto_id ON public.proyecto_actividades(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_proyecto_actividades_user_id ON public.proyecto_actividades(user_id);
CREATE INDEX IF NOT EXISTS idx_proyecto_archivos_proyecto_id ON public.proyecto_archivos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_proyecto_archivos_user_id ON public.proyecto_archivos(user_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_creado_por ON public.proyectos(creado_por);
CREATE INDEX IF NOT EXISTS idx_proyectos_responsable_id ON public.proyectos(responsable_id);
CREATE INDEX IF NOT EXISTS idx_report_logs_admin_id ON public.report_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_report_programados_admin_id ON public.report_programados(admin_id);
CREATE INDEX IF NOT EXISTS idx_store_compras_atendido_por ON public.store_compras(atendido_por);
CREATE INDEX IF NOT EXISTS idx_store_compras_item_id ON public.store_compras(item_id);
CREATE INDEX IF NOT EXISTS idx_store_compras_user_id ON public.store_compras(user_id);
CREATE INDEX IF NOT EXISTS idx_tarea_asignaciones_user_id ON public.tarea_asignaciones(user_id);
CREATE INDEX IF NOT EXISTS idx_tareas_created_by ON public.tareas(created_by);
CREATE INDEX IF NOT EXISTS idx_user_misiones_mision_id ON public.user_misiones(mision_id);
CREATE INDEX IF NOT EXISTS idx_vu_certificados_curso_id ON public.vu_certificados(curso_id);
CREATE INDEX IF NOT EXISTS idx_vu_cursos_created_by ON public.vu_cursos(created_by);
CREATE INDEX IF NOT EXISTS idx_vu_entregas_leccion_id ON public.vu_entregas(leccion_id);
CREATE INDEX IF NOT EXISTS idx_vu_entregas_revisado_por ON public.vu_entregas(revisado_por);
CREATE INDEX IF NOT EXISTS idx_vu_progreso_curso_id ON public.vu_progreso(curso_id);
CREATE INDEX IF NOT EXISTS idx_vu_progreso_leccion_id ON public.vu_progreso(leccion_id);
CREATE INDEX IF NOT EXISTS idx_vu_puntos_curso_id ON public.vu_puntos(curso_id);
CREATE INDEX IF NOT EXISTS idx_vu_puntos_leccion_id ON public.vu_puntos(leccion_id);
CREATE INDEX IF NOT EXISTS idx_vu_tareas_curso_id ON public.vu_tareas(curso_id);

-- B) search_path fijo (34 funciones)
ALTER FUNCTION admin_regalar_cofre(uuid,integer,text) SET search_path = public;
ALTER FUNCTION buscar_por_phash(text,integer) SET search_path = public;
ALTER FUNCTION calificar_entrega(uuid,text,integer,text) SET search_path = public;
ALTER FUNCTION check_actividad_destacar() SET search_path = public;
ALTER FUNCTION claim_cofres_nivel(integer) SET search_path = public;
ALTER FUNCTION completar_leccion(uuid,uuid) SET search_path = public;
ALTER FUNCTION destacar_propiedad_manual(uuid,text,integer) SET search_path = public;
ALTER FUNCTION destacar_propiedad_manual(uuid,text) SET search_path = public;
ALTER FUNCTION entregar_tarea(uuid,uuid,uuid,text,text,text) SET search_path = public;
ALTER FUNCTION expirar_propiedades_destacadas() SET search_path = public;
ALTER FUNCTION fn_conexion_diaria(timestamp with time zone,timestamp with time zone,uuid) SET search_path = public;
ALTER FUNCTION fn_log_publicacion() SET search_path = public;
ALTER FUNCTION get_actividad_prospectadores() SET search_path = public;
ALTER FUNCTION get_cofres_stats() SET search_path = public;
ALTER FUNCTION get_estadisticas_admin() SET search_path = public;
ALTER FUNCTION get_estadisticas_admin(timestamp with time zone) SET search_path = public;
ALTER FUNCTION get_prospectadores() SET search_path = public;
ALTER FUNCTION get_tendencia_equipo(timestamp with time zone,timestamp with time zone) SET search_path = public;
ALTER FUNCTION get_vu_stats_admin() SET search_path = public;
ALTER FUNCTION guardar_nombre_certificado(uuid,text) SET search_path = public;
ALTER FUNCTION is_admin() SET search_path = public;
ALTER FUNCTION notificar_admins_login_prospectador(text) SET search_path = public;
ALTER FUNCTION notificar_admins_nuevo_cliente(text,uuid,text) SET search_path = public;
ALTER FUNCTION notificar_usuario(uuid,text,text,text,uuid,uuid,text) SET search_path = public;
ALTER FUNCTION notify_prospectadores_nuevo_curso() SET search_path = public;
ALTER FUNCTION notify_prospectadors_nueva_propiedad() SET search_path = public;
ALTER FUNCTION quitar_destacada(uuid) SET search_path = public;
ALTER FUNCTION set_completado_at() SET search_path = public;
ALTER FUNCTION touch_proyectos() SET search_path = public;
ALTER FUNCTION update_updated_at_chatbot_leads() SET search_path = public;
ALTER FUNCTION update_updated_at_clientes() SET search_path = public;
ALTER FUNCTION update_vu_cursos_updated_at() SET search_path = public;
ALTER FUNCTION update_vu_entregas_updated_at() SET search_path = public;
ALTER FUNCTION usar_cofre_pendiente() SET search_path = public;

-- C) SECURITY DEFINER sin acceso anon (73 funciones)
REVOKE EXECUTE ON FUNCTION admin_agregar_lead_pool(text,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_ajustar_monedas(uuid,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_asignar_leads_pendientes() FROM anon;
REVOKE EXECUTE ON FUNCTION admin_despublicar_propiedad(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_despublicar_todas(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_eliminar_lead_pool(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_entregar_recompensa(uuid,uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_entregar_recompensa(uuid,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_rechazar_compra(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_regalar_cofre(uuid,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_registrar_lead(uuid,uuid,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION asignar_bloque(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION asignar_lead_desde_pool(uuid,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION award_xp_coins(uuid,integer,integer,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION calificar_entrega(uuid,text,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION claim_cofres_nivel_todos() FROM anon;
REVOKE EXECUTE ON FUNCTION claim_cofres_nivel(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION completar_leccion(uuid,uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION completar_leccion(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION comprar_item_tienda(uuid,text,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION desbloquear_item_perfil(text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION despublicar_propiedad(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION destacar_propiedad_manual(uuid,text,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION destacar_propiedad_manual(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION detectar_duplicados_propiedad(double precision,double precision,numeric,text,smallint,text,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION eliminar_cliente(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION entregar_tarea(uuid,uuid,uuid,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION expirar_propiedades_destacadas() FROM anon;
REVOKE EXECUTE ON FUNCTION gastar_coins(uuid,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION get_actividad_diaria(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_actividad_periodo(integer,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_actividad_prospectadores() FROM anon;
REVOKE EXECUTE ON FUNCTION get_bloques_resumen(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION get_cofres_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION get_compras_pendientes_count() FROM anon;
REVOKE EXECUTE ON FUNCTION get_compras_tienda() FROM anon;
REVOKE EXECUTE ON FUNCTION get_conexion_todos_usuarios(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION get_estadisticas_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION get_estadisticas_admin(timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION get_historial_publicaciones(uuid,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION get_historial_usuario(uuid,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION get_horas_conexion(uuid,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION get_leads_pool_disponibles() FROM anon;
REVOKE EXECUTE ON FUNCTION get_leads_pool_historial() FROM anon;
REVOKE EXECUTE ON FUNCTION get_productividad_equipo(timestamp with time zone,timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION get_profile_id_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION get_prospectadores() FROM anon;
REVOKE EXECUTE ON FUNCTION get_publicaciones_conteo() FROM anon;
REVOKE EXECUTE ON FUNCTION get_publicaciones_usuario(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_publicadores_propiedad(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_ranking() FROM anon;
REVOKE EXECUTE ON FUNCTION get_resumen_usuario(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_tendencia_equipo(timestamp with time zone,timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION get_total_minutos_conexion(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_vu_stats_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION guardar_nombre_certificado(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION guardar_nota_bloque(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION incrementar_mision_diaria(text,date) FROM anon;
REVOKE EXECUTE ON FUNCTION is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION marcar_contesto_hoy(uuid,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION notificar_admins_compra_tienda(uuid,text,text,uuid,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION notificar_admins_login_prospectador(text) FROM anon;
REVOKE EXECUTE ON FUNCTION notificar_admins_nuevo_cliente(text,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION notificar_usuario(uuid,text,text,text,uuid,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION propiedades_similares(uuid,boolean,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION publicar_propiedad_atomico(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION quitar_destacada(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION registrar_premio_ruleta(text,text,integer,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION set_color_ficha(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION siguiente_codigo_propiedad() FROM anon;
REVOKE EXECUTE ON FUNCTION sincronizar_misiones_diarias_hoy(date) FROM anon;
REVOKE EXECUTE ON FUNCTION usar_cofre_pendiente() FROM anon;

-- D) Políticas RLS: auth.*() como initplan (124 políticas)
ALTER POLICY "app_config_admin_write" ON public.app_config USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "Admins pueden todo en asesores" ON public.asesores USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "audit_admin_select" ON public.audit_log USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "admin_all" ON public.bloque_diario USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "bloques_admin_all" ON public.bloques USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "bloques_select_auth" ON public.bloques USING (((SELECT auth.role()) = 'authenticated'::text));
ALTER POLICY "campaign_leads_admin" ON public.campaign_leads USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "chatbot_leads_select" ON public.chatbot_leads USING ((((SELECT auth.uid()) = prospectador_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))));
ALTER POLICY "chatbot_leads_update" ON public.chatbot_leads USING ((((SELECT auth.uid()) = prospectador_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))));
ALTER POLICY "chatbot_reactivaciones_select" ON public.chatbot_reactivaciones USING ((((SELECT auth.uid()) = prospectador_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))));
ALTER POLICY "citas_admin_all" ON public.citas_coordinacion USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "citas_asesor_all" ON public.citas_coordinacion USING (((SELECT auth.uid()) = asesor_id)) WITH CHECK (((SELECT auth.uid()) = asesor_id));
ALTER POLICY "citas_prospectador_insert" ON public.citas_coordinacion WITH CHECK (((SELECT auth.uid()) = prospectador_id));
ALTER POLICY "citas_prospectador_select" ON public.citas_coordinacion USING (((SELECT auth.uid()) = prospectador_id));
ALTER POLICY "citas_prospectador_update" ON public.citas_coordinacion USING (((SELECT auth.uid()) = prospectador_id)) WITH CHECK (((SELECT auth.uid()) = prospectador_id));
ALTER POLICY "clientes_delete" ON public.clientes USING ((((SELECT auth.uid()) = responsable_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "clientes_insert" ON public.clientes WITH CHECK (((SELECT auth.uid()) = responsable_id));
ALTER POLICY "clientes_insert_admin" ON public.clientes WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "clientes_select" ON public.clientes USING ((((SELECT auth.uid()) = responsable_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "clientes_update" ON public.clientes USING ((((SELECT auth.uid()) = responsable_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "admin_all_entregas" ON public.cofres_entregas USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "admin_all_nivel" ON public.cofres_nivel_historia USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "user_see_own_nivel" ON public.cofres_nivel_historia USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "coin_tx_admin_select" ON public.coin_transactions USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "coin_tx_insert" ON public.coin_transactions WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "coin_tx_select" ON public.coin_transactions USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "constructoras_admin_write" ON public.constructoras USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text]))))));
ALTER POLICY "inmobiliarias_admin_write" ON public.inmobiliarias USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "interacciones_delete" ON public.interacciones USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "interacciones_insert" ON public.interacciones WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "interacciones_select" ON public.interacciones USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "leads_pool_admin_all" ON public.leads_pool USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "misiones_admin_all" ON public.misiones USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "notas_own" ON public.notas_propiedad USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "notif_delete_own" ON public.notificaciones USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "notif_insert_own" ON public.notificaciones WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "notif_select_own" ON public.notificaciones USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "notif_update_own" ON public.notificaciones USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "admins delete proyectos" ON storage.objects USING (((bucket_id = 'proyectos-archivos'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "admins upload proyectos" ON storage.objects WITH CHECK (((bucket_id = 'proyectos-archivos'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "avatares_select tk3snb_0" ON storage.objects USING (((bucket_id = 'avatares'::text) AND (( SELECT ((SELECT auth.uid()))::text AS uid) = (storage.foldername(name))[1])));
ALTER POLICY "avatares_select tk3snb_1" ON storage.objects WITH CHECK (((bucket_id = 'avatares'::text) AND (( SELECT ((SELECT auth.uid()))::text AS uid) = (storage.foldername(name))[1])));
ALTER POLICY "avatares_select tk3snb_2" ON storage.objects USING (((bucket_id = 'avatares'::text) AND (( SELECT ((SELECT auth.uid()))::text AS uid) = (storage.foldername(name))[1])));
ALTER POLICY "avatares_select tk3snb_3" ON storage.objects USING (((bucket_id = 'avatares'::text) AND (( SELECT ((SELECT auth.uid()))::text AS uid) = (storage.foldername(name))[1])));
ALTER POLICY "vu_entregas_admin_read" ON storage.objects USING (((bucket_id = 'vu-entregas'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "vu_entregas_read_own" ON storage.objects USING (((bucket_id = 'vu-entregas'::text) AND (((SELECT auth.uid()))::text = (storage.foldername(name))[1])));
ALTER POLICY "vu_entregas_upload_own" ON storage.objects WITH CHECK (((bucket_id = 'vu-entregas'::text) AND (((SELECT auth.uid()))::text = (storage.foldername(name))[1])));
ALTER POLICY "Admins pueden ver todos los perfiles" ON public.profiles USING ((((SELECT auth.uid()) = id) OR is_admin()));
ALTER POLICY "Users can read their own profile" ON public.profiles USING (((SELECT auth.uid()) = id));
ALTER POLICY "Usuario actualiza su push_token" ON public.profiles USING (((SELECT auth.uid()) = id)) WITH CHECK (((SELECT auth.uid()) = id));
ALTER POLICY "profiles_update_own" ON public.profiles USING (((SELECT auth.uid()) = id)) WITH CHECK (((SELECT auth.uid()) = id));
ALTER POLICY "actividad_insert_own" ON public.propiedad_actividad WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "actividad_select" ON public.propiedad_actividad USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "imagenes_admin_delete" ON public.propiedad_imagenes USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "imagenes_admin_update" ON public.propiedad_imagenes USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "pub_admin_select" ON public.propiedad_publicacion USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "pub_insert_own" ON public.propiedad_publicacion WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "pub_select_own" ON public.propiedad_publicacion USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "pub_update_own" ON public.propiedad_publicacion USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "publicacion_admin_select" ON public.propiedad_publicacion USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "publicacion_user_all" ON public.propiedad_publicacion USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "Policy with table joins" ON public.propiedad_publicada USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "admins_select_all" ON public.propiedad_publicada USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "prospectadores_delete_own" ON public.propiedad_publicada USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "prospectadores_insert_own" ON public.propiedad_publicada WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "prospectadores_select_own" ON public.propiedad_publicada USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "usuarios eliminan sus propias publicadas" ON public.propiedad_publicada USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "usuarios insertan sus propias publicadas" ON public.propiedad_publicada WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "usuarios ven sus propias publicadas" ON public.propiedad_publicada USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Admins pueden hacer todo" ON public.propiedades USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "admin insert propiedades" ON public.propiedades WITH CHECK (((SELECT auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.role = 'admin'::text))));
ALTER POLICY "admin puede actualizar asesor_id" ON public.propiedades USING (((SELECT auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.role = 'admin'::text)))) WITH CHECK (((SELECT auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.role = 'admin'::text))));
ALTER POLICY "propiedades_delete_admin" ON public.propiedades USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "propiedades_insert_admin" ON public.propiedades WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "propiedades_select_all" ON public.propiedades USING ((((SELECT auth.role()) = 'authenticated'::text) AND ((es_inventario = false) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'asesor'::text]))))))));
ALTER POLICY "propiedades_update_admin" ON public.propiedades USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "prospectadores_select" ON public.propiedades USING (((es_inventario = false) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['prospectador'::text, 'prospectador_plus'::text])))))));
ALTER POLICY "admins_proyecto_actividades" ON public.proyecto_actividades USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "admins_proyecto_archivos" ON public.proyecto_archivos USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "admins_proyectos" ON public.proyectos USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "publog_admin" ON public.publicacion_log USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'asesor'::text]))))));
ALTER POLICY "publog_insert" ON public.publicacion_log WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "publog_own" ON public.publicacion_log USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "recordatorios_delete" ON public.recordatorios USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "recordatorios_insert" ON public.recordatorios WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "recordatorios_select" ON public.recordatorios USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "recordatorios_update" ON public.recordatorios USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "report_logs_admin" ON public.report_logs USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "admins_manage_report_programados" ON public.report_programados USING ((admin_id = (SELECT auth.uid()))) WITH CHECK ((admin_id = (SELECT auth.uid())));
ALTER POLICY "store_compras_admin_select" ON public.store_compras USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "store_compras_admin_update" ON public.store_compras USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "store_compras_insert" ON public.store_compras WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "store_compras_select" ON public.store_compras USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "store_items_admin_all" ON public.store_items USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "asignaciones_admin_all" ON public.tarea_asignaciones USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "asignaciones_user_select" ON public.tarea_asignaciones USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "asignaciones_user_update" ON public.tarea_asignaciones USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "tareas_admin_all" ON public.tareas USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "tareas_user_select" ON public.tareas USING (((activa = true) AND ((SELECT auth.uid()) IS NOT NULL)));
ALTER POLICY "user_misiones_insert" ON public.user_misiones WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "user_misiones_select" ON public.user_misiones USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "user_misiones_update" ON public.user_misiones USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "sessions_admin_select" ON public.user_sessions USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "sessions_insert_own" ON public.user_sessions WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "sessions_select_own" ON public.user_sessions USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "sessions_update_own" ON public.user_sessions USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "user_stats_admin_select" ON public.user_stats USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "user_stats_insert" ON public.user_stats WITH CHECK (((SELECT auth.uid()) = id));
ALTER POLICY "user_stats_select" ON public.user_stats USING ((((SELECT auth.uid()) = id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "user_stats_update" ON public.user_stats USING (((SELECT auth.uid()) = id));
ALTER POLICY "vu_cert_admin" ON public.vu_certificados USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "vu_cert_own" ON public.vu_certificados USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "vu_config_admin_write" ON public.vu_config USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "vu_cursos_admin_all" ON public.vu_cursos USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "vu_entregas_admin" ON public.vu_entregas USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "vu_entregas_own" ON public.vu_entregas USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "vu_lecciones_admin_all" ON public.vu_lecciones USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "vu_progreso_admin" ON public.vu_progreso USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "vu_progreso_own" ON public.vu_progreso USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "vu_puntos_admin" ON public.vu_puntos USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "vu_puntos_own" ON public.vu_puntos USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "vu_tareas_admin_write" ON public.vu_tareas USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'admin'::text)))));
ALTER POLICY "xp_tx_admin_select" ON public.xp_transactions USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'asesor'::text]))))));
ALTER POLICY "xp_tx_select_own" ON public.xp_transactions USING (((SELECT auth.uid()) = user_id));

-- E) Cierra la ENUMERACIÓN anónima del bucket propiedades (las URLs
--    públicas directas /object/public/ siguen funcionando: no usan RLS).
ALTER POLICY "Publico puede ver imagenes" ON storage.objects TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- C-bis) Correcciones aplicadas durante la ejecución (06/jul/2026):
--
-- 1. El REVOKE ... FROM anon del bloque C no bastaba: el EXECUTE les llegaba
--    por el pseudo-rol PUBLIC (grant por defecto de Postgres). Se revocó de
--    PUBLIC y se otorgó explícito a authenticated/service_role:
--      REVOKE EXECUTE ON FUNCTION <fn> FROM PUBLIC, anon;
--      GRANT EXECUTE ON FUNCTION <fn> TO authenticated, service_role;
--    (para las 73 funciones SECURITY DEFINER no-trigger de public)
--
-- 2. EXCEPCIÓN NECESARIA: is_admin() se usa DENTRO de políticas RLS y se
--    evalúa con los privilegios del rol consultante; sin EXECUTE para anon la
--    ficha pública quedaba rota ("permission denied for function is_admin").
--    Cualquier función citada en políticas RLS debe conservar EXECUTE para
--    todos los roles que consultan esas tablas:
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
