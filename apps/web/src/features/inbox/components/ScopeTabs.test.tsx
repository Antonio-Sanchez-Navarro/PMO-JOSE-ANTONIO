import { fireEvent, render, screen, within } from '@testing-library/react';
import { BANCOS, TIPO_BANCO } from '@pmo/shared';
import { describe, expect, it, vi } from 'vitest';
import { ScopeTabs, bancosPorTipo } from './ScopeTabs';

describe('ScopeTabs · fila de bancos agrupada por tipo (B.3, opción A)', () => {
  it('parte la fila en tres grupos con su rótulo, en el orden acordado', () => {
    render(<ScopeTabs ambito={{ tipo: 'banco', valor: 'BIM' }} onChange={vi.fn()} />);

    const grupos = screen.getAllByRole('group');
    expect(grupos.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Banco tradicional',
      'Banco digital con tarjeta de crédito',
      'Financiera',
    ]);

    const bancosDe = (i: number) =>
      within(grupos[i]).getAllByRole('button').map((b) => b.textContent);
    expect(within(grupos[0]).getByText('Tradicional')).toBeTruthy();
    expect(bancosDe(0)).toEqual(['Banregio', 'Kapital', 'Santander', 'BIM']);
    expect(within(grupos[1]).getByText('Digital TDC')).toBeTruthy();
    expect(bancosDe(1)).toEqual(['Konfio', 'Clara']);
    expect(within(grupos[2]).getByText('Financiera')).toBeTruthy();
    expect(bancosDe(2)).toEqual(['Aspiria', 'PDN', 'Sahara']);
  });

  it('cada banco de BANCOS sale una vez, en el grupo de su tipo', () => {
    const grupos = bancosPorTipo();
    const todos = grupos.flatMap((g) => g.bancos);
    expect([...todos].sort()).toEqual([...BANCOS].sort());
    for (const grupo of grupos) {
      for (const banco of grupo.bancos) {
        expect(TIPO_BANCO[banco as keyof typeof TIPO_BANCO]).toBe(grupo.tipo);
      }
    }
  });

  it('pulsar un banco filtra por él', () => {
    const onChange = vi.fn();
    render(<ScopeTabs ambito={{ tipo: 'banco', valor: 'BIM' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sahara' }));

    expect(onChange).toHaveBeenCalledWith({ tipo: 'banco', valor: 'Sahara' });
  });

  it('fuera del ámbito de bancos no hay fila de bancos', () => {
    render(<ScopeTabs ambito={{ tipo: 'general' }} onChange={vi.fn()} />);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });
});
