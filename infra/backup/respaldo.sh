#!/bin/bash
#
# Volcado diario de la base de datos a Cloud Storage.
#
# Se ejecuta como Cloud Run Job, disparado por Cloud Scheduler. Lee la cadena de
# conexión de Secret Manager —montada como variable de entorno por Cloud Run—,
# vuelca con `pg_dump` y sube el resultado al bucket **sin escribirlo en disco**.
#
# `DATABASE_URL` no sale de Google Cloud en ningún momento: viaja de Secret
# Manager al contenedor y de ahí a Neon. No se registra, no se imprime, no se
# pasa por argumento (que sería visible en la lista de procesos).

set -eu

# ─────────────────────────────────────────────────────────────────────────────
# `pipefail` es la línea más importante de este archivo.
#
# Sin ella, en `pg_dump | gcloud storage cp`, el código de salida es el del
# ÚLTIMO comando. Si `pg_dump` revienta a mitad —la base dormida, un P1001, un
# corte—, `gcloud` sube tranquilamente lo que le llegó y termina con 0. El job
# sale en verde, el archivo existe, pesa algo, y está **truncado**.
#
# Eso es un bucket lleno de respaldos correctos a la vista e inservibles, que se
# descubre el día que hay que restaurar. Es exactamente la forma de fallo que ha
# costado esta semana entera: una pieza que parece hecha porque existe.
#
# `sh` de Alpine (BusyBox) admite `pipefail`; Debian `dash` no. La imagen es
# Debian, así que este script corre con `bash` — ver el Dockerfile.
#
# Y por eso el shebang dice `bash` y no `sh`: el `ENTRYPOINT` ya lo invoca bien,
# pero un shebang que promete `sh` en un script que exige `pipefail` es una
# trampa esperando a que alguien lo ejecute a mano.
# ─────────────────────────────────────────────────────────────────────────────
set -o pipefail

: "${DATABASE_URL:?falta DATABASE_URL}"
: "${BUCKET_RESPALDOS:?falta BUCKET_RESPALDOS}"

FECHA="$(date -u +%Y-%m-%dT%H%M%SZ)"
DESTINO="gs://${BUCKET_RESPALDOS}/pmo-${FECHA}.dump"

# Se levanta en cuanto `avisar` intenta mandar algo, para que la red de
# seguridad de mas abajo no publique un segundo mensaje por el mismo fallo.
YA_AVISADO=0

avisar() {
  YA_AVISADO=1
  # Reutiliza el webhook de la Capa 1. Si no esta configurado, no falla: se
  # registra igual y el job devuelve error, que es lo que ve Cloud Scheduler.
  #
  # ADVERTENCIA: antes esto era `|| true` con la salida a `/dev/null`. Si el
  # webhook rechazaba la llamada -URL caducada, el `TO_BE_FILLED_BY_USER` de
  # agosto, un corte de red- no quedaba ni rastro: **el sistema de avisos no
  # podia avisar de que estaba roto**. Ahora al menos lo deja en el log del job.
  if [ -z "${ALERT_WEBHOOK_URL:-}" ]; then
    echo "AVISO NO ENVIADO (falta ALERT_WEBHOOK_URL): $1" >&2
    return 0
  fi
  curl -sS -m 10 -X POST -H 'content-type: application/json' \
    -d "{\"text\": \"🔴 *Respaldo de la base de datos fallido*\n$1\"}" \
    "$ALERT_WEBHOOK_URL" >/dev/null \
    || echo "AVISO NO ENVIADO (el webhook rechazo la llamada): $1" >&2
}

fallar() {
  echo "RESPALDO FALLIDO: $1" >&2
  avisar "$1"
  exit 1
}

