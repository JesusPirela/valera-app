# Cómo revertir los cambios del 23/09/2026

Todo lo de ese día está en commits separados, uno por tema, para poder tumbar
uno sin arrastrar los demás. Nada se aplicó sin dejar antes por dónde volver.

## Volver TODO al estado anterior

El punto estable, ya verificado y funcionando, está marcado en local y en GitHub:

```bash
git checkout main
git reset --hard estable-antes-mejoras   # también existe la rama respaldo-antes-mejoras
git push --force origin main             # OJO: reescribe main, avisa antes
```

Si prefieres no reescribir la historia (más seguro si alguien más ya jaló):

```bash
git revert --no-commit d495e963 0a5d968b 4a37351e 9f5f4e6e
git commit -m "revert: cambios del 23/09"
git push origin main
```

## Revertir UN solo cambio

Cada uno es independiente. `git revert <sha>` y push.

| Cambio | Commit | Qué toca | Si sale mal se nota en |
|---|---|---|---|
| Día y hora en la tabla de citas | `a6289c67` | `citas-venta.tsx` + trigger en BD | La columna "Día y hora de la cita" sale vacía o con la fecha mal |
| Arreglos de monitoreo (crash del CRM, navegación, panel) | `c6ee1971` | `crm.tsx` (ambos), `_layout.tsx`, `monitoreo.tsx`, `lib/navegar.ts` | El CRM no abre, o al cerrar sesión no va al login |
| Registro de fallos de la API + pantalla en el error | `9f5f4e6e` | `lib/supabase.ts`, `lib/monitor.ts`, `lib/db.ts` | Las peticiones fallan o van lentas (es lo ÚNICO que toca el camino de red) |
| Recálculo nocturno de contadores | `4a37351e` | Solo base de datos | Los números de propiedades/clientes de un usuario no cuadran |
| Listas por lotes en el CRM | `0a5d968b` | `crm.tsx` (ambos) | Faltan clientes en la tabla o en una sección |
| Prueba de humo en CI | `d495e963` | `.github/`, `scripts/`, `package.json` | Solo CI. No afecta a la app |
| Propiedades sugeridas en la ficha del cliente | `00343b55` | `components/PropiedadesSugeridas.tsx`, `lib/match-propiedades.ts`, los dos `detalle-cliente.tsx` | La ficha del cliente no abre, o la sección sugiere cosas fuera de lugar |
| Estado 'rentada' de las propiedades | `e5c2b717` | `lib/estado-propiedad.ts`, alta/edición/listado de propiedades, estadísticas | Una propiedad rentada no sale en el catálogo, o sale marcada como "Vendida" |

## Lo de la base de datos

Los cambios en base NO se revierten con git; llevan su SQL escrito.

**Contadores de user_stats** (migración `20260926_recalcular_contadores_user_stats.sql`).
Los valores previos de los 104 usuarios están guardados:

```sql
UPDATE public.user_stats s
   SET total_propiedades = b.total_propiedades, total_clientes = b.total_clientes,
       total_cursos = b.total_cursos, total_ventas = b.total_ventas
  FROM public.user_stats_respaldo_20260923 b WHERE b.id = s.id;
SELECT cron.unschedule('recalcular-contadores-user-stats');
```

`xp` y `valera_coins` no se tocaron, está comprobado contra ese mismo respaldo.

**Trigger de citas de venta** (migración `20260925_citas_venta_sync_reactivo_y_hora.sql`).
Para dejar de sincronizar al cambiar la cita, basta con devolver el trigger a su
forma anterior:

```sql
DROP TRIGGER IF EXISTS tr_citas_venta_desde_coord ON public.citas_coordinacion;
CREATE TRIGGER tr_citas_venta_desde_coord
  AFTER INSERT OR UPDATE OF asesor_id, estado, cliente_id, coordinado_por, prospectador_id
  ON public.citas_coordinacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_citas_venta_desde_coordinacion();
```

**Propiedades sugeridas** (migración `20260927_sugerencias_propiedades_cliente.sql`).
Quitar el componente de las fichas basta para que deje de verse; lo de la base
no estorba porque nada más lo usa. Para borrarlo del todo:

```sql
DROP FUNCTION IF EXISTS public.sugerir_propiedades(uuid, numeric, numeric, text[], text, int);
DROP TABLE IF EXISTS public.sugerencias_descartadas;   -- borra los descartes de los asesores
```

**Estado 'rentada'** (migraciones `20260928_estado_rentada.sql` y
`20260923_cron_cerrar_rentas_baratas.sql`). Devolver las propiedades cerradas y
apagar el cron; el CHECK se puede dejar ampliado sin que estorbe:

```sql
UPDATE public.propiedades p SET estado = b.estado
  FROM public.propiedades_respaldo_rentadas_20260924 b WHERE b.id = p.id;
SELECT cron.unschedule('cerrar-rentas-baratas');
```

## Si algo falla y no sabes qué fue

1. Entra a **Monitoreo** en el panel de admin. Desde hoy los errores traen la
   pantalla donde ocurrieron, y los fallos de la API (permisos, RLS, red)
   aparecen ahí aunque la pantalla no muestre nada raro.
2. El sospechoso por defecto es `9f5f4e6e`: es el único que se mete en el camino
   de todas las peticiones. Solo observa y va dentro de try/catch, pero si las
   peticiones fallan o van lentas, empieza por ahí.
