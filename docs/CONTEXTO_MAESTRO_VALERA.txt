# Valera — Documento Maestro de Contexto

> Documento de referencia técnico-funcional para alimentar a otro modelo de IA.
> Objetivo: que cualquier IA entienda cómo funciona Valera para responder
> preguntas, generar código, proponer mejoras y mantener coherencia.
>
> **Convenciones:** cuando algo no está verificado o es ambiguo se marca con
> `⚠️ AMBIGUO/NO VERIFICADO`. No se inventa información.
>
> Última actualización del análisis: julio 2026. Versión app: 1.0.5.

---

## 1. Resumen ejecutivo

**Valera** (nombre comercial de la marca inmobiliaria "Valera Real Estate", Querétaro, México) es una **app CRM inmobiliaria gamificada** para equipos de venta/renta de propiedades. La usan **prospectadores** (agentes/vendedores) para gestionar clientes, publicar propiedades, generar fichas, coordinar citas, capacitarse y competir por XP/monedas; y **administradores/supervisores** para gestionar el catálogo, el equipo, leads, recompensas, estadísticas y monitoreo.

- **Tipo:** app móvil (Android/iOS) + web, con una sola base de código (Expo / React Native + React Native Web).
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions).
- **Modelo mental:** "CRM + Duolingo para inmobiliarias". La gamificación (niveles, misiones, racha, cofres, ranking, tienda) es central para enganchar al equipo.

---

## 2. Objetivo, problema y público

### 2.1 Objetivo / propósito
- Centralizar el trabajo diario del agente inmobiliario: catálogo de propiedades, CRM de clientes, seguimiento, citas, publicación en portales, generación de fichas y capacitación.
- **Motivar** al equipo con mecánicas de juego (XP, niveles, monedas, misiones, racha, cofres, ranking) para que publiquen más, den seguimiento y cierren más.

### 2.2 Problema que resuelve
- Agentes dispersos usando WhatsApp/Excel/portales sueltos, sin seguimiento sistemático ni visibilidad para la dirección.
- Falta de motivación/constancia (se resuelve con gamificación estilo Duolingo).
- Generación manual y lenta de fichas de propiedad (se automatiza a PDF y enlace público).
- Falta de métricas de productividad del equipo para admins.

### 2.3 Público objetivo
- **Primario:** prospectadores/agentes inmobiliarios de Valera Real Estate (Querétaro; también Monterrey, Puebla según catálogo).
- **Secundario:** administración de la inmobiliaria (dirección, coordinación de citas, gestión de leads y catálogo), supervisores de equipo y asesores externos.
- **Terciario / externo:** el **cliente final** (comprador/inquilino) que recibe una **ficha pública** (enlace o PDF) de una propiedad. El cliente NO usa la app; solo ve la ficha.

---

## 3. Tecnologías y arquitectura

### 3.1 Stack
- **Framework:** Expo SDK 53, React Native 0.79.6, React 19, TypeScript.
- **Ruteo:** Expo Router 5 (file-based routing; carpetas `app/`).
- **Web:** react-native-web 0.20 (misma base de código corre en web).
- **Backend:** Supabase (`@supabase/supabase-js` 2.100.x): PostgreSQL, Auth (JWT), Storage, Edge Functions (Deno), Realtime.
- **Estado de datos / caché:** React Query (`@tanstack/react-query` 5) + `PersistQueryClientProvider` con persister en AsyncStorage (caché de queries persistida en disco, `gcTime` 3 días).
- **Almacenamiento local:** AsyncStorage (nativo) / localStorage (web).
- **UI/otros:** expo-linear-gradient, react-native-svg, expo-image, react-native-maps (nativo) + Leaflet (web, vía WebView/HTML), expo-notifications, expo-print, jspdf + html2canvas (PDF en web), expo-image-picker/manipulator, expo-media-library, expo-clipboard, expo-sharing, expo-file-system, NetInfo.
- **Mapas:** `react-native-maps` en nativo; en web se usan componentes `.web.tsx` (Leaflet). Archivos con sufijo `.native.tsx` / `.web.tsx` (p. ej. `MiniMapa`, `PropMapa`).

### 3.2 Estructura de carpetas (código)
- `app/` — pantallas (Expo Router). Grupos de ruta entre paréntesis:
  - `app/(auth)/` — login.
  - `app/(prospectador)/` — app del agente.
  - `app/(admin)/` — panel de administración/supervisión.
  - `app/ficha/[codigo].tsx` — ficha pública de propiedad (ruta abierta).
  - `app/_layout.tsx` — layout raíz (auth, sesión, providers).
  - `app/index.tsx` — entrada/redirección.
  - `app/+html.tsx` — HTML base para web (splash boot).
- `components/` — componentes reutilizables (modales, avatares, mapas, ruleta, etc.).
- `lib/` — lógica compartida (supabase, gamification, patrones, sesión, etc.).
- `hooks/` — hooks (red, offline sync, pull-to-refresh, bloqueo supervisor).
- `supabase/functions/` — Edge Functions (Deno).
- `supabase/migrations/` — migraciones SQL.
- `web/ficha.php` — script PHP en Hostinger que inyecta OpenGraph para la vista previa de la ficha compartida.
- `plugins/` — config plugins de Expo (tamaño AsyncStorage, C++ std, etc.).

### 3.3 Cómo se comunican los módulos
- Las **pantallas** (`app/`) consumen datos vía **`lib/supabase.ts`** (cliente único) y **RPCs** (funciones PL/pgSQL) o queries directas a tablas (protegidas por RLS).
- **React Query** cachea y revalida; las **mutaciones** escriben a Supabase.
- La **gamificación** vive en `lib/gamification.ts` (cliente) + RPCs SQL atómicos (servidor).
- El **tema/aspecto** (color, patrón, figura) vive en `lib/ThemeContext.tsx` (lee de `profiles`).
- La **cola offline** (`lib/offline-queue.ts` + `hooks/useOfflineSync.ts`) reintenta escrituras críticas (crear/editar cliente, publicar propiedad).
- Los **Edge Functions** hacen tareas de servidor (push, importar propiedad, traducir ficha, mejorar imagen/descripción con IA, crear/eliminar usuarios, reportes, chatbot).

