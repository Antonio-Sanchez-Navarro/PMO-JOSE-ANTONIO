# @pmo/web — el tablero

React + Vite + Tailwind. Se sirve desde Firebase Hosting (`pmo-dashboard-503418`)
en `https://app.pmo-app.com` y en `https://pmo-dashboard-503418.web.app`.

## Desarrollo

```bash
npm install
npm run dev        # http://127.0.0.1:5173, con /api y /socket.io hacia localhost:3000
npm test
npm run lint
```

## Publicar: solo desde el CI

**Publicar el frontend a mano está prohibido** desde el 2026-10-05 (decisión del
Jefe, encargo I.1). La única excepción es la marcha atrás de emergencia de abajo.

Publica el workflow **«Publicar frontend en Firebase Hosting»**
(`.github/workflows/publicar-frontend.yml`) cuando el CI de `master` sale en verde.
Antes de publicar comprueba que `version.json` es el commit aprobado y que el
bundle apunta a la API de `VITE_API_URL`. Después comprueba, en los dos dominios,
`version.json`, el bundle servido y las cabeceras de seguridad. Si algo falla,
sale en rojo y avisa al chat.

- **La URL de la API** sale de la variable de repositorio `VITE_API_URL`, no de
  `.env.production`. Para cambiarla: `gh variable set VITE_API_URL --body <url>` y
  lanzar el workflow a mano («Run workflow» en Actions). Si apunta a `pmo-app.com`
  y `api.pmo-app.com` no responde, el workflow no publica.
- **El interruptor** es `PUBLICAR_FRONTEND_DESDE_CI` (`true`). Apagarlo para el
  workflow sin tocar el código.

**Por qué:** publicando a mano llegaron a producción un `.env.production` que
apuntaba a un dominio inexistente (24-09) y un `version.json` con el commit
equivocado (01-10). Ninguna de las dos cosas pasa por el CI.

## Marcha atrás de emergencia

1. **Primero, sin construir nada:** consola de Firebase → Hosting → historial de
   versiones → en la versión buena, «⋮» → **Revertir**. Es instantáneo, y lo
   servido vuelve a ser algo que ya pasó por las comprobaciones.
2. **Solo si eso no sirve**, publicar a mano desde un `master` limpio y empujado:
   `npm --workspace @pmo/web run build` (falla si hay cambios sin commitear o si
   `HEAD` no está en GitHub), comprobar `apps/web/dist/version.json` y luego
   `npx firebase-tools deploy --only hosting`. Dejarlo escrito en `DOC.md` y
   arreglar el CI para que la siguiente publicación vuelva a salir de ahí.
