/**
 * Añade los matchers de `jest-dom` (`toBeInTheDocument`, `toBeDisabled`…) al
 * `expect` de Vitest, con sus tipos.
 *
 * El import es `/vitest` y no la raíz: la raíz registra los matchers contra el
 * `expect` global de Jest, que aquí no existe, y las aserciones fallarían con
 * un «no es una función» que no se parece en nada a la causa.
 */
import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Desmontar lo pintado después de cada prueba.
 *
 * ⚠️ **Testing Library hace esto sola, pero solo si encuentra un `afterEach`
 * global** — y esta configuración corre con `globals: false`, así que no lo
 * encuentra y no registra nada.
 *
 * Sin esta línea, cada `render` **se suma** al documento anterior en vez de
 * reemplazarlo, y los fallos que salen no se parecen a la causa: una consulta
 * encuentra dos elementos donde debería haber uno, o `queryBy…` devuelve algo
 * que pintó la prueba de antes. Se persigue el componente y el problema estaba
 * en el andamio.
 */
afterEach(cleanup);