### 3.4 Modelo de despliegue (MUY IMPORTANTE)
- **`git push origin main`** dispara un GitHub Action que hace `expo export --platform web` y publica **SOLO la WEB** (a Hostinger, rama `web-build` + webhook). Dominio: `valeraapp.valerarealestate.com`.
- **Nativo (Android/iOS):** requiere `eas update --channel production` (OTA de JS) o `eas build` (si cambian dependencias nativas). `runtimeVersion.policy = "appVersion"` (1.0.5): un OTA solo llega a builds con la misma versión.
- **Edge Functions y migraciones SQL:** se despliegan **aparte** (Management API / supabase CLI), NO con el push de web.
- **Consecuencia:** un cambio de UI en web se ve al instante tras el push; en celular hasta el próximo `eas update`. Los cambios de base de datos (RPCs, columnas) aplican de inmediato en ambos.

---

## 4. Autenticación, roles y permisos

### 4.1 Autenticación
- **Supabase Auth** con email + contraseña. JWT con expiración **1 hora**; **refresh_token con ROTACIÓN** (cada token de refresco es de un solo uso; ventana de reúso ~10 s).
- `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`.
- **Lock de auth:** se usa el lock nativo de la librería (`navigatorLock` en web, `processLock` en nativo). *Razón:* dos refrescos simultáneos con rotación invalidan la sesión completa; el lock los serializa.
  - `lib/supabase.ts` define además un `fetch` con **timeout** (30 s datos, 12 s auth) y **auto-reintento** de peticiones `rest/v1` que devuelven 401 (refresca sesión y reintenta 1 vez).
  - **Antecedente crítico (ya corregido):** un callback `async` en `onAuthStateChange` (ThemeContext) que hacía una consulta a `profiles` dentro del lock causaba un **deadlock** tras un rato inactivo ("guardo algo y se queda cargando para siempre; solo recargar lo arregla"). Solución: el callback es **síncrono** y difiere el trabajo de red con `setTimeout(0)`. Regla general: **nunca usar async/await con llamadas a Supabase dentro de `onAuthStateChange`**.
- **Login:** pantalla `app/(auth)/login.tsx`.
- **Cambio de cuenta:** `components/CambiarCuenta.tsx` + `lib/cuentas.ts`. `setSession` no siempre es confiable; el fallback usa contraseña inline + `signInWithPassword`.
- **No auto-logout:** un `SIGNED_OUT` no solicitado (falso positivo de Android) NO manda al login; se intenta recuperar la sesión. Solo se va al login si el usuario toca "Cerrar sesión".
- `lib/sesion.ts` expone `getUsuarioActual()` (drop-in de `getUser()` que **NO** va a la red: lee la sesión local con `getSession`, con tope/reintento). Se migró toda la app de `getUser()` a `getUsuarioActual()` para no serializar decenas de round-trips en el lock.

### 4.2 Roles (columna `profiles.role`)
Valores existentes (con conteo aprox. al momento del análisis): `prospectador_plus` (25), `nuevo` (24), `prospectador` (21), `admin` (5), `supervisor` (4), `asesor` (2).

Jerarquía y capacidades (inferidas del código):
- **`nuevo`** — prospectador recién ingresado; acceso básico. No ve propiedades de inmobiliarias **exclusivas**.
- **`prospectador`** — agente estándar. Mismo grupo de rutas que `nuevo`/`prospectador_plus`.
- **`prospectador_plus`** — agente con permisos ampliados: **sí** puede ver propiedades exclusivas; hay helper `esPlusOMejor(rol)`.
- **`supervisor`** — ve datos del equipo (por RLS ve clientes de todos), estadísticas, coordinación. Puede quedar bloqueado por `useSupervisorBlock` en ciertas pantallas.
- **`asesor`** — asesor externo asociado a inmobiliaria (aparece como `asesor_id` en propiedades). Rol acotado.
- **`admin`** — acceso total al panel `(admin)`: catálogo, equipo, leads, tienda, cofres, misiones, monitoreo, reportes, ajustar XP/monedas, etc.

Helpers de permisos en `lib/permisos.ts`, `lib/adminsPrincipales.ts` (distingue "admin principal" / cuentas de la casa como Alexis, Chucho, André, Valera) y `lib/permisos.ts`.

### 4.3 "Ver como" (Vista Como)
- Un admin puede **"ver como usuario"** (`lib/VistaComo.tsx`, `components/VistaComoBanner.tsx`). Guarda `@valera_vista_como` en AsyncStorage. El rol efectivo pasa a ser el simulado. En web hay una colisión de nombres de ruta (ver 4.4).

### 4.4 Colisión de rutas web (detalle técnico clave)
- Diez pantallas existen con el **mismo nombre** en `(admin)` y `(prospectador)` (crm, detalle-cliente, propiedades, misiones, university, notificaciones, tareas, chats, chat-cliente, constructoras). En **web la URL no lleva el grupo** (`/crm` en vez de `/(admin)/crm`), así que el router entra por `(admin)`.
- El layout de admin (`app/(admin)/_layout.tsx`) detecta esto y **redirige** al usuario a su app (prospectador) conservando la MISMA pantalla y parámetros (lista `COMPARTIDAS`), no siempre a Propiedades.
- **Navegación "atrás":** el navegador de tabs del prospectador usa `backBehavior="history"` para que "atrás" vuelva a la pantalla anterior real y no siempre a la primera pestaña.

### 4.5 Permisos del dispositivo
- Android: `READ_MEDIA_IMAGES`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (guardar fotos descargadas).
- Notificaciones: `expo-notifications` (push + locales).
- Media Library (`expo-media-library`): guardar imágenes descargadas en nativo (pide permiso).
- Image Picker/manipulator: subir/editar avatar y fotos de propiedad.
- Ubicación: no se pide permiso explícito; los mapas muestran coordenadas guardadas de la propiedad.

---

## 5. Base de datos (Supabase / PostgreSQL)

> Todas las tablas están en el esquema `public` y protegidas por **RLS**. El
> proyecto: ref `ystxicgrryyzhrxinsbq`. Acceso administrativo vía Management API.

### 5.1 Tablas (55) — agrupadas por dominio

**Usuarios / perfil / sesión**
- `profiles` — perfil del usuario. Columnas: `id, role, created_at, nombre, telefono, avatar_url, color_acento, last_seen, bloque_id, app_version, app_platform, colores_desbloqueados[], avatares_desbloqueados[], notas_bloque, contesto_fecha, contesto_ok, color_ficha, push_token, figura_acento`.
- `user_stats` — gamificación por usuario: `id, xp, valera_coins, streak_dias, ultimo_acceso, total_propiedades, total_clientes, total_cursos, total_seguimientos, total_ventas, total_interacciones, cofres_pendientes, protectores_racha, racha_maxima, ultimo_dia_meta, racha_perdida, racha_perdida_fecha, protectores_nivel_otorgado, meta_diaria, racha_hito_celebrado, notif_racha_fecha, disenos_tokens`.
- `user_sessions` — sesiones de conexión (inicio/fin) para métricas de horas conectado.
- `xp_transactions` — historial de XP (`user_id, cantidad, concepto, created_at`). Fuente del **ranking mensual**.
- `coin_transactions` — historial de monedas (mismo formato). `cantidad` negativa = gasto.

