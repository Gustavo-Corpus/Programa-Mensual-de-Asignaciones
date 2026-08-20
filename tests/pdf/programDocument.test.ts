import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFParse } from 'pdf-parse';
import { ProgramDocument } from '@/pdf/ProgramDocument';
import {
  programaPdfModel,
  programaPdfModelLargo,
  programaPdfModelMesCompleto,
} from '@/pdf/fixtures';
import type { ProgramPdfModel, PdfCell, PdfColumn } from '@/pdf/model';

const emptyCell: PdfCell = { lines: [] };

/** Construye un modelo con el número de columnas indicado, reutilizando las semanas del fixture real. */
function modelWithColumnCount(count: number): ProgramPdfModel {
  const columns: PdfColumn[] = Array.from({ length: count }, (_, i) => ({
    typeKey: `tipo_${i}`,
    label: `COLUMNA ${i + 1}`,
    icon: 'dot',
  }));
  return {
    ...programaPdfModel,
    columns,
    weeks: programaPdfModel.weeks.map((card) => ({
      rows: card.rows.map((row) => ({
        ...row,
        cells: Array.from({ length: count }, (_, i) => row.cells[i % row.cells.length] ?? emptyCell),
      })),
    })),
  };
}

/** Construye un modelo donde todas las celdas de todas las filas están vacías. */
function modelWithAllCellsEmpty(): ProgramPdfModel {
  return {
    ...programaPdfModel,
    weeks: programaPdfModel.weeks.map((card) => ({
      rows: card.rows.map((row) => ({
        ...row,
        cells: row.cells.map(() => emptyCell),
      })),
    })),
  };
}

/** Construye un modelo con una única tarjeta de una sola fila. */
function modelWithSingleRowCard(): ProgramPdfModel {
  const firstCard = programaPdfModel.weeks[0];
  if (!firstCard) throw new Error('El fixture no tiene semanas');
  const firstRow = firstCard.rows[0];
  if (!firstRow) throw new Error('La primera tarjeta del fixture no tiene filas');
  return {
    ...programaPdfModel,
    weeks: [{ rows: [firstRow] }],
  };
}

async function pageCount(buffer: Buffer): Promise<number> {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    return info.numpages ?? info.total ?? 0;
  } finally {
    await parser.destroy();
  }
}

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

describe('ProgramDocument', () => {
  it('produce un buffer PDF válido y no trivial', async () => {
    const buffer = await renderToBuffer(ProgramDocument({ model: programaPdfModel }));
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.byteLength).toBeGreaterThan(1024);
  });

  it('el modelo normal (9 fechas, 5 tarjetas) cabe en una sola página', async () => {
    const buffer = await renderToBuffer(ProgramDocument({ model: programaPdfModel }));
    expect(await pageCount(buffer)).toBe(1);
  });

  // Este es el test que de verdad fija las alturas de theme.ts. Un mes de 31
  // días que empieza en sábado da 5 sábados + 5 lunes = 10 fechas en 6
  // tarjetas, dos más que la hoja de referencia. Si esto no cabe, el programa
  // se imprime en dos hojas.
  it('el caso peor (10 fechas, 6 tarjetas) también cabe en una sola página', async () => {
    const buffer = await renderToBuffer(
      ProgramDocument({ model: programaPdfModelMesCompleto }),
    );
    expect(await pageCount(buffer)).toBe(1);
  });

  it('el modelo largo (12 tarjetas) genera más de una página', async () => {
    const buffer = await renderToBuffer(ProgramDocument({ model: programaPdfModelLargo }));
    expect(await pageCount(buffer)).toBeGreaterThan(1);
  });

  it('el texto extraído contiene los nombres y las etiquetas de columna del modelo', async () => {
    const buffer = await renderToBuffer(ProgramDocument({ model: programaPdfModel }));
    const text = await extractText(buffer);

    // El diseño usa letterSpacing en títulos y cabeceras, y el extractor lo
    // devuelve como espacios reales entre letras ("ACO M O DA D O R"). El PDF
    // es correcto; lo que no sirve es comparar literalmente. Se quita TODO el
    // espacio en blanco de ambos lados antes de comparar.
    const sinEspacios = (s: string): string => s.replace(/\s+/g, '');
    const extraido = sinEspacios(text);

    for (const column of programaPdfModel.columns) {
      expect(extraido).toContain(sinEspacios(column.label));
    }

    // Todos los nombres y etiquetas de equipo del modelo, no una muestra.
    for (const week of programaPdfModel.weeks) {
      for (const row of week.rows) {
        for (const cell of row.cells) {
          for (const line of cell.lines) {
            expect(extraido).toContain(sinEspacios(line));
          }
        }
        expect(extraido).toContain(sinEspacios(row.dayNumber));
      }
    }

    expect(extraido).toContain(sinEspacios(programaPdfModel.title));
    expect(extraido).toContain(sinEspacios(programaPdfModel.footer.line1));
    expect(extraido).toContain(sinEspacios(programaPdfModel.footer.line2Bold));
  });

  it('renderiza sin fallar con 4 columnas', async () => {
    const buffer = await renderToBuffer(ProgramDocument({ model: modelWithColumnCount(4) }));
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renderiza sin fallar con 8 columnas', async () => {
    const buffer = await renderToBuffer(ProgramDocument({ model: modelWithColumnCount(8) }));
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renderiza sin fallar cuando todas las celdas están vacías', async () => {
    const buffer = await renderToBuffer(ProgramDocument({ model: modelWithAllCellsEmpty() }));
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const text = await extractText(buffer);
    expect(text).toContain('—');
  });

  it('renderiza sin fallar con una tarjeta de una sola fila', async () => {
    const buffer = await renderToBuffer(ProgramDocument({ model: modelWithSingleRowCard() }));
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
