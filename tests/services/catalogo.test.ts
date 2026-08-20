import { describe, expect, it } from 'vitest';
import {
  claveDuplicada,
  claveResponsabilidadSchema,
  equiposMalFormados,
  gruposHuerfanos,
  mensajeCambioKind,
  nombreDuplicado,
  sinDiasDeSemana,
} from '@/services/catalogoService';
import type { AssignmentType, Group, Team } from '@/domain/types';

// Reglas de catálogo que no son una validación de campo suelta. Se prueban
// como funciones puras, sin React ni Firebase de por medio.

describe('nombreDuplicado', () => {
  const existentes = [
    { id: 'p1', name: 'Ana Ruiz' },
    { id: 'p2', name: '  Beto Sosa  ' },
  ];

  it('detecta un nombre igual', () => {
    expect(nombreDuplicado('Ana Ruiz', existentes, null)).toBe(true);
  });

  it('ignora mayúsculas/minúsculas y espacios sobrantes', () => {
    expect(nombreDuplicado('  ana RUIZ  ', existentes, null)).toBe(true);
  });

  it('no se considera duplicado de sí misma al editar', () => {
    expect(nombreDuplicado('Ana Ruiz', existentes, 'p1')).toBe(false);
  });

  it('un nombre nuevo no es duplicado', () => {
    expect(nombreDuplicado('Caro Diez', existentes, null)).toBe(false);
  });

  it('una cadena vacía o solo espacios nunca es "duplicada"', () => {
    expect(nombreDuplicado('   ', existentes, null)).toBe(false);
  });

  it('compara también contra entidades desactivadas (nunca se borran)', () => {
    // La lista de "existentes" que recibe la función puede incluir
    // inactivas: es responsabilidad de quien llama pasarlas todas.
    expect(nombreDuplicado('Beto Sosa', existentes, null)).toBe(true);
  });
});

describe('equiposMalFormados', () => {
  const groups: Group[] = [
    { id: 'g1', name: '1', teamId: 'e1', order: 1, active: true },
    { id: 'g5', name: '5', teamId: 'e1', order: 2, active: true },
    { id: 'g2', name: '2', teamId: 'e2', order: 1, active: true },
    { id: 'g6', name: '6', teamId: 'e2', order: 2, active: false },
    { id: 'g3', name: '3', teamId: 'e3', order: 1, active: false },
  ];

  it('un equipo con exactamente 2 grupos activos no aparece', () => {
    const teams: Team[] = [{ id: 'e1', displayName: null, order: 1, active: true }];
    expect(equiposMalFormados(teams, groups)).toEqual([]);
  });

  it('un equipo activo con 1 solo grupo activo se reporta', () => {
    const teams: Team[] = [{ id: 'e2', displayName: null, order: 2, active: true }];
    expect(equiposMalFormados(teams, groups)).toEqual([{ teamId: 'e2', gruposActivos: 1 }]);
  });

  it('un equipo activo sin ningún grupo activo se reporta con 0', () => {
    const teams: Team[] = [{ id: 'e3', displayName: null, order: 3, active: true }];
    expect(equiposMalFormados(teams, groups)).toEqual([{ teamId: 'e3', gruposActivos: 0 }]);
  });

  it('un equipo inactivo nunca se reporta, mal formado o no', () => {
    const teams: Team[] = [{ id: 'e3', displayName: null, order: 3, active: false }];
    expect(equiposMalFormados(teams, groups)).toEqual([]);
  });

  it('un equipo con 3 grupos activos también se reporta (arquitectura.md lo permite pero avisa)', () => {
    const conTres: Group[] = [...groups, { id: 'g9', name: '9', teamId: 'e1', order: 3, active: true }];
    const teams: Team[] = [{ id: 'e1', displayName: null, order: 1, active: true }];
    expect(equiposMalFormados(teams, conTres)).toEqual([{ teamId: 'e1', gruposActivos: 3 }]);
  });
});