**CRM / clientes**
- `clientes` — `id, nombre, telefono, email, empresa, fuente_lead, notas, estado, proximo_contacto, responsable_id, created_at, updated_at, tipo_operacion, tipo_credito, presupuesto, zona_busqueda, num_personas, tiene_mascotas, detalle_mascotas, fecha_mudanza, problemas_poliza, nivel_interes, cierre_completado, cierre_notas, eliminado_at`.
- `interacciones` — notas/actividades registradas por cliente.
- `recordatorios` — seguimientos agendados (fecha, completado, notificado).
- `seguimientos_dia` — un registro por (usuario, cliente, día) que trabajó a ese cliente. Fuente ÚNICA de la métrica de seguimientos (ver §8.4).
- `citas_coordinacion` — citas coordinadas (prospectador ↔ admin), estados incl. `realizada`, `cita_agendada`.
- `chatbot_leads`, `chatbot_reactivaciones` — leads que entran por chatbot externo (WhatsApp/Meta).
- `campaign_leads` — leads de campañas.
- `leads_pool` — pool de leads que admins reparten y que salen como premio de cofre.

**Propiedades / catálogo**
- `propiedades` — catálogo. Columnas clave: `id, titulo, descripcion, descripcion_corta, precio, direccion, created_by, codigo (VR-####), operacion (venta/renta), tipo, estado (disponible/…), recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos, destacada, destacada_mensaje, destacada_hasta, exclusiva, es_constructora, nombre_constructora, asesor_id, inmobiliaria_id, zona (queretaro/monterrey/puebla), lat, lng, es_inventario, inventario_seccion, inv_* (flujo de inventario), lona_contactada, titulo_en, descripcion_en, titulo_en_src, descripcion_en_src, traducido_at`.
- `propiedad_imagenes` — fotos (`url, thumb_url, orden`).
- `propiedad_publicacion` — cuántas veces publicó cada usuario cada propiedad (contador x/10).
- `propiedad_publicada`, `publicacion_log` — historial de publicaciones.
- `propiedad_actividad` — actividad sobre la propiedad (vista, descarga, solicitud_diseno).
- `notas_propiedad` — notas privadas por usuario y propiedad.
- `constructoras` — datos de constructoras (incl. `telefono_contacto`, coordinador).
- `inmobiliarias` — inmobiliarias asociadas (con `exclusiva`, logo).
- `asesores` — asesores externos.

**Gamificación / tienda**
- `misiones` — catálogo de misiones (tipo `diaria`/`base`, categoría, meta, recompensa_xp, recompensa_coins).
- `user_misiones` — progreso de misiones por usuario.
- `store_items` — items de tienda.
- `store_compras` — compras/canjes (estado: pendiente/entregado/rechazado).
- `cofres_entregas`, `cofres_nivel_historia` — cofres entregados / por nivel.
- `app_config` — configuración global (JSON). Clave importante: **`ruleta_config`** (premios y probabilidades de los cofres, editable por admin).

**Valera University (capacitación)**
- `vu_cursos`, `vu_lecciones`, `vu_progreso`, `vu_entregas`, `vu_tareas`, `vu_puntos`, `vu_certificados`, `vu_config`.

**Equipo / bloques / proyectos**
- `bloques`, `bloque_diario` — organización del equipo por "bloques".
- `prospectadores` — datos adicionales de prospectadores.
- `proyectos`, `proyecto_actividades`, `proyecto_archivos` — módulo de proyectos (admin).
- `tareas`, `tarea_asignaciones` — tareas asignables.

**Operación / logs / reportes**
- `audit_log` — auditoría (triggers en clientes, recordatorios).
- `event_log`, `error_log`, `monitoreo_errores_revisados` — monitoreo (§14).
- `report_logs`, `report_programados` — reportes.
- `notificaciones` — notificaciones in-app por usuario.

### 5.2 RPCs (funciones PL/pgSQL) — por dominio
> Se listan las más relevantes. Todas suelen ser `SECURITY DEFINER` y validan `auth.uid()`.

- **Gamificación XP/coins:** `award_xp_coins`, `award_xp_descarga` (tope diario), `gastar_coins`, `admin_ajustar_xp`, `admin_ajustar_monedas`, `nivel_de_xp`.
- **Misiones:** `incrementar_mision_diaria`, `sincronizar_misiones_diarias_hoy`, `misiones_diarias_hoy`.
- **Racha:** `get_estado_racha`, `sincronizar_racha`, `comprar_protector_racha`, `costo_protector_racha`, `costo_reparar_racha`, `reparar_racha`, `set_meta_diaria`, `premio_hito_racha`, `otorgar_protectores_nivel`, `protectores_por_nivel`, `rachas_en_riesgo`, `compras_protector_semana`, `max_compras_protector_semana`.
- **Cofres/ruleta/tienda:** `registrar_premio_ruleta`, `comprar_item_tienda`, `desbloquear_item_perfil`, `claim_cofres_nivel`, `claim_cofres_nivel_todos`, `usar_cofre_pendiente`, `get_cofres_stats`, `admin_regalar_cofre`, `admin_entregar_recompensa`, `admin_rechazar_compra`, `get_compras_tienda`, `get_compras_pendientes_count`.
- **Tokens de diseño:** `comprar_token_diseno` (100 coins, máx 2/día), `usar_token_diseno`.
- **Ranking:** `get_ranking` (histórico), `get_ranking_mensual` (mes en curso desde `xp_transactions`).
- **Seguimientos/CRM:** `registrar_seguimiento_cliente`, `eliminar_cliente`, `notificar_admins_nuevo_cliente`, `marcar_contesto_hoy`, `confirmar_cita`, `get_citas_por_confirmar`.
- **Propiedades:** `publicar_propiedad_atomico` (idempotente por idem_key), `despublicar_propiedad`, `admin_despublicar_propiedad`, `admin_despublicar_todas`, `destacar_propiedad_manual`, `quitar_destacada`, `expirar_propiedades_destacadas`, `siguiente_codigo_propiedad`, `detectar_duplicados_propiedad`, `buscar_por_phash`, `get_historial_publicaciones`, `get_publicaciones_usuario`, `get_publicaciones_conteo`, `get_publicadores_propiedad`, `propiedades_similares`.
- **Leads:** `asignar_lead_desde_pool`, `admin_agregar_lead_pool`, `admin_registrar_lead`, `admin_asignar_leads_pendientes`, `admin_eliminar_lead_pool`, `get_leads_pool_disponibles`, `get_leads_pool_historial`.
- **University:** `completar_leccion`, `entregar_tarea`, `calificar_entrega`, `guardar_nombre_certificado`, `get_vu_stats_admin`, `notify_prospectadores_nuevo_curso`.
- **Estadísticas/admin:** `get_estadisticas_admin`, `get_prospectadores`, `get_productividad_equipo`, `get_tendencia_equipo`, `get_actividad_*`, `get_conexion_todos_usuarios`, `get_horas_conexion`, `get_total_minutos_conexion`, `get_resumen_usuario`, `get_historial_usuario`, `get_bloques_resumen`, `asignar_bloque`, `guardar_nota_bloque`, `get_tabla_equipo`.
- **Monitoreo:** `log_error`, `log_evento`, `get_monitoreo_errores`, `get_monitoreo_eventos`, `get_error_ocurrencias`.
- **Utilidades/roles:** `is_admin`, `get_user_id_by_email`, `get_profile_id_by_email`, `hoy_mx` (fecha de hoy en zona MX), `notificar_usuario`, `notificar_admins_*`.

