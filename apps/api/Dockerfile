# syntax=docker/dockerfile:1
#
# Imagen de @pmo/api para Cloud Run.
#
# **Se construye desde la RAÍZ del monorepo, no desde esta carpeta**:
#
#     docker build -f apps/api/Dockerfile -t pmo-api .
#
# El `package-lock.json` vive en la raíz y describe los tres workspaces a la
# vez; con el contexto puesto en `apps/api` no se alcanza, y `npm ci` —que
# existe precisamente para instalar exactamente lo que dice el lockfile— no
# tendría lockfile que obedecer.
#
# Tres etapas y cada una existe por una razón distinta:
#
#   builder  compila. Necesita las dependencias de desarrollo (TypeScript, la
#            CLI de Nest) que no queremos ver en la imagen final.
#   deps     resuelve el árbol de producción **desde cero**. No se poda el del
#            builder: `npm prune` deja atrás lo que ya se hoisteó y el resultado
#            depende del orden en que se instalaron las cosas.
#   runtime  solo recibe copias. No instala, no compila y no tiene con qué.

ARG NODE_VERSION=22-bookworm-slim

########################  Base común  ########################
FROM node:${NODE_VERSION} AS base

# OpenSSL lo pide el motor de consultas de Prisma. La imagen `slim` no lo trae,
# y sin él el fallo aparece **en el primer arranque**, no al construir: el
# contenedor se cae diciendo que no encuentra el motor para
# `debian-openssl-3.0.x`. `ca-certificates` es para las llamadas salientes
# (Google, Anthropic) que si no fallan en la verificación del certificado.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

########################  Etapa 1 — compilación  ########################
FROM base AS builder

# Los manifiestos primero y el código después: mientras no cambien las
# dependencias, Docker reutiliza la capa del `npm ci`, que es la cara. Si se
# copiara todo de golpe, cualquier cambio de una línea de código volvería a
# instalar el árbol entero.
#
# El `package.json` del frontend entra aunque su código no: `npm ci` compara el
# lockfile con **todos** los workspaces declarados en la raíz y se planta si le
# falta uno.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci

# `tsconfig.base.json` va aparte y **es obligatorio**: los dos tsconfig de
# `packages/shared` lo extienden con `../../tsconfig.base.json`. Sin él, `tsc`
# no falla por el archivo que falta y ya está —cae a sus valores por defecto,
# entre ellos un `target` antiguo, y se pone a type-checkear `node_modules`
# entero—. El error que sale entonces habla de identificadores privados en las
# definiciones de ESLint y no menciona el fichero ausente hasta la primera
# línea, que queda sepultada.
COPY tsconfig.base.json ./

COPY packages/shared packages/shared
COPY apps/api apps/api

# `build:shared` va antes a propósito: `@pmo/api` importa de `@pmo/shared` por
# el `main` de su package.json, que apunta a `dist/`. Sin compilarlo antes, el
# type-check de la API resuelve tipos que todavía no existen.
#
# El `prebuild` de `@pmo/api` ejecuta `prisma generate`, que aquí no es
# opcional: el cliente es código generado y esta imagen parte de un `npm ci`
# limpio donde no lo ha generado nadie.
# **El heap ampliado no es opcional aquí.** Los tipos de `googleapis` son
# enormes y `tsc` los carga enteros; con el heap por defecto el proceso muere
# con `Aborted (core dumped)` y código 134, que se lee como un fallo del
# compilador y no como lo que es: falta de memoria. En una máquina de
# desarrollo no pasa porque Node dimensiona el heap según la RAM del equipo, y
# dentro del contenedor esa RAM es la que le hayan dado.
#
# Es el mismo motivo por el que `start:dev` lleva `--max-old-space-size=4096`
# desde hace meses; lo que faltaba era que `build` lo tuviera también.
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build:shared \
 && NODE_OPTIONS=--max-old-space-size=4096 npm --workspace @pmo/api run build

########################  Etapa 2 — árbol de producción  ########################
FROM base AS deps

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Solo la API y lo que ella usa. Sin acotar los workspaces entrarían también las
# dependencias de producción del frontend —React, Recharts, dnd-kit—, que en una
# imagen de backend no pintan nada: son del bundle que sirve Vite, no del
# proceso de Node.
RUN npm ci --omit=dev \
      --include-workspace-root \
      --workspace @pmo/api \
      --workspace @pmo/shared

# El cliente de Prisma se genera **en este árbol**, no se copia del builder: el
# de allí se generó junto a dependencias de desarrollo y con otro hoisting, así
# que traerlo sería copiar rutas que aquí no existen.
COPY apps/api/prisma apps/api/prisma
RUN npm --workspace @pmo/api exec -- prisma generate

########################  Etapa 3 — lo que se despliega  ########################
FROM base AS runtime

# `production` es lo que enciende el formato de log de Cloud Logging y sube el
# nivel a `info`. Se puede pisar con `LOG_FORMAT=pretty` y `LOG_LEVEL=debug`
# sin reconstruir la imagen, que es justo para lo que existen esas variables.
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules

# **Y el `node_modules` anidado de la API, que no es redundante.** npm hoistea a
# la raíz lo que puede, pero deja abajo lo que no le cuadra: aquí baja
# `@nestjs/terminus`, porque su rango de pares no coincide con el `@nestjs/*`
# hoisteado. Copiando solo la raíz, la imagen construye, arranca y **se cae en
# el primer `require`** con `Cannot find module '@nestjs/terminus'` —el módulo
# de las sondas de salud, justo lo que Cloud Run llama para decidir si la
# revisión está viva—.
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules

COPY --from=deps /repo/apps/api/prisma ./apps/api/prisma

# Los manifiestos hacen falta en tiempo de ejecución: `@pmo/shared` se resuelve
# por el `main` del suyo, y el de la API es lo que hace que `npm --workspace`
# siga funcionando dentro del contenedor (migraciones, diagnóstico).
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

COPY --from=builder /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder /repo/apps/api/dist ./apps/api/dist

# La imagen de Node trae un usuario `node` sin privilegios. Sin esta línea el
# proceso corre como root, que en un contenedor que ejecuta código de terceros
# —y que habla con un modelo de lenguaje— no hace falta para nada.
USER node

# Documental: Cloud Run **inyecta `PORT`** y `main.ts` lo lee antes que
# `API_PORT`. Este `EXPOSE` es para quien levante la imagen a mano.
EXPOSE 8080

# Sin `npm start` por medio: npm se quedaría como PID 1 y **no reenvía las
# señales**, así que el `SIGTERM` con el que Cloud Run avisa de que va a apagar
# la revisión no llegaría a Node. Sin ese aviso no corre el cierre ordenado
# —`enableShutdownHooks()` en `main.ts`— y las conexiones de Prisma se cortan a
# lo bruto en cada despliegue.
CMD ["node", "apps/api/dist/main.js"]
