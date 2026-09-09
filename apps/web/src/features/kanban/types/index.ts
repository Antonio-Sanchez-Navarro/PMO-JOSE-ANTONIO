/**
 * El vocabulario del tablero. **No se declara nada aquí**: se reexporta lo que
 * dice `@pmo/shared`, que es el contrato con el backend.
 *
 * Este archivo tenía su propia `interface Task`, envolviendo la de shared con
 * `Omit<SharedTask, 'id'> & { id: string }` para añadirle `aiConfidence`. Las
 * dos mitades sobraban:
 *
 * - El `Omit` y el `id: string` de vuelta eran un no-op — shared ya lo declara
 *   `string`—, así que solo servían para que el tipo *pareciera* distinto.
 * - `aiConfidence` lo emite el **backend** al materializar una propuesta
 *   aprobada, así que su sitio es el contrato, no una envoltura del frontend.
 *   Declararlo aquí es lo que hacía que el campo existiera para el tablero y no
 *   para nadie más.
 *
 * Los imports de los consumidores no cambian: siguen pidiendo `Task` a `../types`.
 */
export { TaskStatus, TaskPriority, TaskSource } from '@pmo/shared';
export type { Task } from '@pmo/shared';
