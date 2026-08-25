-- Lo que se consume de las APIs de modelos, por día y por modelo.
--
-- Hasta hoy no se registraba nada: cada llamada devolvía su `usage` y se
-- tiraba. Se vigilaba lo que el sistema hace y no lo que consume — y de las dos
-- formas de que esto se pare un martes por la mañana, la segunda es la más
-- probable: quedan ~$8 de crédito en Anthropic y nadie los mira.
--
-- **Una fila por día y modelo, no una por llamada.** Lo que hace falta es el
-- ritmo ("cuánto queda al paso actual"), no la auditoría. Una fila por llamada
-- serían miles al mes, caras de sumar, para responder a una pregunta que no
-- necesita ese detalle.
--
-- **El modelo se guarda con su id exacto y no por familia**: los precios
-- difieren entre modelos —y el de Sonnet 5 sube un 50 % el 31-08, cuando acaba
-- su precio de lanzamiento—, así que agregarlos haría imposible estimar nada.
--
-- El índice único es lo que permite el `upsert` que incrementa: sin él, dos
-- workers a la vez crearían dos filas del mismo día y el total saldría partido.

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "llamadas" INTEGER NOT NULL DEFAULT 0,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_dia_model_key" ON "AiUsage"("dia", "model");
