/**
 * Salidas crudas del modelo, tal y como llegan en el `input` del bloque
 * `tool_use`. Alimentan las pruebas de `AiService.analyzeEmail`, que es donde
 * se valida la respuesta antes de tocar la base de datos.
 *
 * Los casos marcados como REGRESIÓN son capturas literales de producción, no
 * inventos: salieron del reproceso de la bandeja del 2026-07-25.
 */

/** Respuesta bien formada, con fecha límite resuelta. */
export const respuestaAccionable = {
  isActionable: true,
  category: 'PROJECT_MANAGEMENT',
  aiConfidence: 0.92,
  tasks: [
    {
      title: 'Enviar cotización actualizada de cimentación',
      description: 'El cliente necesita cerrar presupuesto.',
      priority: 'URGENT',
      tags: ['obra', 'presupuesto'],
      dueDate: '2026-07-24',
    },
  ],
};

/** Bien formada, sin fecha: `dueDate` debe quedar en null, no inventarse. */
export const respuestaSinFecha = {
  isActionable: true,
  category: 'OTHER',
  aiConfidence: 0.7,
  tasks: [
    {
      title: 'Enviar documentación corporativa a la notaría',
      description: 'Falta identificación del apoderado legal.',
      priority: 'HIGH',
      tags: ['legal'],
      dueDate: null,
    },
  ],
};

/** Bien formada, no accionable: sin tareas. */
export const respuestaNoAccionable = {
  isActionable: false,
  category: 'INFORMATIONAL',
  aiConfidence: 0.95,
  tasks: [],
};

/**
 * REGRESIÓN — categoría corrupta observada en producción.
 *
 * Cuando `category` era `type: string` libre, `strict: true` no la restringía y
 * la API aceptó este valor: fragmentos de la serialización de la herramienta
 * incrustados en el propio string (incluido un `aiConfidence` de 1.98, fuera de
 * rango). Hoy `category` es un `enum` y además se degrada a OTHER al parsear.
 */
export const respuestaCategoriaCorrupta = {
  isActionable: true,
  category:
    'antml:parameter name="categoryategory">ry:parameter>\nantml:parameter name="aiConfidence">1.98',
  aiConfidence: 1.98,
  tasks: [
    {
      title: 'Revisar comunicado',
      description: '',
      priority: 'MEDIUM',
      tags: [],
      dueDate: null,
    },
  ],
};

/** REGRESIÓN — la otra captura de producción: comillas sueltas antes del valor. */
export const respuestaCategoriaConBasura = {
  isActionable: false,
  category: '">OTHER',
  aiConfidence: 0.8,
  tasks: [],
};

/** Fecha no parseable: debe degradar a null, no romper el análisis. */
export const respuestaFechaInvalida = {
  isActionable: true,
  category: 'MEETING',
  aiConfidence: 0.6,
  tasks: [
    {
      title: 'Agendar reunión',
      description: '',
      priority: 'MEDIUM',
      tags: [],
      dueDate: 'el próximo martes',
    },
  ],
};

/** Prioridad fuera del enum: debe lanzar, no persistirse. */
export const respuestaPrioridadInvalida = {
  isActionable: true,
  category: 'OTHER',
  aiConfidence: 0.5,
  tasks: [
    { title: 'Algo', description: '', priority: 'CRITICAL', tags: [], dueDate: null },
  ],
};

/** Tarea sin título: debe lanzar. */
export const respuestaSinTitulo = {
  isActionable: true,
  category: 'OTHER',
  aiConfidence: 0.5,
  tasks: [{ title: '   ', description: '', priority: 'LOW', tags: [], dueDate: null }],
};