### 5.3 Zona horaria
- La lógica de "hoy" para XP diario, misiones, racha, topes y ranking mensual usa **hora de México** (`America/Mexico_City`), no UTC. `hoy_mx()` en SQL; en cliente se calcula con `toLocaleDateString('sv-SE', {timeZone:'America/Mexico_City'})`. *Motivo:* después de las 18:00 MX ya es otro día en UTC y rompía rachas/topes.

---

## 6. Flujo del usuario

### 6.1 Arranque
1. **Web:** `app/+html.tsx` muestra un boot-splash; al montar React se oculta (con red de seguridad de 20 s).
2. `app/_layout.tsx` monta providers (ThemeProvider, VistaComo, PersistQueryClientProvider, ErrorBoundary) y resuelve la sesión (`INITIAL_SESSION`).
3. Si no hay sesión → `(auth)/login`. Si hay → según rol, a la app de prospectador o al panel admin.

### 6.2 Login
- Pantalla `login.tsx`: email + contraseña → `signInWithPassword`. Logo grande arriba. Sin registro público (las cuentas las crea un admin, ver §12).

### 6.3 Navegación (prospectador)
- **Tabs inferiores** (`app/(prospectador)/_layout.tsx`): Propiedades, Clientes (CRM), Misiones, Universidad, Asesor, Avisos (notificaciones, con badge), Perfil. (El header naranja/teal muestra logo + saludo "Hola, {nombre}" + racha + "Mi día".)
- El resto de pantallas son "ocultas" (`href: null`) accesibles por navegación: detalle-propiedad, detalle-cliente, cliente-form, chats, chat-cliente, constructoras, zonas, tabla-equipo, mapa, ranking, tienda, mi-actividad/historial/publicaciones, university-curso/leccion, historial-publicaciones, mi-dia, supervision, asesor-estadisticas.

### 6.4 Navegación (admin)
- **Stack** con header teal (`app/(admin)/_layout.tsx`): campana de notificaciones (badge), toggle dark mode, "Salir". Acceso a: dashboard, propiedades, nueva-propiedad, editar-propiedad, inventario, constructoras, inmobiliarias, crm, coordinacion-citas, leads-pool, campaign-leads, prospectadores, bloques/bloque-detalle, tareas, proyectos, tienda-items, tienda-compras, gestion-cofres, misiones, university (+curso-form, entregas), estadisticas, reportes, actividad, conexion-usuarios, monitoreo, colores-ficha, cuenta, usuario-actividad/historial/publicaciones.

---

## 7. Módulos funcionales (detalle)

### 7.1 Propiedades (catálogo) — prospectador
- **`propiedades.tsx`** (home del agente): lista de propiedades disponibles con búsqueda (texto o **precio** con coma, p. ej. "2,5" = empieza en 2,5 M). Carga en dos fases (primeros 200, luego 1000; PostgREST corta a 1000 filas). Shuffle estable. Botón **Publicar** por tarjeta (contador x/10, tope 10 por propiedad).
- **`detalle-propiedad.tsx`** (la pantalla más rica):
  - **Carrusel de fotos** (FlatList horizontal; en web con flechas ‹ ›), **lightbox** al tocar (con miniaturas y navegación por teclado en web).
  - Datos: código VR-####, título, precio, dirección, "Publicada hace X", características (recámaras, baños, m², estacionamientos), asesor/inmobiliaria, mapa interactivo (acercar/alejar; en web bloquea scroll hasta clic).
  - **Estado de publicación** (x/10) + botón **Publicar** (idempotente vía `publicar_propiedad_atomico`; si falla la red se **encola** offline).
  - **Notas privadas** (solo el usuario las ve) → `notas_propiedad`.
  - **Descargar fotos** ("Todas" / "Elegir"): en web baja blobs (con proxy `wsrv.nl` si el CDN no da CORS) y dispara descargas individuales sin aviso previo. Da **3 XP una vez por descarga** (con tope diario 200 XP; ver §8).
  - **Idioma de la ficha:** Español / English (traduce con edge function `traducir-ficha` → DeepL; ver §11).
  - **Generar ficha PDF** (nativo: expo-print; web: jspdf). También da 3 XP (mismo tope).
  - **Enviar a mi cliente:** modal con los clientes del CRM; abre WhatsApp con el **enlace público** de la ficha (`/ficha/VR-###`). No sube nada a Supabase.
  - **Coordinar cita** con el admin que subió la propiedad (WhatsApp con datos del cliente).
  - **Solicitar diseño profesional** (con André): **bloqueado**, requiere un **token de diseño** (ver §8.7). Modal para comprarlo (100 coins, máx 2/día) o ganarlo en cofres.
  - **Impulsar con campaña** (promoción pagada — ⚠️ AMBIGUO: revisar flujo exacto).
  - "Opciones similares" (propiedades de la misma zona/rango).
- **Ficha pública** `app/ficha/[codigo].tsx` + `web/ficha.php`: página abierta (sin login) con la propiedad; el PHP inyecta OpenGraph (foto/título/precio) para que WhatsApp muestre la **foto de la casa** en la vista previa (no el logo). Cachea la traducción EN.

