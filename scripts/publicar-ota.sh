#!/usr/bin/env bash
#
# Publica la actualización OTA a TODAS las versiones que la gente tiene
# instalada, no solo a la última.
#
# ── El problema que resuelve ───────────────────────────────────────────────
# app.json tiene runtimeVersion.policy = "appVersion": una actualización SOLO
# llega a los teléfonos con esa misma versión instalada. En cuanto se sube el
# número en app.json, todos los que siguen en la anterior dejan de recibir
# nada, aunque el cambio sea puro JavaScript y les funcionaría perfecto.
#
# Pasó en julio con los iPhone varados en 1.0.3, y vuelve a pasar cada vez que
# se sube la versión antes de que la gente actualice. Este script publica una
# vez por cada versión viva.
#
# ── Mantenimiento ──────────────────────────────────────────────────────────
# VERSIONES debe reflejar lo que la gente TIENE instalado, no lo que dice
# app.json. Para saberlo:
#
#   select app_version, count(*) from profiles
#    where push_token is not null and app_platform in ('android','ios')
#    group by 1 order by 2 desc;
#
# Medido el 9/oct/2026: 83 personas en 1.0.6, 5 en 1.0.7, 3 en 1.0.4 y 1 en
# 1.0.8. Las de 1.0.4 quedan fuera a propósito: son 3 instalaciones de hace
# meses, y publicar a una versión tan vieja arriesga mandar JavaScript que
# espera código nativo que ese binario no tiene.
#
# ── Cuándo NO usar esto ────────────────────────────────────────────────────
# Si el cambio toca código nativo —plugins, permisos, pantallas en Kotlin, un
# sonido nuevo en res/raw— el OTA NO lo lleva y hace falta build. Peor: puede
# mandar JavaScript que llame a algo que en el binario viejo no existe.
#
# Uso:  bash scripts/publicar-ota.sh "mensaje del update"
#
set -euo pipefail

MSG="${1:-actualizacion}"
VERSIONES=("1.0.6" "1.0.7" "1.0.8")

if [[ -z "${EXPO_TOKEN:-}" ]] && ! npx eas-cli whoami >/dev/null 2>&1; then
  echo "✗ No hay sesión de Expo. Corre 'npx eas-cli login' o exporta EXPO_TOKEN." >&2
  exit 1
fi

echo "==> Typecheck antes de publicar ..."
if ! npx tsc --noEmit; then
  echo "✗ Hay errores de TypeScript. No se publica hasta que compile limpio." >&2
  exit 1
fi
echo "✓ Typecheck OK."

ORIGINAL="$(node -e "console.log(require('./app.json').expo.version)")"

# Pase lo que pase —error, Ctrl-C— app.json vuelve a como estaba.
cp app.json app.json.bak
restaurar() {
  mv app.json.bak app.json
  echo ""
  echo "app.json restaurado a la version $ORIGINAL."
}
trap restaurar EXIT

i=0
for V in "${VERSIONES[@]}"; do
  i=$((i + 1))
  echo ""
  echo "==> $i/${#VERSIONES[@]}  Publicando para los que estan en $V ..."
  node -e "
    const fs = require('fs');
    const a = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    a.expo.version = '$V';
    fs.writeFileSync('app.json', JSON.stringify(a, null, 2) + '\n');
  "
  npx eas-cli update --channel production --message "$MSG ($V)" --non-interactive
done

echo ""
echo "Listo. Las versiones ${VERSIONES[*]} ya reciben la actualizacion."
echo "Llega sola la proxima vez que cada quien abra la app."