# ---------------------------------------------------------------------------
# Red de seguridad: avisar tambien de lo que NO estaba previsto.
#
# Cada comprobacion de este script acaba en `|| fallar`, y `fallar` avisa. Pero
# `set -e` mata el script en cualquier linea que devuelva error **sin pasar por
# `fallar`**: el `${DATABASE_URL:?}` que falta, el `gcloud storage ls` que lee
# el tamano, o la proxima linea que alguien anada sin acordarse de la tuberia
# del aviso. Todos esos casos dejaban el job en rojo **y el chat en silencio**.
#
# El `trap` cierra ese hueco por dentro: cualquier salida distinta de 0 manda un
# mensaje, haya pasado por `fallar` o no.
#
# ADVERTENCIA: y aun asi no basta, que es justo el motivo de la politica de
# Cloud Monitoring. Un `trap` solo corre si el script llego a arrancar. El
# 2026-08-19 los retornos de carro mataron a `bash` en la primera linea: a esa
# altura `avisar` ni existia. Un vigilante que vive dentro de lo vigilado
# comparte su suerte, y por eso el vigilante de verdad esta fuera.
# ---------------------------------------------------------------------------
al_salir() {
  codigo=$?
  # `if` y no `&&`: la condicion de un `if` esta exenta de `set -e`, y una
  # lista `&&` que corta no lo esta. Con `&&` este trap podia irse sin avisar.
  if [ "$codigo" -ne 0 ] && [ "$YA_AVISADO" -ne 1 ]; then
    avisar "el respaldo termino con codigo ${codigo} en un punto que no tenia comprobacion propia (ver los logs del job)"
  fi
}
trap al_salir EXIT

echo "Volcando a ${DESTINO}"

# --format=custom permite restaurar tablas sueltas y comprime por dentro.
# --no-owner y --no-privileges: el destino puede tener otro usuario (y lo tendrá
# el día de la migración a Cloud SQL, que es la mitad del motivo de esto).
pg_dump "$DATABASE_URL" \
    --format=custom \
    --no-owner \
    --no-privileges \
  | gcloud storage cp - "$DESTINO" \
  || fallar "pg_dump o la subida terminaron con error (ver los logs del job)"

# ─────────────────────────────────────────────────────────────────────────────
# Comprobar el archivo, no solo escribirlo.
#
# Un respaldo que nadie ha leído no es un respaldo, es un archivo. Estas dos
# comprobaciones son baratas y cierran el fallo del `pipefail` por el otro lado:
#   1. que pese algo razonable, y
#   2. que `pg_restore --list` sea capaz de leer su índice, que es lo único que
#      demuestra que el volcado está completo y no cortado a la mitad.
# ─────────────────────────────────────────────────────────────────────────────
TAMANO="$(gcloud storage ls --long "$DESTINO" | awk 'NR==1{print $1}')"
echo "Tamaño: ${TAMANO} bytes"

[ "${TAMANO:-0}" -gt "${TAMANO_MINIMO:-51200}" ] \
  || fallar "el volcado pesa ${TAMANO} bytes, por debajo del mínimo (${TAMANO_MINIMO:-51200}). Probablemente esté truncado."

# ⚠️ **Se baja a disco en vez de leerlo por tubería, y no es un capricho.**
#
# Esto era `gcloud storage cat "$DESTINO" | pg_restore --list`, y estuvo mal
# desde el primer día aunque pasara: `pg_restore --list` lee **solo el índice**
# del archivo y sale, así que la tubería se cierra antes de que `gcloud` termine
# de escribir. `gcloud` lo detecta como fallo de integridad —«Source hash … does
# not match destination hash 1B2M2Y8AsgTpgAmY7PhCfg==», que es el hash de la
# cadena vacía— y con `pipefail` se lleva el job por delante.
#
# **Funcionó cuatro veces por el tamaño del búfer**: con volcados de 200 KB
# `gcloud` acababa de escribir antes de que `pg_restore` cerrara. El primero de
# 270 KB lo destapó (2026-08-19). Una comprobación que depende de que el archivo
# sea pequeño no comprueba nada.
#
# Bajarlo además mejora lo que se prueba: se lee **el objeto tal como quedó
# guardado**, ida y vuelta completa, no el flujo que acabamos de mandar.
gcloud storage cp "$DESTINO" /tmp/verificar.dump \
  || fallar "el volcado subió pero no se puede volver a bajar"

pg_restore --list /tmp/verificar.dump >/dev/null \
  || fallar "el volcado subió pero pg_restore no puede leerlo: está corrupto o incompleto"

rm -f /tmp/verificar.dump

echo "Respaldo correcto: ${DESTINO} (${TAMANO} bytes, índice legible)"