### 7.2 Constructoras — prospectador y admin
- **`constructoras.tsx`**: lista propiedades **de constructora** (`es_constructora=true`, no inventario) agrupadas por **fraccionamiento (zona) → constructora**. Búsqueda por constructora/modelo/zona; al buscar, los grupos se **auto-expanden** para ver los modelos. Chips por fraccionamiento. Marca constructoras "populares del mercado" (lista `POPULARES_KW`).
- **Admin** además tiene vista **Contactos** (un contacto por constructora, reutilizable) y liga al catálogo.

### 7.3 CRM (clientes) — prospectador
- **`crm.tsx`**: lista de clientes (tarjetas) con estado (pipeline: primer contacto, por perfilar, no contesta, cita por agendar, cita a futuro, cita agendada, seguimiento de cierre, apartó/compró, descartado), nivel de interés, fuente. Métricas arriba (activos, citas, vencidos, cerrados). Acciones por tarjeta: **WhatsApp, Llamar, Editar** (va directo al form) y **Chatbot** (según permiso). Edición inline de celdas (estado, próximo contacto). Botón "+" para nuevo cliente. Botón "Chats de WhatsApp".
- **`cliente-form.tsx`**: alta/edición de cliente. Campos varían por tipo de operación (venta/renta): nombre, teléfono, correo, fuente, estado, tipo de crédito, presupuesto, zona de interés (chips `ZonasInteresField`), personas, mascotas, fecha de mudanza, problemas de póliza, notas, próximo contacto. Robusto ante sesión lenta: recuerda el `userId` al abrir; si la sesión no responde a tiempo, **encola** (offline) y avisa "Guardado pendiente". Alta da **25 XP + 5 coins**; editar un cliente ya creado cuenta como **seguimiento** (§8.4).
- **`detalle-cliente.tsx`**: ficha del cliente. Recordatorios (agendar, **seguimiento rápido**, completar), historial de interacciones, registrar interacción, chat, enviar a chatbot. Completar/registrar seguimiento cuenta para la misión de seguimientos.
- **Chats:** `chats.tsx` (lista) + `chat-cliente.tsx` (conversación WhatsApp integrada vía Twilio/edge functions — ⚠️ revisar `twilio-mensajes`).

### 7.4 Valera University (capacitación) — prospectador
- **`university.tsx`**: lista de cursos con **miniaturas** (YouTube si existe; generada por IA si no). Presentación tipo plataforma de cursos.
- **`university-curso.tsx`**: lecciones del curso; genera **certificado PDF** al completar (jspdf en web / expo-print nativo). Completar lección da XP; completar curso da 100 XP + 20 coins.
- **`university-leccion.tsx`**: reproductor/contenido de la lección.
- Admin: `university.tsx`, `university-curso-form.tsx` (crear curso), `university-entregas.tsx` (calificar tareas).

### 7.5 Gamificación (transversal) — ver §8 completa
Misiones, XP, monedas, niveles, racha, cofres/ruleta, tienda, ranking, patrones/figuras, tokens de diseño.

### 7.6 Perfil — prospectador
- **`perfil.tsx`**: avatar (foto, emoji premium con GIF, o inicial) con **marco por nivel**; nombre/teléfono; nivel/título/barra de XP; **color de la app** (colores principales gratis + **patrones de tienda** a 300 coins + **figuras por nivel**); modo de carga (auto/todo/ahorro), dark mode, tope de fuente; guardar perfil; accesos a Mis publicaciones, Mi actividad, Mi historial; cambiar de cuenta.
- **Personalización (§9):** `color_acento` (fondo: color o `animated:<patrón>`), `figura_acento` (capa de figuras cayendo, independiente del fondo), avatar, marco (derivado del nivel).

### 7.7 Asesor / equipo / supervisión
- `asesor.tsx`, `asesor-estadisticas.tsx`, `supervision.tsx`, `tabla-equipo.tsx`, `mi-dia.tsx`, `mi-actividad.tsx`, `mi-historial.tsx`, `mi-publicaciones.tsx`, `historial-publicaciones.tsx`. Muestran métricas propias y del equipo.

### 7.8 Panel de administración (resumen por pantalla)
- **`dashboard.tsx`** — resumen general.
- **`propiedades.tsx` / `nueva-propiedad.tsx` / `editar-propiedad.tsx`** — CRUD de catálogo; importar desde URL de portal (edge `importar-propiedad` + ScraperAPI), detectar duplicados (pHash), mejorar descripción/imagen con IA.
- **`inventario.tsx`** — flujo de inventario (contactar asesor, autorizar publicar, publicar al catálogo).
- **`constructoras.tsx` / `inmobiliarias.tsx`** — gestión.
- **`crm.tsx` / `detalle-cliente.tsx` / `coordinacion-citas.tsx`** — CRM y coordinación de citas (confirmar, asignar prospectador).
- **`leads-pool.tsx` / `campaign-leads.tsx`** — gestión de leads (pool que sale en cofres; leads de campaña).
- **`prospectadores.tsx`** — gestión del equipo (crear, ver, ascender rol). Crea usuarios (edge `crear-prospectador`), ascenso de rol (edge `cambiar-rol`), eliminar (`eliminar-usuario`).
- **`bloques.tsx` / `bloque-detalle.tsx`** — organización por bloques.
- **`tareas.tsx` / `proyectos.tsx`** — tareas y proyectos internos.
- **`tienda-items.tsx`** — editar items de tienda y **config de cofres** (`ruleta_config`: premios y probabilidades; deben sumar 100%).
- **`tienda-compras.tsx`** — atender compras/canjes pendientes (entregar/rechazar).
- **`gestion-cofres.tsx`** — cofres.
- **`misiones.tsx`** — gestión de misiones.
- **`estadisticas.tsx` / `reportes.tsx` / `actividad.tsx` / `conexion-usuarios.tsx`** — analítica; reportes por correo (edge `enviar-reporte`, SMTP Gmail).
- **`monitoreo.tsx`** — errores/eventos capturados (§14): check/uncheck de "revisado", auto-marca los que se corrigen.
- **`colores-ficha.tsx`** — colores de ficha por usuario/casa.
- **`cuenta.tsx`** — cuenta admin.
- **`usuario-actividad/historial/publicaciones.tsx`** — detalle por usuario.

---

## 8. Sistema de gamificación (detalle exhaustivo)

### 8.1 XP y niveles
- XP se otorga por acciones (RPC `award_xp_coins`). Nivel derivado del XP (`lib/gamification.ts` `calcularNivel`):
  - Nivel 1→2 = **500 XP**; cada nivel siguiente pide +30 XP (nivel L a L+1 = `500 + 30*(L-1)`).
  - Sin límite de nivel. Ej.: nivel 10 ≈ 5,580 XP acumulados; nivel 100 ≈ 195,030 XP.
