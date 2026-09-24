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

## Si algo falla y no sabes qué fue

1. Entra a **Monitoreo** en el panel de admin. Desde hoy los errores traen la
   pantalla donde ocurrieron, y los fallos de la API (permisos, RLS, red)
   aparecen ahí aunque la pantalla no muestre nada raro.
2. El sospechoso por defecto es `9f5f4e6e`: es el único que se mete en el camino
   de todas las peticiones. Solo observa y va dentro de try/catch, pero si las
   peticiones fallan o van lentas, empieza por ahí.
3. `0a5d968b` no puede perder datos: solo cambia cuántas filas se pintan a la
   vez. Si falta gente en una lista, es que quedó un lote sin pedir.
