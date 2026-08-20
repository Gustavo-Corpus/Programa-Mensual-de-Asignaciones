import { pdf } from '@react-pdf/renderer';
import { ProgramDocument } from './ProgramDocument';
import type { ProgramPdfModel } from './model';

/**
 * Genera el PDF en el navegador y se lo entrega al usuario.
 *
 * El documento se compone aquí mismo, en el cliente: no hay servidor que lo
 * genere, y por eso la aplicación puede publicarse como sitio estático en
 * GitHub Pages. El PDF es vectorial de verdad — texto seleccionable, no una
 * captura de pantalla.
 */
export async function renderProgramPdfBlob(model: ProgramPdfModel): Promise<Blob> {
  return pdf(ProgramDocument({ model })).toBlob();
}

/** "programa-2026-09.pdf" — ordenable por nombre en el explorador de archivos. */
export function programPdfFileName(year: number, month: number): string {
  return `programa-${year}-${String(month).padStart(2, '0')}.pdf`;
}

export async function downloadProgramPdf(
  model: ProgramPdfModel,
  year: number,
  month: number,
): Promise<void> {
  const blob = await renderProgramPdfBlob(model);
  const url = URL.createObjectURL(blob);
  try {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = programPdfFileName(year, month);
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  } finally {
    // Sin esto, el blob se queda en memoria hasta que se recargue la pestaña.
    // Un administrador que descargue doce meses seguidos acumularía doce PDF.
    URL.revokeObjectURL(url);
  }
}