- **Títulos por nivel** (`tituloPorNivel`): Nuevo ingreso (1–2), Prospectador activo (3–4), Agente inmobiliario (5–7), Prospectador Elite (8–11), Top Closer (12–15), CRM Master (16–19), Rey de publicaciones (20–24), Leyenda inmobiliaria (25–29), **Maestro Valera ✨ (30+, no cambia más)**.

### 8.2 Recompensas por acción (`ACCIONES` en `lib/gamification.ts`)
| Acción | XP | Coins |
|---|---|---|
| Cerrar venta | 200 | 50 |
| Completar curso | 100 | 20 |
| Agendar cita | 50 | 10 |
| Completar lección | 30 | 10 |
| Nuevo cliente en CRM | 25 | 5 |
| Acceso diario (1/día) | 20 | 5 |
| Seguimiento a un cliente | 15 | 3 |
| Publicar propiedad | 10 | 2 |
| Registrar interacción | 10 | 2 |
| Descargar fotos/PDF | 3 | 0 |

### 8.3 Misiones
- **Diarias** (una vez al día c/u): Publicador del día (10 propiedades → 30 XP/10 coins), Prospectador activo (1 cliente → 25/8), Aprendizaje diario (1 lección → 20/10), Conectado con clientes (3 interacciones → 20/5), **Al día con clientes (10 seguimientos → 20/6)**.
- **Base** (una vez en la vida, al llegar al total acumulado): tramos por categoría (propiedades 20→200, clientes/CRM 5→100, seguimientos 5→50, cursos 3→10, racha 7→60 días) con recompensas crecientes (la más grande: **CRM Master 100 clientes → 1,500 XP / 450 coins**).
- Completar una misión **diaria** es lo que mantiene viva la **racha** (modelo Duolingo); abrir la app ya no basta.

### 8.4 Seguimientos (rework importante)
- Un **seguimiento** = volver a un cliente **ya existente** y moverlo: editarlo (desde ficha o CRM), completar un recordatorio suyo o registrarle un seguimiento rápido.
- Se cuenta **una vez por cliente por día** (tabla `seguimientos_dia`, RPC `registrar_seguimiento_cliente`), así reabrir y guardar el mismo cliente en bucle **no** farmea. Da 15 XP + 3 coins. La misión diaria pide 10 clientes distintos.
- **Antes** contaba recordatorios completados y avanzaba con solo **crear** un cliente (bug corregido).

### 8.5 Tope diario de descargas
- Descargar fotos y generar PDF dan 3 XP, pero con **tope de 200 XP/día** (RPC `award_xp_descarga`, en servidor para que no se pueda saltar). Las demás acciones no tienen tope.

### 8.6 Racha (streak) — modelo Duolingo
- La racha sube al **cumplir la meta diaria** (completar ≥1 misión diaria), no por abrir la app. Meta diaria elegible por el usuario (1/2/3 misiones).
- **Protectores de racha:** se ganan (1 cada 5 niveles) o se compran (con cupo semanal). Si faltas un día, se consume un protector. Racha reparable con coins.
- RPCs: `sincronizar_racha`, `get_estado_racha`, `comprar_protector_racha`, `reparar_racha`, hitos (`premio_hito_racha`). Componentes: `PanelRacha`, `RachaHeader`, `HitoRachaModal`.

### 8.7 Cofres / Ruleta / Tienda
- **Cofres** (`components/RuletaModal.tsx`): animación de cofre + slot machine + arpegio al ganar. **Sonido sintetizado con Web Audio** (`lib/sounds.ts`): shake, open, rolling, `playWin` (común) y **`playEpicWin`** (fanfarria para premios raros con `prob_cofre ≤ 5`). El sonido solo funciona en **web** (en nativo `ctx()` retorna null; requeriría `expo-av` + build).
- **Config de premios:** vive en `app_config.ruleta_config` (JSON, editable por admin en `tienda-items`). Es la **fuente real**; el `CONFIG_DEFAULT` del código es solo respaldo. Los premios tienen `tipo`, `prob_cofre`, `prob_milestone`, `min_cofres` (algunos requieren N cofres abiertos).
- **Premios existentes (config real):** Lead Premium, Lead Meta Ads, **Diseño Profesional** (10%), Acceso prioritario, Libro, Campaña, Comisión extra, Color personalizado, Avatar Animado. (⚠️ La config puede cambiarla el admin.)
- **Registro del premio:** RPC `registrar_premio_ruleta`. Ramas especiales que **auto-entregan**: `patron_animado` (desbloquea patrón), `diseno_pro` (entrega **token de diseño**), `pack_color`/`pack_avatar` (si la colección está completa, convierte a coins). El resto crea `store_compras` **pendiente** y notifica a admins para atender manualmente.
- **Tienda:** `store_items` + `store_compras`; `comprar_item_tienda`, `desbloquear_item_perfil` (colores/patrones/avatares), `admin_entregar_recompensa`/`admin_rechazar_compra`.
- **Tokens de diseño profesional:** `user_stats.disenos_tokens`. Se compran (`comprar_token_diseno`: 100 coins, **máx 2/día**) o se ganan en cofre (`diseno_pro`). Se consumen al pedir diseño (`usar_token_diseno`). El botón "Solicitar diseño con André" está **bloqueado** hasta tener ≥1 token.

### 8.8 Ranking
- **`ranking.tsx`** con toggle **📅 Mensual / ♾️ Histórico**.
  - **Histórico** (`get_ranking`): por XP acumulado de siempre (`user_stats.xp`).
  - **Mensual** (`get_ranking_mensual`): por XP ganado en el **mes en curso** (suma `xp_transactions` del mes, hora MX). Se "reinicia" solo cada mes (sin cron).
- El modal de perfil del ranking muestra: avatar (con marco, y **GIF animado** del emoji al abrir), fondo/patrón del usuario, título, nivel, XP, racha, y métricas de productividad (ventas, rentas, citas, propiedades, clientes, cursos). En la **lista** cada avatar muestra el **color/patrón** del usuario detrás (estático; se anima al pasar el mouse en web).
- Excluye admins.

---

