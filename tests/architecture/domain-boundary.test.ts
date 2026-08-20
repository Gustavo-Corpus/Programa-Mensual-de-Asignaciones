import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// src/domain/ debe ser un núcleo puro: nada de React, Firebase ni UI. Solo
// puede depender de sí mismo y de date-fns. Eso es lo que garantiza que el
// algoritmo de generación sea una función pura, ejecutable en un test con
// datos literales, sin navegador y sin red.
//
// Este test es la red de seguridad real: la regla equivalente de ESLint se
// puede silenciar con un comentario y nadie se entera.

const PAQUETES_PERMITIDOS = ['date-fns'];

const DOMAIN_DIR = fileURLToPath(new URL('../../src/domain', import.meta.url));

function collectSourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

export function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];

  // import ... from '...'; export ... from '...'; import '...';
  const staticImportRe = /(?:import|export)(?:[^'"]*?from)?\s*['"]([^'"]+)['"]/g;
  // import('...')
  const dynamicImportRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const re of [staticImportRe, dynamicImportRe]) {
    for (const match of source.matchAll(re)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }

  return specifiers;
}

/**
 * `fromFile` es el archivo que contiene el import, necesario para resolver las
 * rutas relativas. Una ruta relativa NO basta con que lo sea: tiene que quedar
 * dentro de src/domain. `../data/firebase` es relativa y está prohibida.
 */
export function isAllowedSpecifier(specifier: string, fromFile: string): boolean {
  if (specifier.startsWith('.')) {
    const resolved = resolve(dirname(fromFile), specifier);
    return resolved === DOMAIN_DIR || resolved.startsWith(DOMAIN_DIR + sep);
  }
  // Se permiten los subcaminos del paquete: date-fns/locale, date-fns/fp, etc.
  return PAQUETES_PERMITIDOS.some((p) => specifier === p || specifier.startsWith(p + '/'));
}

describe('frontera de src/domain', () => {
  const archivos = collectSourceFiles(DOMAIN_DIR);

  it('ningún archivo del dominio importa fuera de la frontera', () => {
    const violaciones: string[] = [];

    for (const archivo of archivos) {
      for (const specifier of extractImportSpecifiers(readFileSync(archivo, 'utf-8'))) {
        if (!isAllowedSpecifier(specifier, archivo)) {
          violaciones.push(`${relative(process.cwd(), archivo)} importa "${specifier}"`);
        }
      }
    }

    expect(violaciones).toEqual([]);
  });
});

// Sin estos casos el test de arriba pasaría en vacío el día que el extractor de
// imports o el comprobador se rompieran, y nos quedaríamos sin frontera sin
// enterarnos. Aquí se verifica que el comprobador sabe decir que NO.
describe('el propio comprobador de frontera funciona', () => {
  const archivoFicticio = join(DOMAIN_DIR, 'generateProgram.ts');
  const archivoAnidado = join(DOMAIN_DIR, 'interno', 'ayuda.ts');

  it.each([
    ['./slots', archivoFicticio],
    ['./interno/ayuda', archivoFicticio],
    ['../dates', archivoAnidado],
    ['date-fns', archivoFicticio],
    ['date-fns/locale', archivoFicticio],
  ])('permite %s', (specifier, desde) => {
    expect(isAllowedSpecifier(specifier, desde)).toBe(true);
  });

  it.each([
    ['react', archivoFicticio],
    ['firebase/firestore', archivoFicticio],
    ['zod', archivoFicticio],
    ['@/data/firebase', archivoFicticio],
    // El caso que de verdad importa: relativo, pero fuera del dominio.
    ['../data/firebase', archivoFicticio],
    ['../../src/pdf/theme', archivoFicticio],
    ['../../data/firebase', archivoAnidado],
  ])('rechaza %s', (specifier, desde) => {
    expect(isAllowedSpecifier(specifier, desde)).toBe(false);
  });

  it('extrae los distintos tipos de import', () => {
    const fuente = [
      "import { a } from './a';",
      'import type { B } from "./b";',
      "export { c } from './c';",
      "import './efecto';",
      "const d = await import('./d');",
    ].join('\n');

    expect(extractImportSpecifiers(fuente).sort()).toEqual([
      './a',
      './b',
      './c',
      './d',
      './efecto',
    ]);
  });
});
