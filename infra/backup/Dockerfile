# Imagen del volcado diario. Pequeña a propósito: solo tiene que saber hablar
# Postgres y escribir en Cloud Storage.
#
# Base `google/cloud-sdk:slim` porque ya trae `gcloud` con el componente
# `storage` y la autenticación por cuenta de servicio resuelta dentro de Cloud
# Run. Construirla sobre `postgres:alpine` obligaría a meter el SDK a mano, que
# es el lado difícil de los dos.
FROM google/cloud-sdk:slim

# ⚠️ **La versión del cliente tiene que ser LA MISMA que la del servidor.**
#
# No «mayor o igual». **La misma major.** Corregido el 2026-08-19 tras dos
# intentos fallidos del simulacro de restauración, que es lo que se necesitaba
# para saberlo.
#
# `pg_dump` no escribe un archivo neutro: escribe **SQL para la versión con la
# que habla**. Un `pg_dump` 18 mete `SET transaction_timeout = 0;` en la
# cabecera del volcado, y ese parámetro **no existe antes de PostgreSQL 17**. Al
# restaurarlo contra `POSTGRES_16` muere con
# `unrecognized configuration parameter "transaction_timeout"`, y da igual con
# qué `pg_restore` se lea: el problema viaja **dentro del archivo**.
#
# Y por el otro lado tampoco se puede bajar el cliente por debajo del servidor:
# `pg_dump` se niega con «server version mismatch», y `pg_restore` rechaza un
# archivo escrito por uno más nuevo —los volcados de un cliente 18 llevan
# `PGDMP · versión 1.16`, ilegible para un `pg_restore` 16—.
#
# Las dos paredes juntas dejan un solo valor válido: **el del servidor**.
#
#     gcloud sql instances describe pmo-postgres-db --format='value(databaseVersion)'
#
# ⚠️ **Y esto cambia la operación el día que Cloud SQL actualice**: los volcados
# tomados con el cliente viejo dejan de restaurarse en el servidor nuevo, y al
# revés. Subir esta línea es parte de la migración de versión, no un detalle
# posterior — y conviene tomar un volcado nuevo el mismo día.
#
# _Historia del vaivén, que se pagó en dos ejecuciones fallidas._ Nació en 17 por
# defecto. Subió a 18 cuando la base era Neon 18. Bajó a 16 con la migración a
# Cloud SQL. Volvió a 18 el 19-08 por un razonamiento mío equivocado —«cliente
# mayor o igual»—, y el simulacro demostró que el correcto era 16. **La lección
# no es el número: es que esto no se deduce, se prueba restaurando.**
#
# Se instala desde el repositorio oficial de PostgreSQL porque el de Debian
# estable va dos versiones por detrás.
ARG PG_MAJOR=16
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
# ⚠️ **Se quitan los retornos de carro antes de nada.**
#
# Git en Windows convierte los archivos a CRLF al ponerlos en el árbol de
# trabajo, y `gcloud builds submit` sube el árbol tal cual. `bash` no entiende el
# `\r`: muere en la primera línea con `$'\r': command not found`, con el
# contenedor ya arrancado y autenticado, así que el error no se parece en nada a
# su causa.
#
# Pasó el 2026-08-19 y tumbó una ejecución del respaldo. Hay un `.gitattributes`
# en la raíz que marca los `.sh` como `eol=lf`, pero **esto se queda igualmente**:
# aquello depende de que la configuración de Git esté bien en la máquina de quien
# construya, y esto no depende de nadie. La imagen queda sana venga de donde
# venga el archivo.
RUN sed -i 's/\r$//' /usr/local/bin/respaldo.sh /usr/local/bin/restaurar.sh \
 && chmod +x /usr/local/bin/respaldo.sh /usr/local/bin/restaurar.sh

# `bash` y no `sh`: el script usa `set -o pipefail`, que el `dash` de Debian no
# implementa. Sin esto, un `pg_dump` roto subiría un archivo truncado y el job
# saldría en verde — que es justo lo que este respaldo existe para evitar.
ENTRYPOINT ["/bin/bash", "/usr/local/bin/respaldo.sh"]