## 9. Personalización visual (patrones y figuras)
- **Fondo (`color_acento`):** un color sólido (hex) **o** un patrón animado de tienda (`animated:<id>`: aurora, lava, ocean, forest, sunset, galaxy, rose, arctic — gradientes animados a 300 coins c/u).
- **Figuras (`figura_acento`):** capa **independiente** de figuras cayendo en diagonal encima del fondo, **desbloqueada por nivel**: Casas (Nv.10), Llaves (Nv.20), Edificios (Nv.30), Estrellas (Nv.45), Diamantes (Nv.60), Coronas (Nv.80). Dibujadas con SVG; las de nivel alto llevan brillo. `lib/patrones.tsx` (`AccentBackground`, `CapaFiguras`, `FigurasCayendo`).
- **Marco del avatar (`lib/marcos.ts`):** derivado del nivel (Básico, Bronce Nv.5, Plata 10, Oro 20, Platino 30, Diamante 40, Maestro 50, Legendario 75, Élite 100). Solo decorativo.
- **Detalle técnico:** en web, los bucles animados deben usar driver JS (`useNativeDriver:false`); el driver nativo congela el `Animated.loop` tras una vuelta.

---

## 10. Publicación de propiedades (flujo)
- Cada usuario puede publicar una propiedad hasta **10 veces** (contador x/10 en `propiedad_publicacion`).
- **Idempotencia:** `publicar_propiedad_atomico(p_propiedad_id, p_idem_key)`; si la red falla, se **encola** (`enqueuePublicacion`) con el mismo idem_key y se sube sola (no duplica). Da recompensa de misión (categoría propiedad).
- Botón en el listado (`propiedades.tsx`) y en el detalle (`detalle-propiedad.tsx`). Ambos usan `getSession`/userId cacheado (no `getUser`).

---

## 11. Integraciones y servicios externos
- **Supabase:** DB, Auth, Storage (buckets `propiedades`, `avatares`), Realtime, Edge Functions.
- **Transformación de imágenes:** se dejó de usar `/render/image/` de Supabase (cuota) y se usa **wsrv.nl** como proxy (agrega CORS, redimensiona, normaliza a JPG). Helper `lib/img.ts` (`thumb()`, `proxyImagen()`). Regla: usar `thumb()` para miniaturas.
- **DeepL** (traducción de fichas a inglés): secreto `DEEPL_API_KEY` (:fx, free 500k/mes). Edge function `traducir-ficha` (motor principal DeepL, respaldo Groq). Guarda `titulo_en`/`descripcion_en`.
- **ScraperAPI** (importar propiedades desde inmuebles24 y portales con Cloudflare): edge `importar-propiedad`.
- **IA de imágenes (mejorar fachadas):** edge `mejorar-imagen` (históricamente Cloudflare Workers AI img2img; se investigaron fal.ai, Gemini, Apiframe — la mayoría sin crédito gratis). ⚠️ ESTADO: bloqueado/pendiente de proveedor de pago. `mejorar-descripcion` mejora textos con IA.
- **SMTP Gmail** (`valerarealestateqro@gmail.com`, app password): edge `enviar-reporte`.
- **Push:** `expo-notifications` + edge `enviar-push` / `procesar-pushes` / `recordatorio-notificaciones`. Token en `profiles.push_token`.
- **WhatsApp:** enlaces `wa.me` (coordinar cita, enviar ficha, contactar). Chat integrado vía **Twilio** (edge `twilio-mensajes`) — ⚠️ revisar alcance.
- **Chatbot externo** (Meta/WhatsApp): edges `chatbot-eventos`, `agregar-cliente-chatbot`, `buscar-propiedades` → `chatbot_leads`.
- **YouTube:** miniaturas de cursos.
- **Google Maps / Leaflet:** mapa estático para PDF (Google Static Maps) y mapa interactivo (Leaflet en web, react-native-maps en nativo).
- **Hostinger:** hosting web + `web/ficha.php` (OpenGraph). Deploy vía GitHub Action + webhook.

---

## 12. Creación de usuarios / onboarding
- **No hay registro público.** Un **admin** crea prospectadores desde `prospectadores.tsx` (edge `crear-prospectador`). El nuevo usuario entra con las credenciales que le dan.
- Ascenso de rol (nuevo → prospectador → prospectador_plus): edge `cambiar-rol` + `AscensoRolModal` (modal celebratorio al ascender).
- Eliminar usuario: edge `eliminar-usuario`.
- Notificación a admins cuando un prospectador inicia sesión: `notificar_admins_login_prospectador`.

---

## 13. Notificaciones
- **In-app:** tabla `notificaciones` (badge en tabs/campana). Tipos: `ruleta`, `sistema`, `recordatorio`, `ascenso_rol`, `nueva_propiedad`, `tienda`, etc.
- **Push:** `expo-notifications`; deep-links al tocar (a detalle-cliente, detalle-propiedad, chat, notificaciones). Edges `enviar-push`, `procesar-pushes`.
- **Locales (web):** `lib/notificaciones-locales.ts` (aviso del navegador para recordatorios).
- **Recordatorios:** `recordatorios` → notificación cuando vence (edge `recordatorio-notificaciones` + programación local en nativo).

---

## 14. Monitoreo, logs y manejo de errores
- **ErrorBoundary por ruta:** `components/PantallaError.tsx` (export `ErrorBoundary` en pantallas críticas). Captura crashes, ofrece "Reintentar", registra con `captureError`.
- **Captura de errores:** `lib/monitor.ts` → RPC `log_error` (tabla `error_log`) y `log_evento` (tabla `event_log`). Se registran `window.onerror`, promesas no manejadas, crashes de pantalla, y errores de auth ("auth lock timeout").
- **Panel `monitoreo.tsx`:** lista errores/eventos agregados (`get_monitoreo_errores`), permite marcar "revisado" (`monitoreo_errores_revisados`).
- **Errores conocidos en histórico:** "auth lock timeout" (deadlock ya corregido), React #310 (hooks), "Maximum call stack".

---

## 15. Modo offline y red
- **`hooks/useNetworkStatus.ts`** (NetInfo) + **`hooks/useOfflineSync.ts`**: cola de escrituras críticas (crear/editar cliente, publicar propiedad) en `lib/offline-queue.ts`.
- Se drena al abrir la app, al recuperar conexión, al volver a primer plano y **periódicamente cada 45 s** (para el caso en que la sesión —no la red— falló). `syncNow` tiene guarda (`syncingRef`) contra ejecuciones solapadas; las RPCs son idempotentes.
- **`OfflineBanner`** avisa cuando hay pendientes.
- **`fetchConTimeout`** aborta peticiones colgadas (30 s datos / 12 s auth) para que la UI no se quede pegada tras un socket muerto por inactividad.

---

