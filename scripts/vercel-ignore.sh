#!/bin/bash
P=$VERCEL_GIT_PREVIOUS_SHA
C=$VERCEL_GIT_COMMIT_SHA

# Si el commit previo está vacío o no existe en el clon superficial de Vercel, forzamos compilación.
if [ -z "$P" ] || ! git cat-file -e "$P^{commit}" 2>/dev/null; then
  exit 1
fi

# Comparamos el commit previo con el actual. Si solo cambian archivos ignorados (.md), no compilamos.
git diff --quiet "$P" "$C" -- \
  ':(top)apps/web' \
  ':(top)packages/shared' \
  ':(top)vercel.json' \
  ':(exclude)**/*.md'
