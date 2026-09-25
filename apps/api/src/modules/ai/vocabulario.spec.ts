import { ALIAS_BANCO, BANCOS, TIPO_BANCO, TIPOS_BANCO, canonicoBanco } from '@pmo/shared';

/**
 * El vocabulario de bancos de `@pmo/shared` (decisión del Jefe, 2026-09-25).
 *
 * Vive en `shared`, pero se prueba aquí porque `shared` no tiene corredor de
 * pruebas propio y quien lo usa de verdad es la clasificación.
 */
describe('vocabulario de bancos', () => {
  it('son nueve, y son estos', () => {
    expect([...BANCOS].sort()).toEqual(
      ['Aspiria', 'BIM', 'Banregio', 'Clara', 'Kapital', 'Konfio', 'PDN', 'Sahara', 'Santander'].sort(),
    );
  });

  it('cada alias lleva a su banco', () => {
    expect(canonicoBanco('Banco Inmobiliario Mexicano')).toBe('BIM');
    expect(canonicoBanco('Portafolio de Negocios')).toBe('PDN');
    expect(canonicoBanco('Advantech')).toBe('Aspiria');
    expect(canonicoBanco('Advantech Servicios Financieros')).toBe('Aspiria');
    expect(canonicoBanco('Sahara Mezzanine')).toBe('Sahara');
  });

  it('los alias no distinguen mayúsculas ni espacios de más', () => {
    expect(canonicoBanco('  BANCO   INMOBILIARIO mexicano ')).toBe('BIM');
  });

  it('lo que no está ni en la lista ni en los alias es null, no «el más parecido»', () => {
    expect(canonicoBanco('Banorte')).toBeNull();
    expect(canonicoBanco('Banorte/Ixe')).toBeNull();
    expect(canonicoBanco('Banamex')).toBeNull();
    expect(canonicoBanco('Banco Inmobiliario')).toBeNull();
    expect(canonicoBanco(42)).toBeNull();
  });

  it('todo alias apunta a un banco de la lista', () => {
    for (const banco of Object.values(ALIAS_BANCO)) {
      expect(BANCOS).toContain(banco);
    }
  });

  it('todo banco de BANCOS tiene tipo, y ninguno sobra', () => {
    // Si se añade un banco a BANCOS sin tipo, esta es la prueba que falla: en
    // pantalla quedaría fuera de toda agrupación.
    for (const banco of BANCOS) {
      expect(TIPOS_BANCO).toContain(TIPO_BANCO[banco]);
    }
    expect(Object.keys(TIPO_BANCO).sort()).toEqual([...BANCOS].sort());
  });

  it('la tabla de tipos es la que confirmó el Jefe', () => {
    const por = (tipo: string) => BANCOS.filter((b) => TIPO_BANCO[b] === tipo).sort();
    expect(por('Banco tradicional')).toEqual(['BIM', 'Banregio', 'Kapital', 'Santander']);
    expect(por('Banco digital con tarjeta de crédito')).toEqual(['Clara', 'Konfio']);
    expect(por('Financiera')).toEqual(['Aspiria', 'PDN', 'Sahara']);
  });
});
