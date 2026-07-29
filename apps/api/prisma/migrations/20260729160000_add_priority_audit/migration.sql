-- Auditoría de prioridad (deuda del Sprint 3, cerrada el 2026-07-29).
--
-- Tres columnas en `Task` y no una tabla aparte: `adjustPriority` nunca baja la
-- prioridad, solo escala, así que el último ajuste es la explicación vigente.
-- El tablero pide decenas de tarjetas para pintar una frase en cada una, y una
-- tabla relacional costaría un join de N filas o una petición por tarjeta.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "priorityReason" TEXT,
ADD COLUMN     "priorityAdjustedAt" TIMESTAMP(3),
ADD COLUMN     "priorityAdjustedFrom" "TaskPriority";
