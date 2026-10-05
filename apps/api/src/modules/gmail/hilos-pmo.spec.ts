import { TOPE_DIAS_HILO, mensajesQueEntran } from './hilos-pmo';

const PMO = 'Label_PMO';
const AHORA = new Date('2026-10-05T12:00:00Z');
const hace = (dias: number) => String(AHORA.getTime() - dias * 24 * 3_600_000);

describe('mensajesQueEntran (I.2)', () => {
  it('un anterior a la etiqueta, uno etiquetado y dos respuestas sin etiqueta → entran tres, no cuatro', () => {
    const hilo = [
      { id: 'antes', labelIds: ['INBOX'], internalDate: hace(10) },
      { id: 'etiquetado', labelIds: ['INBOX', PMO], internalDate: hace(8) },
      { id: 'respuesta-jefe', labelIds: ['SENT'], internalDate: hace(6) },
      { id: 'respuesta-fuera', labelIds: ['INBOX'], internalDate: hace(2) },
    ];

    expect(mensajesQueEntran(hilo, PMO, AHORA)).toEqual(['etiquetado', 'respuesta-jefe', 'respuesta-fuera']);
  });

  it(`tope de ${TOPE_DIAS_HILO} días: nada más viejo entra, aunque esté etiquetado`, () => {
    const hilo = [
      { id: 'etiquetado-viejo', labelIds: [PMO], internalDate: hace(200) },
      { id: 'respuesta-vieja', labelIds: ['SENT'], internalDate: hace(91) },
      { id: 'respuesta-de-89', labelIds: ['INBOX'], internalDate: hace(89) },
      { id: 'respuesta-nueva', labelIds: ['INBOX'], internalDate: hace(1) },
    ];

    expect(mensajesQueEntran(hilo, PMO, AHORA)).toEqual(['respuesta-de-89', 'respuesta-nueva']);
  });

  it('un hilo sin ningún mensaje etiquetado no aporta nada', () => {
    expect(mensajesQueEntran([{ id: 'x', labelIds: ['INBOX'], internalDate: hace(1) }], PMO, AHORA)).toEqual([]);
  });

  it('los devuelve en orden de llegada y descarta los que vienen sin id o sin fecha', () => {
    const hilo = [
      { id: 'b', labelIds: [], internalDate: hace(1) },
      { id: 'a', labelIds: [PMO], internalDate: hace(3) },
      { id: null, labelIds: [PMO], internalDate: hace(4) },
      { id: 'sin-fecha', labelIds: [], internalDate: null },
    ];

    expect(mensajesQueEntran(hilo, PMO, AHORA)).toEqual(['a', 'b']);
  });
});
