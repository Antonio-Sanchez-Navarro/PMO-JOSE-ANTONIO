#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Cambia algo que se despliega entre lo que hay en producción y este commit?
#
#   uso: hay-que-desplegar.sh <commit desplegado> <commit aprobado por el CI>
#
# Escribe `desplegar=true|false` en $GITHUB_OUTPUT y explica por qué en el log.
#
# Lo usan `deploy.yml` (la API) y `publicar-frontend.yml` desde que el CI corre
# **siempre**, también en commits de solo documentación (remate de las 18:30 del
# 05-10): el CI será el check obligatorio de C12, y un check que se salta deja
# la fusión bloqueada. Lo que se salta ahora es el despliegue.
#
# Se compara contra lo que **sirve producción** (`/health` de la API,
# `version.json` del frontend), no contra el commit anterior: un push puede
# traer varios commits, y una publicación que falló deja producción atrás.
#
# Ante la duda, se despliega: si no se sabe qué hay desplegado, o lo desplegado
# no es antecesor de este commit (una marcha atrás, por ejemplo).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DESPLEGADO="${1:-}"
COMMIT="$2"

decidir() {
  echo "desplegar=$1" >> "${GITHUB_OUTPUT}"
  echo "$2"
}

if [ -z "${DESPLEGADO}" ]; then
  decidir true "No se sabe qué commit sirve producción: se despliega."
  exit 0
fi

if ! git cat-file -e "${DESPLEGADO}^{commit}" 2>/dev/null; then
  decidir true "Producción sirve ${DESPLEGADO}, que no está en este repositorio: se despliega."
  exit 0
fi

if ! git merge-base --is-ancestor "${DESPLEGADO}" "${COMMIT}"; then
  decidir true "Producción (${DESPLEGADO:0:7}) no es antecesor de ${COMMIT:0:7}: se despliega."
  exit 0
fi

CAMBIOS=$(git diff --name-only "${DESPLEGADO}" "${COMMIT}")
if [ -z "${CAMBIOS}" ]; then
  decidir false "Producción ya sirve ${COMMIT:0:7}: no hay nada que desplegar."
  exit 0
fi

# La misma lista que filtraba el CI hasta el 05-10. `.github/**` NO entra: un
# cambio en los workflows tiene que probarse desplegando.
CODIGO=$(printf '%s\n' "${CAMBIOS}" | grep -vE '(\.md$|^docs/|^\.gitignore$|^\.editorconfig$|^LICENSE$)' || true)
if [ -z "${CODIGO}" ]; then
  decidir false "Entre ${DESPLEGADO:0:7} y ${COMMIT:0:7} solo cambia documentación: no se despliega."
else
  decidir true "Cambia algo más que documentación (p. ej. $(printf '%s' "${CODIGO}" | head -1)): se despliega."
fi