## 16. Validaciones y edge cases relevantes
- **Cliente:** nombre, teléfono, zona y presupuesto obligatorios; teléfono normalizado (`lib/telefono.ts`).
- **Publicar:** tope 10/propiedad; token vencido → refresca y reintenta; timeout → verifica si la escritura llegó igual (idempotente).
- **Descargas:** en web el navegador puede pedir permiso de "descargar varios archivos" (fuera del control de la app; se pregunta una vez por sitio). En nativo pide permiso de Media Library.
- **Caché viejo:** el detalle de propiedad usa `refetchOnMount:'always'` (con `networkMode:'offlineFirst'`) para no quedarse con una versión parcial guardada (síntoma histórico: "solo la 1a foto, sin descripción, hasta cerrar sesión").
- **Sesión trabada tras inactividad:** ver §4.1 (deadlock corregido; guardar ya no se cuelga).
- **Zona horaria:** todo lo "diario" en hora MX (§5.3).
- **Propiedades exclusivas:** ocultas a roles por debajo de `prospectador_plus`.
- **PDF sin imágenes (histórico):** fotos en CDN sin CORS → se convierten vía `proxyImagen` (wsrv) para incrustarlas en base64.

---

## 17. Datos de referencia / secretos (para operar, NO exponer)
> Ubicados en la memoria del proyecto; se resumen para contexto operativo. **No deben publicarse.**
- **Supabase:** project ref `ystxicgrryyzhrxinsbq`, URL `https://ystxicgrryyzhrxinsbq.supabase.co`, anon key en `.env` (`EXPO_PUBLIC_SUPABASE_*`), service role key + PAT para Management API.
- **Credenciales de prueba (dev):** `asd@mail.com` / `123` (rol admin, nombre en DB puede ser NULL).
- **Dominios:** app web en `valeraapp.valerarealestate.com`; `valerarealestate.com` es marketing (404 en `/ficha`).
- **Otros secretos configurados en Supabase:** DeepL, ScraperAPI, SMTP Gmail, (IA de imágenes pendiente).

---

## 18. Estado actual, limitaciones y mejoras

### 18.1 Funcionalidades actuales (completas)
CRM completo, catálogo + publicación + inventario, constructoras, fichas PDF/enlace/EN, University, gamificación completa (XP, coins, niveles, misiones, racha, cofres, tienda, ranking mensual/histórico, patrones/figuras, tokens de diseño), notificaciones push/in-app, panel admin (equipo, leads, estadísticas, monitoreo, reportes), modo offline, "ver como".

### 18.2 Limitaciones / pendientes conocidos
- **Sonido de cofres solo en web** (nativo necesitaría `expo-av` + `eas build`).
- **IA de mejora de imágenes (fachadas):** bloqueada por falta de proveedor gratuito con calidad; requiere API de pago (Gemini/SiliconFlow/Apiframe con saldo).
- **Tabla de recompensas dentro de la app** (perfil/tienda) puede estar desactualizada respecto a los valores reales (no refleja el tope de descargas ni el acceso diario). ⚠️ Verificar.
- **Item "Diseño Profesional"** usa internamente `tipo: plantilla`; ya no existe un premio separado "Pack plantillas". Si se quisiera, habría que crear item/tipo propio.
- **Nativo desactualizado:** si el celular no ha tomado el último `eas update`, puede reproducir bugs ya corregidos en web.
- ⚠️ **AMBIGUO / no verificado en este análisis:** detalle exacto de "Impulsar con campaña", alcance del chat Twilio, flujo completo de proyectos/bloques, y el módulo `asesor`/`supervision` (existen pero no se auditaron a fondo aquí).

### 18.3 Mejoras posibles (sugeridas)
- Sincronizar la tabla de recompensas visible con los valores reales.
- Sonido de cofres en nativo (integrar `expo-av`).
- Que el botón admin "atender" pueda entregar tokens/recompensas especiales manualmente.
- Documentar/normalizar las probabilidades de cofre (deben sumar 100%).
- Adaptar el color de las figuras al fondo elegido para garantizar contraste.

---

## 19. Cómo dependen los módulos entre sí (mapa de dependencias)
- **Todo** depende de `lib/supabase.ts` (cliente único) y del **rol** (`profiles.role`) para RLS/UI.
- **Gamificación** (`lib/gamification.ts`) es invocada por: publicar propiedad, CRM (alta/seguimiento), University (lección/curso), descargas/PDF, cofres/tienda. Escribe `user_stats`, `xp_transactions`, `coin_transactions`, `user_misiones`, `seguimientos_dia`.
- **Ranking** depende de `user_stats` (histórico) y `xp_transactions` (mensual); por eso `admin_ajustar_xp` registra el delta en `xp_transactions` (para que cuadre el mensual).
- **Tema/personalización** (`ThemeContext` + `patrones` + `marcos`) depende de `profiles.color_acento`/`figura_acento` y del **nivel** (derivado de `user_stats.xp`).
- **Cofres** (`RuletaModal`) dependen de `app_config.ruleta_config` (admin) y de `registrar_premio_ruleta`; el premio `diseno_pro` alimenta `disenos_tokens`, que habilita el botón de diseño en `detalle-propiedad`.
- **Fichas** dependen de `propiedades` + `propiedad_imagenes` + traducción (`traducir-ficha`/DeepL) + proxy de imágenes (`wsrv.nl`) + `web/ficha.php` (OpenGraph).
- **Offline** (`useOfflineSync`) intercepta escrituras de CRM y publicación; depende de idempotencia de las RPCs.
- **Auth/sesión** es transversal: si el lock se traba, TODO lo que llame a Supabase se cuelga (de ahí la importancia de §4.1).

---

## 20. Glosario rápido
- **Prospectador:** agente/vendedor (usuario principal).
- **Ficha:** documento (PDF o enlace público) de una propiedad para compartir con el cliente.
- **Cofre / ruleta:** mecánica de recompensa aleatoria.
- **Racha (streak):** días consecutivos cumpliendo la meta diaria.
- **Meta diaria:** completar N misiones diarias (elegible 1/2/3).
- **Token de diseño:** crédito para pedir un diseño profesional a André.
- **Patrón / figura:** personalización del fondo animado / capa de figuras cayendo.
- **Marco:** borde del avatar según el nivel.
- **Bloque:** agrupación organizativa del equipo.
- **VU (Valera University):** módulo de capacitación.
- **Inventario:** propiedades en proceso previo a publicarse al catálogo.
- **Exclusiva:** propiedad de inmobiliaria exclusiva (visible solo a plus/admin/supervisor).

---

_Fin del documento. Para dudas sobre implementación exacta de una pantalla o RPC, consultar el archivo correspondiente en `app/`, `lib/`, `components/` o el cuerpo de la función en la base de datos._
