#!/usr/bin/env bash
#
# Despliega una (o varias) edge functions de Supabase, pero SOLO si el proyecto
# typechecka. Nace porque una vez se descubrió que la función desplegada NO era
# la del repo (alguien subió una versión distinta a mano): el código que corría
# no era el que estaba en git. Este script deja un único camino confiable.
#
# Uso:
#   SUPABASE_ACCESS_TOKEN=sbp_xxx bash scripts/deploy-function.sh mejorar-descripcion [otra ...]
#   SUPABASE_ACCESS_TOKEN=sbp_xxx bash scripts/deploy-function.sh --all
#
# El token NUNCA se guarda en el repo: se pasa por variable de entorno.
set -euo pipefail

PROJECT_REF="ystxicgrryyzhrxinsbq"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "✗ Falta SUPABASE_ACCESS_TOKEN (pásalo por variable de entorno)." >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Uso: bash scripts/deploy-function.sh <nombre-funcion> [otra ...]  |  --all" >&2
  exit 1
fi

echo "==> Typecheck (tsc --noEmit) ..."
if ! npx tsc --noEmit; then
  echo "✗ Hay errores de TypeScript. No se despliega hasta que el proyecto compile limpio." >&2
  exit 1
fi
echo "✓ Typecheck OK."

if [[ "$1" == "--all" ]]; then
  mapfile -t FUNCS < <(find supabase/functions -maxdepth 1 -mindepth 1 -type d ! -name '_*' -printf '%f\n')
else
  FUNCS=("$@")
fi

for fn in "${FUNCS[@]}"; do
  echo ""
  echo "==> Desplegando '$fn' ..."
  npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt
done

echo ""
echo "✓ Listo. Funciones desplegadas: ${FUNCS[*]}"
