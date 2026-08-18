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
# línea (ver el README) y súbela cuando Neon o Cloud SQL actualicen.
#
# Se instala desde el repositorio oficial de PostgreSQL porque el de Debian
# estable va dos versiones por detrás.
#
# **18, comprobado contra Neon el 2026-08-18** (consola del proyecto `pmo-db`:
# «Postgres version 18»). Estaba puesto en 17, que habría reventado en la
# primera ejecución con `server version mismatch` — el cliente no puede ser más
# viejo que el servidor.
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
RUN chmod +x /usr/local/bin/respaldo.sh

# `bash` y no `sh`: el script usa `set -o pipefail`, que el `dash` de Debian no
# implementa. Sin esto, un `pg_dump` roto subiría un archivo truncado y el job
# saldría en verde — que es justo lo que este respaldo existe para evitar.
ENTRYPOINT ["/bin/bash", "/usr/local/bin/respaldo.sh"]
