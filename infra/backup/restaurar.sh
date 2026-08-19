#!/bin/bash
#
# Simulacro de restauración: prueba que un volcado del bucket se puede devolver
# a una base de datos de verdad.
#
# Corre como Cloud Run Job, con la misma imagen que el respaldo. **Se ejecuta
# dentro de Google Cloud a propósito**: así la cadena de conexión no sale de
# Secret Manager, no hace falta instalar nada en ningún portátil, y el cliente de
# Postgres es exactamente el mismo que produjo el volcado.
#
# ── Por qué existe ──────────────────────────────────────────────────────────
# Un respaldo que nadie ha restaurado **no es un respaldo, es una suposición**.
# El job de volcado ya comprueba que el archivo es legible (`pg_restore --list`),
# pero leer el índice no es lo mismo que devolver los datos: un archivo puede
# tener índice válido y fallar a la mitad de la restauración.
#
# ── Las dos guardas ─────────────────────────────────────────────────────────
# El riesgo de este simulacro no es técnico, es de dedo: apuntar a la base
# equivocada. Por eso:
#   1. El destino **tiene que llamarse algo con `restore_test`**, y el script se
#      niega a arrancar si no. Ningún error de variable puede acabar en la base
#      de producción.
#   2. **No se usa `--clean` ni `--if-exists`.** Sobre una base recién creada no
#      hacen falta, y son justo las banderas que convierten un error de destino
#      en una pérdida irreversible.

set -euo pipefail

: "${DATABASE_URL:?falta DATABASE_URL}"
: "${VOLCADO:?falta VOLCADO (gs://bucket/archivo.dump)}"

BASE_PRUEBA="${BASE_PRUEBA:-pmo_restore_test}"

# ── Guarda 1: el destino no puede ser producción ─────────────────────────────
case "$BASE_PRUEBA" in
  *restore_test*) : ;;
  *)
    echo "ABORTADO: el destino '${BASE_PRUEBA}' no contiene 'restore_test'." >&2
    echo "Este script solo restaura sobre bases de prueba." >&2
    exit 1
    ;;
esac

# La base de origen, preguntada al servidor en vez de supuesta. Nunca se imprime
# la cadena de conexión: solo el nombre de la base.
BASE_ORIGEN="$(psql "$DATABASE_URL" -tAc 'select current_database()')"
echo "Servidor alcanzado. Base de producción: ${BASE_ORIGEN}. Destino: ${BASE_PRUEBA}"

if [ "$BASE_ORIGEN" = "$BASE_PRUEBA" ]; then
  echo "ABORTADO: origen y destino son la misma base." >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Misma conexión, otra base. Se sustituye el nombre dentro de la cadena sin
# imprimirla, para las dos formas que admite libpq: URI (`.../pmo?...`) y pares
# clave=valor (`dbname=pmo`).
#
# ⚠️ **Anclado, y nunca global.** La primera versión de esto hacía
# `${DATABASE_URL//\/$BASE_ORIGEN/…}` —sustitución global de `/pmo`— y reventó en
# la primera ejecución (2026-08-19): la ruta del socket es
# `/cloudsql/pmo-dashboard-503418:...`, que **también contiene `/pmo`**, así que
# el reemplazo destrozó el host y el proxy pidió una instancia llamada
# `pmo_restore_test-dashboard-503418:...`. El nombre de la base era prefijo de su
# propio proyecto, que es la clase de coincidencia que no se ve al escribirlo.
#
# Por eso el reemplazo se ancla al `?` que abre los parámetros, o al final de la
# cadena — los dos únicos sitios donde puede terminar el nombre de la base.
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$DATABASE_URL" == *"dbname=$BASE_ORIGEN"* ]]; then
  DSN_PRUEBA="${DATABASE_URL/dbname=$BASE_ORIGEN/dbname=$BASE_PRUEBA}"
elif [[ "$DATABASE_URL" == *"/$BASE_ORIGEN?"* ]]; then
  DSN_PRUEBA="${DATABASE_URL/\/$BASE_ORIGEN\?/\/$BASE_PRUEBA\?}"
elif [[ "$DATABASE_URL" == */"$BASE_ORIGEN" ]]; then
  DSN_PRUEBA="${DATABASE_URL%/$BASE_ORIGEN}/$BASE_PRUEBA"
else
  echo "ABORTADO: no se reconoce dónde está el nombre de la base en la cadena de conexión." >&2
  exit 1
fi

echo "Creando ${BASE_PRUEBA} vacía…"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${BASE_PRUEBA};"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${BASE_PRUEBA};"

limpiar() {
  echo "Destruyendo ${BASE_PRUEBA}…"
  psql "$DATABASE_URL" -c "DROP DATABASE IF EXISTS ${BASE_PRUEBA};" || true
}
# Se arma aquí, y no antes: hasta que la base existe no hay nada que destruir.
trap limpiar EXIT

# ── No nos fiamos del reemplazo: se comprueba conectando ─────────────────────
# Cualquier forma de cadena que no hayamos previsto acaba aquí, y acaba parada.
# Es más barato preguntarle al servidor a qué base nos ha conectado que razonar
# sobre la sustitución — y es lo que habría cazado el fallo del 2026-08-19 en el
# primer segundo, en vez de a mitad del `pg_restore`.
BASE_CONECTADA="$(psql "$DSN_PRUEBA" -tAc 'select current_database()')"
if [ "$BASE_CONECTADA" != "$BASE_PRUEBA" ]; then
  echo "ABORTADO: la cadena de prueba conecta a '${BASE_CONECTADA}' y no a '${BASE_PRUEBA}'." >&2
  exit 1
fi
echo "Conexión de prueba comprobada: apunta a ${BASE_CONECTADA}"

echo "Bajando ${VOLCADO}…"
gcloud storage cp "$VOLCADO" /tmp/volcado.dump

# ⚠️ `--exit-on-error` no es opcional. Por defecto `pg_restore` **sigue adelante
# tras un error** y termina con código 0 informando de los fallos por la salida
# de error. Sin esta bandera, una restauración a medias se contaría como buena —
# la misma trampa que `pipefail` en el volcado, en el otro extremo del viaje.
echo "Restaurando…"
pg_restore \
  --dbname="$DSN_PRUEBA" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  /tmp/volcado.dump

# ── La comprobación que decide ───────────────────────────────────────────────
# Que existan las tablas no prueba nada: un volcado de solo esquema también las
# crea. Lo que prueba que el respaldo sirve es que **haya filas dentro**.
echo "Comprobando contenido…"
psql "$DSN_PRUEBA" -v ON_ERROR_STOP=1 -c "
  select table_name as tabla,
         (xpath('/row/c/text()',
                query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                             false, true, '')))[1]::text::bigint as filas
  from information_schema.tables
  where table_schema = 'public'
  order by filas desc, tabla;
"

TOTAL="$(psql "$DSN_PRUEBA" -tAc "
  select coalesce(sum((xpath('/row/c/text()',
           query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                        false, true, '')))[1]::text::bigint), 0)
  from information_schema.tables where table_schema = 'public';
")"

echo "Filas restauradas en total: ${TOTAL}"

if [ "${TOTAL:-0}" -lt "${FILAS_MINIMAS:-1}" ]; then
  echo "SIMULACRO FALLIDO: la restauración terminó sin errores pero la base está vacía." >&2
  exit 1
fi

echo "SIMULACRO CORRECTO: ${VOLCADO} se restaura y trae ${TOTAL} filas."
