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

avisar() {
  # Reutiliza el webhook de la Capa 1. Si no está configurado, no falla: se
  # registra igual y el job devuelve error, que es lo que ve Cloud Scheduler.
  [ -n "${ALERT_WEBHOOK_URL:-}" ] || return 0
  curl -sS -m 10 -X POST -H 'content-type: application/json' \
    -d "{\"text\": \"🔴 *Respaldo de la base de datos fallido*\n$1\"}" \
    "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
}

fallar() {
  echo "RESPALDO FALLIDO: $1" >&2
  avisar "$1"
  exit 1
}

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

gcloud storage cat "$DESTINO" | pg_restore --list >/dev/null \
  || fallar "el volcado subió pero pg_restore no puede leerlo: está corrupto o incompleto"

echo "Respaldo correcto: ${DESTINO} (${TAMANO} bytes, índice legible)"
