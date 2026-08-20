/**
 * Genera `src/pdf/assets/fonts/embedded.ts` a partir de los .ttf vecinos.
 *
 * Por qué incrustar en base64 en vez de referenciar archivos:
 * el mismo módulo de fuentes se usa en Node (tests, `npm run pdf:preview`) y en
 * el navegador (descarga desde la aplicación). `fileURLToPath` no existe en el
 * navegador y la sintaxis `?url` de Vite no la entiende Node. Un data URI
 * funciona idéntico en ambos, sin condicionales de entorno y sin red.
 *
 * Se ejecuta a mano cuando cambien las tipografías: `node scripts/generateEmbeddedFonts.mjs`
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = fileURLToPath(new URL('../src/pdf/assets/fonts/', import.meta.url));
const ttfs = readdirSync(dir).filter((f) => f.endsWith('.ttf')).sort();

const entradas = ttfs.map((file) => {
  const nombre = path.basename(file, '.ttf').replace(/-/g, '_').toUpperCase();
  const b64 = readFileSync(path.join(dir, file)).toString('base64');
  return `export const ${nombre} =\n  'data:font/ttf;base64,${b64}';`;
});

const cabecera = `// ARCHIVO GENERADO — no editar a mano.
// Se regenera con: node scripts/generateEmbeddedFonts.mjs
//
// Las tipografías van incrustadas como data URI porque el mismo módulo se usa
// en Node (tests y vista previa) y en el navegador (descarga desde la app).
// Ver scripts/generateEmbeddedFonts.mjs para el razonamiento completo.


`;

writeFileSync(path.join(dir, 'embedded.ts'), cabecera + entradas.join('\n\n') + '\n');
console.log(`Incrustadas ${ttfs.length} tipografías: ${ttfs.join(', ')}`);