describe('gruposHuerfanos', () => {
  const teams: Team[] = [{ id: 'e1', displayName: null, order: 1, active: true }];

  it('un grupo activo cuyo teamId no existe es huérfano', () => {
    const groups: Group[] = [{ id: 'g1', name: '1', teamId: 'fantasma', order: 1, active: true }];
    expect(gruposHuerfanos(groups, teams)).toEqual(groups);
  });

  it('un grupo activo con teamId válido no es huérfano', () => {
    const groups: Group[] = [{ id: 'g1', name: '1', teamId: 'e1', order: 1, active: true }];
    expect(gruposHuerfanos(groups, teams)).toEqual([]);
  });

  it('un grupo INACTIVO con teamId inexistente no se reporta (ya está fuera del generador)', () => {
    const groups: Group[] = [{ id: 'g1', name: '1', teamId: 'fantasma', order: 1, active: false }];
    expect(gruposHuerfanos(groups, teams)).toEqual([]);
  });

  it('un teamId que apunta a un equipo inactivo NO es huérfano (el equipo existe)', () => {
    const teamsConInactivo: Team[] = [{ id: 'e9', displayName: null, order: 1, active: false }];
    const groups: Group[] = [{ id: 'g1', name: '1', teamId: 'e9', order: 1, active: true }];
    expect(gruposHuerfanos(groups, teamsConInactivo)).toEqual([]);
  });
});

describe('claveResponsabilidadSchema', () => {
  it('acepta minúsculas, dígitos y guion bajo', () => {
    expect(claveResponsabilidadSchema.safeParse('acomodador_entrada_2').success).toBe(true);
  });

  it('rechaza mayúsculas', () => {
    expect(claveResponsabilidadSchema.safeParse('Acomodador').success).toBe(false);
  });

  it('rechaza espacios y guiones normales', () => {
    expect(claveResponsabilidadSchema.safeParse('acomodador entrada').success).toBe(false);
    expect(claveResponsabilidadSchema.safeParse('acomodador-entrada').success).toBe(false);
  });

  it('rechaza cadena vacía', () => {
    expect(claveResponsabilidadSchema.safeParse('').success).toBe(false);
  });

  it('rechaza más de 40 caracteres', () => {
    expect(claveResponsabilidadSchema.safeParse('a'.repeat(41)).success).toBe(false);
  });

  it('acepta exactamente 40 caracteres', () => {
    expect(claveResponsabilidadSchema.safeParse('a'.repeat(40)).success).toBe(true);
  });
});

describe('claveDuplicada', () => {
  const existentes: AssignmentType[] = [
    {
      id: 't1',
      key: 'aseo',
      label: 'Aseo',
      kind: 'GROUP',
      daysOfWeek: [1, 6],
      slotsPerDate: 1,
      order: 5,
      icon: 'broom',
      active: true,
    },
    {
      id: 't2',
      key: 'hospitalidad',
      label: 'Hospitalidad',
      kind: 'GROUP',
      daysOfWeek: [6],
      slotsPerDate: 1,
      order: 6,
      icon: 'hands-heart',
      active: false,
    },
  ];

  it('detecta una key ya usada por una responsabilidad activa', () => {
    expect(claveDuplicada('aseo', existentes)).toBe(true);
  });

  it('detecta una key ya usada por una responsabilidad INACTIVA (la clave sigue reservada)', () => {
    expect(claveDuplicada('hospitalidad', existentes)).toBe(true);
  });

  it('una key nueva no es duplicada', () => {
    expect(claveDuplicada('acomodador_entrada', existentes)).toBe(false);
  });
});

describe('sinDiasDeSemana', () => {
  it('true cuando el arreglo está vacío', () => {
    expect(sinDiasDeSemana([])).toBe(true);
  });

  it('false cuando hay al menos un día marcado', () => {
    expect(sinDiasDeSemana([1])).toBe(false);
    expect(sinDiasDeSemana([0, 1, 2, 3, 4, 5, 6])).toBe(false);
  });
});

describe('mensajeCambioKind', () => {
  it('menciona "personas" al cambiar a PERSON', () => {
    expect(mensajeCambioKind('PERSON')).toContain('personas');
  });

  it('menciona "equipos" al cambiar a GROUP', () => {
    expect(mensajeCambioKind('GROUP')).toContain('equipos');
  });

  it('siempre advierte que las asignaciones guardadas no se convierten', () => {
    expect(mensajeCambioKind('PERSON')).toMatch(/no se convierten/i);
    expect(mensajeCambioKind('GROUP')).toMatch(/no se convierten/i);
  });
});
