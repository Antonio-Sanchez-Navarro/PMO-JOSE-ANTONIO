# Handoff Document - Sprint 2 (Frontend)

¡Hola Claude! Aquí Gemini (desde la terminal de Backend). He preparado la infraestructura en NestJS para la bandeja de entrada (Inbox). Tu misión ahora es consumir este endpoint desde el Frontend (React + Vite) y construir la interfaz gráfica de la bandeja de entrada.

## Endpoints Disponibles

### 1. `GET /auth/me`
Ya está implementado desde el Sprint 1. Te permite verificar la sesión activa del usuario.
- **Autenticación**: Requiere la cookie `pmo_session` (gestionada automáticamente por el navegador).
- **Respuesta Exitosa (200 OK)**:
  ```json
  {
    "id": "cuid...",
    "email": "usuario@gmail.com",
    "name": "Nombre Usuario",
    "role": "owner",
    "hasGoogleTokens": true
  }
  ```

> ⚠️ **Corrección**: una versión previa de este documento hablaba de una cookie
> `session_id`. Esa implementación fue reemplazada al consolidar el Sprint 1.
> El esquema vigente son **dos** cookies httpOnly con `path: "/"`:
>
> | Cookie | Contenido | Vigencia |
> |---|---|---|
> | `pmo_session` | JWT de acceso (`typ: "access"`) | 15 min |
> | `pmo_refresh` | JWT de refresco (`typ: "refresh"`) | 30 días |
>
> Cuando el acceso expira, la API responde 401 y el frontend renueva con
> `POST /auth/refresh`; `POST /auth/logout` borra ambas. El claim `typ` impide
> que un refresh se use como token de acceso.

### 2. `GET /api/gmail/inbox`
Nuevo endpoint del Sprint 2 para obtener los correos de la bandeja de entrada.
- **URL Base Sugerida en Dev**: `http://localhost:3000/gmail/inbox` (Asegúrate de prefijarlo o usar el proxy configurado en Vite).
- **Query Params (Opcional)**: `?maxResults=20` (por defecto trae 20 correos).
- **Autenticación**: Requiere la cookie de sesión `pmo_session` (enviar peticiones con `credentials: 'include'`).
- **Contrato interno**: el `AuthGuard` deja el usuario en `req.user` como
  `{ userId, email }` — usa `user.userId`, **no** `user.id` (ver `auth.types.ts`).
- **Esquema de Respuesta JSON (200 OK)**:
  Devuelve un array de objetos tipo `EmailSnippet`:

  ```typescript
  [
    {
      "id": "18f0a...",
      "threadId": "18f0a...",
      "snippet": "Hola, te escribo para confirmar la reunión del viernes...",
      "from": "Juan Perez <juan@example.com>",
      "subject": "Reunión de Proyecto",
      "date": "Fri, 24 Jul 2026 15:30:00 -0500"
    },
    // ... más correos
  ]
  ```

## Tu Misión (Terminal Claude)
1. **Verificar Sesión**: Utiliza el endpoint `/auth/me` para determinar si el usuario está logueado y guárdalo en tu estado global o hook (e.g., `useSession`).
2. **Pantalla de Inbox**: Crea la vista principal (e.g. `apps/web/src/pages/Inbox.tsx`) que haga fetch a `/api/gmail/inbox` al montar el componente (con React Query o `useEffect`).
3. **UI/UX**: Renderiza la lista de correos usando TailwindCSS, basándote en la interfaz de un cliente de correo moderno (remitente, asunto, snippet truncado y fecha formateada de forma legible).

> **Nota**: El backend ya se encarga de renovar los tokens con Google de manera silenciosa si han expirado al llamar a este endpoint. ¡Solo tienes que consumir los datos!

---

## Estado tras la iteración de Frontend (terminal Claude)

- **Frontend entregado**: `apps/web/src/features/inbox/` — `InboxPage` + hook
  `useInbox`, con agrupación por `threadId` (hilos desplegables) y estados de
  carga / error / vacío. Verificado en el navegador con correos reales.
- **Refresco de tokens centralizado**: la lógica vive solo en
  `AuthService.getAuthorizedClient(userId)`. `GmailService` la consume; ya no
  duplica el descifrado ni el listener `tokens`. Si necesitas llamar a otra API
  de Google, usa ese método en lugar de construir un `OAuth2Client` propio.
- **Nota de tipos**: `googleapis-common` ancla su propia copia de
  `google-auth-library`, así que pasar nuestro `OAuth2Client` a `google.gmail()`
  exige un cast acotado. Está documentado en `gmail.service.ts`.
- **Pendiente para agrupar por etiqueta**: `GET /gmail/inbox` todavía no devuelve
  `labels`. En cuanto los incluyas en `EmailSnippet`, el frontend puede agrupar
  por etiqueta además de por hilo.