3. `0a5d968b` no puede perder datos: solo cambia cuántas filas se pintan a la
   vez. Si falta gente en una lista, es que quedó un lote sin pedir.

---

# Cómo revertir los cambios de Marketplace (05/10/2026)

Facebook Marketplace empezó a rechazar las publicaciones. La causa medida: la
misma propiedad la publican 8.3 personas en promedio (máximo 58) pegando el
MISMO texto y las MISMAS fotos en el mismo orden. Estos tres commits hacen que
cada persona publique algo distinto.

Punto estable anterior: tag `estable-antes-marketplace` (commit `7d49535d`).

```bash
git checkout main
git reset --hard estable-antes-marketplace
git push --force origin main             # OJO: reescribe main, avisa antes
```

O sin reescribir historia:

```bash
git revert --no-commit e6e18d9f fc57b023 84853451 2aae5805 d1e7f38c
git commit -m "revert: cambios de marketplace del 05/10"
git push origin main
```

## Revertir UN solo cambio

| Cambio | Commit | Qué toca | Si sale mal se nota en |
|---|---|---|---|
| Banco de versiones de descripción | `d1e7f38c` | tabla + 3 funciones en BD, edge function, cron | Nada visible en la app: el banco solo se llena. Si falla, la app sigue copiando la descripción guardada |
| Teléfonos fuera de la descripción | `2aae5805` | 60 filas de `propiedades` | 60 propiedades se quedan sin descripción (es lo correcto: su "descripción" era un teléfono). El teléfono está en `inv_notas` |
| Copiar por persona + rotar fotos + aviso | `84853451` | `detalle-propiedad.tsx`, `lib/orden-fotos.ts` | "📋 Copiar" no copia, o copia sin el `ID: VR-####`; las fotos se bajan en orden raro; el aviso amarillo no se va |
| Cierres que invitan + m² de terreno + modelos de IA vivos | `e6e18d9f` | las 3 edge functions de descripción, nueva/editar-propiedad | El botón ✨ o "mejorar descripción" deja de responder, o la descripción sale sin cierre |
| Fuera el "agenda tu cita" fijo, armazón variado | `fc57b023` | las 3 edge functions de descripción | Todas las descripciones nuevas salen con el mismo armazón otra vez |

## Revertir la parte de BASE DE DATOS

El `git revert` NO deshace la base. Si hay que volver atrás también ahí:

```sql
-- 1) Apagar el generador (lo primero, para que no siga llenando)
SELECT cron.unschedule('generar-variantes-descripcion');

-- 2) Que la app deje de usar las versiones: con la función devolviendo NULL,
--    detalle-propiedad.tsx cae solo a la descripción guardada. Esto es
--    suficiente y NO requiere soltar nada.
CREATE OR REPLACE FUNCTION public.variante_descripcion(p_propiedad_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;

-- 3) Si además se quiere borrar todo el banco (no hace falta para revertir):
DROP TABLE IF EXISTS public.propiedad_descripcion_variantes;
DROP FUNCTION IF EXISTS public.variante_descripcion(uuid);
DROP FUNCTION IF EXISTS public.propiedades_sin_variantes(int);
DROP FUNCTION IF EXISTS public.publicaciones_recientes(uuid);

-- 4) Devolver los 60 teléfonos a la descripción. El texto original de las
--    2,256 propiedades quedó respaldado ANTES de tocar nada.
UPDATE public.propiedades p
   SET descripcion = r.descripcion
  FROM public.propiedades_descripcion_respaldo r
 WHERE r.propiedad_id = p.id
   AND p.descripcion IS NULL
   AND r.descripcion IS NOT NULL;

-- Y quitar la nota que se les agregó:
UPDATE public.propiedades
   SET inv_notas = NULLIF(trim(regexp_replace(inv_notas,
         E'\n?📞 Contacto \(estaba en la descripción\): [0-9 -]+', '', 'g')), '')
 WHERE inv_notas LIKE '%Contacto (estaba en la descripción)%';
```

## Comprobar que quedó bien (sin revertir)

```sql
-- Cómo va el banco
SELECT COUNT(*) AS versiones, COUNT(DISTINCT propiedad_id) AS propiedades
  FROM public.propiedad_descripcion_variantes;

-- Cuántas faltan
SELECT COUNT(*) AS propiedades, SUM(faltan) AS versiones
  FROM public.propiedades_sin_variantes(5000);

-- Que el cron esté corriendo
SELECT j.jobname, d.status, d.start_time
  FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname = 'generar-variantes-descripcion'
 ORDER BY d.start_time DESC LIMIT 5;

-- Ninguna descripción debe traer teléfono (debe dar 0)
SELECT COUNT(*) FROM public.propiedades
 WHERE descripcion IS NOT NULL
   AND (descripcion ILIKE '%whatsapp%' OR descripcion ~ '[0-9]{3}[- ]?[0-9]{3}[- ]?[0-9]{4}');
```

## Lo que NO se tocó

- `propiedades.descripcion` de las 2,195 propiedades con descripción de verdad:
  intacta. Sigue siendo la que se ve en la app y la fuente de los datos.
- El `ID: VR-####` al inicio de lo que se copia: se mantiene tal cual.
- El botón "✨ Copiar descripción para publicar (IA)" y su límite de 5/día:
  sin cambios.
- Las 65 propiedades con descripción de menos de 120 caracteres: no se les
  generan versiones, porque ahí no hay información que reacomodar.
