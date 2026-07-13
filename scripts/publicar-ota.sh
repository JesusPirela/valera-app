#!/usr/bin/env bash
#
# Publica la actualización OTA a TODOS los usuarios, incluidos los iPhone que
# quedaron varados.
#
# ── El problema que resuelve ───────────────────────────────────────────────
# app.json tiene runtimeVersion.policy = "appVersion": la actualización SOLO
# llega a los teléfonos que tengan instalada esa misma versión de la app.
# El 07/jul se subió la versión 1.0.3 -> 1.0.4, pero la build de iOS que la
# gente tiene instalada sigue siendo la 1.0.3. Resultado: desde entonces
# NINGÚN update ha llegado a iOS.
#
# Este script publica dos veces: una para los que siguen en 1.0.3 (rescate) y
# otra para los que ya están en 1.0.4. Es seguro porque no cambió ninguna
# dependencia nativa desde el bump: el JS de hoy corre igual sobre la 1.0.3.
#
# Uso:  bash scripts/publicar-ota.sh "mensaje del update"
#
set -euo pipefail

MSG="${1:-actualizacion}"
VERSION_NUEVA="1.0.4"   # la que está en app.json hoy
VERSION_VIEJA="1.0.3"   # la que tienen instalada los iPhone varados

# Pase lo que pase, app.json vuelve a su estado original.
cp app.json app.json.bak
restaurar() {
  mv app.json.bak app.json
  echo ""
  echo "app.json restaurado a la version $VERSION_NUEVA."
}
trap restaurar EXIT

echo "==> 1/2  Rescatando los telefonos varados en $VERSION_VIEJA ..."
node -e "
  const fs = require('fs');
  const a = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  a.expo.version = '$VERSION_VIEJA';
  fs.writeFileSync('app.json', JSON.stringify(a, null, 2) + '\n');
"
eas update --channel production --message "$MSG (rescate $VERSION_VIEJA)"

echo ""
echo "==> 2/2  Publicando para los que ya estan en $VERSION_NUEVA ..."
node -e "
  const fs = require('fs');
  const a = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  a.expo.version = '$VERSION_NUEVA';
  fs.writeFileSync('app.json', JSON.stringify(a, null, 2) + '\n');
"
eas update --channel production --message "$MSG"

echo ""
echo "Listo. Los dos grupos ya reciben la actualizacion."
echo "A futuro, para no volver a varar gente: subir la build nueva a la App"
echo "Store ANTES de subir el numero de version en app.json."
