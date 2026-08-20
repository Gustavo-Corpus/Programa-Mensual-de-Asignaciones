import { describe, it, expect } from 'vitest';
import { buildSlots } from '../../src/domain/slots';
import type { AssignmentType } from '../../src/domain/types';

function type(overrides: Partial<AssignmentType> & Pick<AssignmentType, 'id' | 'key' | 'order'>): AssignmentType {
  return {
    label: overrides.key,
    kind: 'PERSON',
    daysOfWeek: [1, 6],
    slotsPerDate: 1,
    icon: 'dot',
    active: true,
    ...overrides,
  };
}

describe('buildSlots', () => {
  describe('fechas del mes', () => {
    it('mes con 5 lunes y 4 sábados (junio 2026)', () => {
      const types = [type({ id: 't1', key: 'a', order: 1, daysOfWeek: [1, 6] })];
      const { dates } = buildSlots(2026, 6, types);
      expect(dates.length).toBe(9); // 5 lunes + 4 sábados = 9 fechas
      expect(dates.map((d) => d.d)).toEqual([1, 6, 8, 13, 15, 20, 22, 27, 29]);
    });

    it('mes con 4 lunes y 5 sábados (mayo 2026)', () => {
      const types = [type({ id: 't1', key: 'a', order: 1, daysOfWeek: [1, 6] })];
      const { dates } = buildSlots(2026, 5, types);
      expect(dates.length).toBe(9); // 4 mondays + 5 saturdays = 9 total dates
      expect(dates.map((d) => d.d)).toEqual([2, 4, 9, 11, 16, 18, 23, 25, 30]);
    });

    it('mes sin tipos activos → sin fechas', () => {
      const types = [type({ id: 't1', key: 'a', order: 1, active: false })];
      const { dates, slots } = buildSlots(2026, 8, types);
      expect(dates).toEqual([]);
      expect(slots).toEqual([]);
    });

    it('sin ningún tipo en absoluto → sin fechas', () => {
      const { dates, slots } = buildSlots(2026, 8, []);
      expect(dates).toEqual([]);
      expect(slots).toEqual([]);
    });
  });

  describe('un tipo solo-sábados no genera slots en lunes', () => {
    it('las fechas incluyen lunes (por el otro tipo) pero el tipo sábado-solo no crea slot ahí', () => {
      const types = [
        type({ id: 't1', key: 'personas', order: 1, daysOfWeek: [1, 6] }),
        type({ id: 't2', key: 'hospitalidad', order: 2, kind: 'GROUP', daysOfWeek: [6] }),
      ];
      const { dates, slots } = buildSlots(2026, 8, types);

      // Agosto 2026 tiene lunes y sábados en `dates` (unión de ambos tipos).
      expect(dates.some((d) => d.d === 3)).toBe(true); // lunes 3 de agosto

      const mondaySlots = slots.filter((s) => s.date === '2026-08-03');
      expect(mondaySlots.map((s) => s.typeKey)).toEqual(['personas']);

      const saturdaySlots = slots.filter((s) => s.date === '2026-08-01');
      expect(saturdaySlots.map((s) => s.typeKey)).toEqual(['personas', 'hospitalidad']);
    });
  });

  describe('slotsPerDate', () => {
    it('slotsPerDate = 3 genera 3 casillas por fecha', () => {
      const types = [type({ id: 't1', key: 'aseo', order: 1, daysOfWeek: [6], slotsPerDate: 3 })];
      const { slots } = buildSlots(2026, 8, types);
      // Agosto 2026 tiene 5 sábados: 1, 8, 15, 22, 29
      expect(slots.length).toBe(15);
      const firstSaturday = slots.filter((s) => s.date === '2026-08-01');
      expect(firstSaturday.map((s) => s.slotIndex)).toEqual([0, 1, 2]);
    });
  });

  describe('tipos inactivos no generan slots', () => {
    it('un tipo inactivo no aparece en absoluto', () => {
      const types = [
        type({ id: 't1', key: 'activo', order: 1, daysOfWeek: [1] }),
        type({ id: 't2', key: 'inactivo', order: 2, daysOfWeek: [1], active: false }),
      ];
      const { slots } = buildSlots(2026, 8, types);
      expect(slots.every((s) => s.typeKey === 'activo')).toBe(true);
      expect(slots.length).toBeGreaterThan(0);
    });
  });

  describe('orden canónico exacto', () => {
    it('date asc, luego type.order asc (desempate type.key), luego slotIndex asc', () => {
      // Tipos deliberadamente declarados fuera de orden y con keys que
      // invertirían el resultado si el desempate por key no se aplicara.
      const types = [
        type({ id: 't3', key: 'zzz', order: 2, daysOfWeek: [6], slotsPerDate: 1 }),
        type({ id: 't1', key: 'aaa', order: 1, daysOfWeek: [6], slotsPerDate: 2 }),
        type({ id: 't2', key: 'bbb', order: 1, daysOfWeek: [6], slotsPerDate: 1 }),
      ];
      // Un solo sábado para simplificar: agosto 2026, día 1.
      const { slots } = buildSlots(2026, 8, types);
      const firstSaturdaySlots = slots.filter((s) => s.date === '2026-08-01');

      expect(firstSaturdaySlots.map((s) => [s.typeKey, s.slotIndex])).toEqual([
        ['aaa', 0],
        ['aaa', 1],
        ['bbb', 0],
        ['zzz', 0],
      ]);
    });

    it('el orden no depende del orden de entrada de assignmentTypes', () => {
      const types = [
        type({ id: 't3', key: 'zzz', order: 2, daysOfWeek: [6] }),
        type({ id: 't1', key: 'aaa', order: 1, daysOfWeek: [6] }),
        type({ id: 't2', key: 'bbb', order: 1, daysOfWeek: [6] }),
      ];
      const shuffled = [types[1]!, types[2]!, types[0]!];

      const a = buildSlots(2026, 8, types);
      const b = buildSlots(2026, 8, shuffled);

      expect(a.slots).toEqual(b.slots);
    });

    it('fechas ascendentes', () => {
      const types = [type({ id: 't1', key: 'a', order: 1, daysOfWeek: [1, 6] })];
      const { slots } = buildSlots(2026, 8, types);
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i]!.date >= slots[i - 1]!.date).toBe(true);
      }
    });
  });

  describe('campos del slot', () => {
    it('cada slot lleva date, dayOfWeek, typeKey, typeOrder, kind y slotIndex correctos', () => {
      const types = [type({ id: 't1', key: 'aseo', order: 5, kind: 'GROUP', daysOfWeek: [6], slotsPerDate: 1 })];
      const { slots } = buildSlots(2026, 8, types);
      expect(slots[0]).toEqual({
        date: '2026-08-01',
        dayOfWeek: 6,
        typeKey: 'aseo',
        typeOrder: 5,
        kind: 'GROUP',
        slotIndex: 0,
      });
    });
  });
});
