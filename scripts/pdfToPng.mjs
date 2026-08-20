/**
 * Rasteriza el PDF de vista previa a PNG para poder revisarlo a ojo.
 *
 * Existe porque comprobar el PDF solo con extracción de texto y número de
 * páginas deja fuera todo lo visual: una etiqueta recortada, un color lavado o
 * un icono desbordado pasan los tests y se ven fatal en la hoja impresa.
 *
 *   node scripts/pdfToPng.mjs [entrada.pdf] [escala]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

const entrada = process.argv[2] ?? 'dist-preview/programa.pdf';
const escala = Number(process.argv[3] ?? 2);
const salidaDir = 'dist-preview';

const parser = new PDFParse({ data: readFileSync(entrada) });
try {
  const resultado = await parser.getScreenshot({ scale: escala });
  mkdirSync(salidaDir, { recursive: true });
  for (const pagina of resultado.pages) {
    const base = path.basename(entrada, '.pdf');
    const destino = path.join(salidaDir, `${base}-p${pagina.pageNumber}.png`);
    const datos = pagina.data ?? pagina.dataUrl?.split(',')[1];
    writeFileSync(destino, Buffer.from(datos, typeof datos === 'string' ? 'base64' : undefined));
    console.log(`Página ${pagina.pageNumber} → ${destino}`);
  }
} finally {
  await parser.destroy();
}
