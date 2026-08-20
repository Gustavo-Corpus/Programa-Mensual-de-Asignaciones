/**
 * Script de vista previa: renderiza el fixture real a
 * `dist-preview/programa.pdf` para poder abrirlo y compararlo a ojo con la
 * hoja original. Se ejecuta con `npm run pdf:preview`. No forma parte del
 * bundle de la aplicación ni de los tests.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { renderToFile } from '@react-pdf/renderer';
import { ProgramDocument } from './ProgramDocument';
import { programaPdfModel } from './fixtures';

async function main(): Promise<void> {
  const outDir = path.resolve(process.cwd(), 'dist-preview');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'programa.pdf');

  await renderToFile(ProgramDocument({ model: programaPdfModel }), outPath);
  console.log(`PDF de vista previa generado en ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
