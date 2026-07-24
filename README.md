# PMO Dashboard

Sistema PMO integrado con **Gmail**, **WhatsApp** y **Copiloto de IA (Claude)**.
Tablero Kanban, extracción de tareas por IA y registro de tiempos.

- 📐 Diseño técnico: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- 🗺️ Plan de sprints: [`TASKS.md`](./TASKS.md)

## Estructura del monorepo

```
.
├── apps/
│   ├── api/            # Backend NestJS (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── modules/    # auth, gmail, tasks, ai, copilot, whatsapp, time-tracking
│   │   │   ├── common/     # guards, filtros, interceptores, utils
│   │   │   ├── config/     # configuración por entorno
│   │   │   └── main.ts
│   │   └── prisma/         # schema.prisma + migraciones
│   └── web/            # Frontend React + Vite + Tailwind
│       └── src/
│           ├── features/   # kanban, inbox, copilot, time-tracking
│           ├── components/ # UI reutilizable
│           ├── lib/        # api client, socket, helpers
│           └── pages/
├── packages/
│   └── shared/         # Tipos y enums compartidos (Status, Priority, DTOs)
├── docs/               # Documentación adicional
├── docker-compose.yml  # Postgres + Redis (+ api/web)
└── .env.example        # Variables de entorno de referencia
```

## Arranque local (una vez implementado)

```bash
cp .env.example .env         # completar credenciales
docker-compose up -d         # Postgres + Redis
# Backend
cd apps/api && npm install && npx prisma migrate dev && npm run start:dev
# Frontend
cd apps/web && npm install && npm run dev
```

## Servicios externos requeridos
Gmail API · Google OAuth2 · Google Pub/Sub · Anthropic Claude API · WhatsApp Business Cloud API (o Twilio).
Ver detalle en [`ARCHITECTURE.md`](./ARCHITECTURE.md#5-apis-y-servicios-externos-necesarios).
