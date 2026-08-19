# Imagen del volcado diario. Pequeña a propósito: solo tiene que saber hablar
# Postgres y escribir en Cloud Storage.
#
# Base `google/cloud-sdk:slim` porque ya trae `gcloud` con el componente
# `storage` y la autenticación por cuenta de servicio resuelta dentro de Cloud
# Run. Construirla sobre `postgres:alpine` obligaría a meter el SDK a mano, que
# es el lado difícil de los dos.
FROM google/cloud-sdk:slim

# ⚠️ **La versión del cliente tiene que ser >= la del servidor.**
#
# `pg_dump` se niega a volcar una base más nueva que él con
# «server version mismatch», y ese error aparece **la primera vez que se
# ejecuta**, no al construir. Comprueba la versión real antes de fijar esta
# línea (ver el README) y súbela cuando Cloud SQL actualice.
#
# Se instala desde el repositorio oficial de PostgreSQL porque el de Debian
# estable va dos versiones por detrás.
#
# **18**, aunque el servidor sea `POSTGRES_16`. La regla va en **una sola
# dirección** —el cliente nunca más viejo que el servidor— y vale igual para
# volcar que para restaurar: un `pg_restore` 18 devuelve datos a un servidor 16
# sin problema.
#
# ⚠️ **Igualar el cliente al servidor no es más seguro: rompe los respaldos que
# ya existen.** Corregido el 2026-08-19, y esta vez con el archivo en la mano en
# vez de con un razonamiento. Los cuatro volcados del bucket llevan en su
# cabecera:
#
#     magic: PGDMP    version del archivo: 1.16
#
# El formato **1.16** lo escribe un `pg_dump` posterior al 16, y `pg_restore`
# **se niega a leer un archivo escrito por un cliente más nuevo que él**:
# `unsupported version (1.16) in file header`. Con `PG_MAJOR=16` el simulacro de
# restauración habría muerto ahí — y lo peor no es el fallo, es la lectura: habría
# parecido que la bóveda estaba rota cuando lo roto era la herramienta.
#
# Con 30 días de retención, bajar esta línea deja **un mes de copias que nuestra
# propia imagen no sabe abrir**.
#
# _Historia, porque explica el vaivén._ Nació en 17 por defecto. Subió a 18 al
# comprobar que Neon corría esa versión. La migración a Cloud SQL la bajó a 16
# buscando «evitar el problema del otro extremo» — un problema que no existe:
# restaurar con un cliente más nuevo que el servidor es el caso soportado y
# normal. **Sube esta línea cuando Cloud SQL actualice; no la bajes nunca.**
ARG PG_MAJOR=18
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg lsb-release \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends "postgresql-client-${PG_MAJOR}" \
 && rm -rf /var/lib/apt/lists/*

COPY respaldo.sh /usr/local/bin/respaldo.sh
# El simulacro de restauración viaja en la misma imagen a propósito: es el mismo
# cliente de Postgres que produjo el volcado, así que si uno escribe y el otro no
# puede leer, el problema es del archivo y no de las versiones.
COPY restaurar.sh /usr/local/bin/restaurar.sh
RUN chmod +x /usr/local/bin/respaldo.sh /usr/local/bin/restaurar.sh

# `bash` y no `sh`: el script usa `set -o pipefail`, que el `dash` de Debian no
# implementa. Sin esto, un `pg_dump` roto subiría un archivo truncado y el job
# saldría en verde — que es justo lo que este respaldo existe para evitar.
ENTRYPOINT ["/bin/bash", "/usr/local/bin/respaldo.sh"]
