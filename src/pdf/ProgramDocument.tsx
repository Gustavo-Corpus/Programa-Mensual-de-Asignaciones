// React 19 dejó de exponer el namespace JSX global: hay que importarlo.
import type { JSX } from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { ProgramPdfModel, PdfColumn, PdfWeekCard, PdfDateRow, PdfCell } from './model';
import { computeLayout, type PdfLayout } from './layout';
import { Icon } from './icons';
import { registerFonts, FONT_SERIF, FONT_SANS, FONT_NUMBERS, WEIGHT_SEMIBOLD } from './fonts';
import {
  COLORS,
  SUBTITLE_COLOR,
  PAGE,
  HEADER,
  COLUMNS_HEADER,
  WEEK_CARD,
} from './theme';

registerFonts();

/**
 * Estilos que NO dependen del número de fechas del mes. Los que sí dependen
 * —todo lo que tiene que ver con el alto de fila y el cuerpo de los nombres—
 * se construyen por documento en `createLayoutStyles`.
 */
const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.fondoPagina,
    paddingTop: PAGE.marginTop,
    paddingBottom: PAGE.marginBottom,
    paddingLeft: PAGE.marginLeft,
    paddingRight: PAGE.marginRight,
    fontFamily: FONT_SANS,
  },

  // Cabecera del título. Alto fijo y declarado: es el primer sumando del
  // presupuesto vertical que `layout.ts` reparte entre las filas, así que no
  // puede depender de las métricas de la fuente.
  header: {
    height: HEADER.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONT_SERIF,
    fontSize: HEADER.titleFontSize,
    lineHeight: HEADER.titleLineHeight,
    letterSpacing: HEADER.titleLetterSpacing,
    color: COLORS.textoTitulo,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  ornamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: HEADER.ornamentMarginTop,
  },
  ornamentLine: {
    width: HEADER.ornamentLineWidth,
    height: HEADER.ornamentLineHeight,
    backgroundColor: COLORS.doradoClaro,
  },
  ornamentDiamond: {
    width: HEADER.ornamentDiamondSize,
    height: HEADER.ornamentDiamondSize,
    backgroundColor: COLORS.dorado,
    marginLeft: HEADER.ornamentGap,
    marginRight: HEADER.ornamentGap,
    transform: 'rotate(45deg)',
  },
  subtitle: {
    fontFamily: FONT_SANS,
    fontSize: HEADER.subtitleFontSize,
    lineHeight: HEADER.subtitleLineHeight,
    letterSpacing: HEADER.subtitleLetterSpacing,
    color: SUBTITLE_COLOR,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: HEADER.subtitleMarginTop,
  },

  // Cabecera de columnas
  columnsHeaderWrap: {
    marginTop: COLUMNS_HEADER.marginTop,
  },
  columnsHeader: {
    height: COLUMNS_HEADER.height,
    paddingVertical: COLUMNS_HEADER.paddingVertical,
    borderRadius: COLUMNS_HEADER.borderRadius,
    backgroundColor: COLORS.cabeceraBeige,
    borderWidth: WEEK_CARD.borderWidth,
    borderColor: COLORS.bordeTarjeta,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  columnsHeaderDateCell: {
    width: COLUMNS_HEADER.dateColumnWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnsHeaderRest: {
    flex: 1,
    flexDirection: 'row',
  },
  columnsHeaderCellGroup: {
    flex: 1,
    flexDirection: 'row',
  },
  columnsHeaderCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: COLUMNS_HEADER.labelPaddingHorizontal,
  },
  columnsHeaderSeparator: {
    width: 0,
    marginTop: COLUMNS_HEADER.separatorMarginVertical,
    marginBottom: COLUMNS_HEADER.separatorMarginVertical,
    borderLeftWidth: 1,
    borderLeftStyle: 'dotted',
    borderLeftColor: COLORS.punteado,
  },
  columnsHeaderLabel: {
    fontFamily: FONT_SANS,
    fontSize: COLUMNS_HEADER.labelFontSize,
    lineHeight: COLUMNS_HEADER.labelLineHeight,
    letterSpacing: COLUMNS_HEADER.labelLetterSpacing,
    color: COLORS.textoEtiqueta,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: COLUMNS_HEADER.labelMarginTop,
  },

  // Tarjetas de semana
  weekCardWrap: {
    marginTop: WEEK_CARD.gapBetweenCards,
    position: 'relative',
  },
  weekCardShadow: {
    position: 'absolute',
    top: WEEK_CARD.shadowOffset,
    left: WEEK_CARD.shadowOffset,
    right: -WEEK_CARD.shadowOffset,
    bottom: -WEEK_CARD.shadowOffset,
    backgroundColor: COLORS.bordeTarjeta,
    borderRadius: WEEK_CARD.borderRadius,
  },
  weekCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.tarjeta,
    borderRadius: WEEK_CARD.borderRadius,
    borderWidth: WEEK_CARD.borderWidth,
    borderColor: COLORS.bordeTarjeta,
    overflow: 'hidden',
  },
  goldBar: {
    width: WEEK_CARD.goldBarWidth,
    alignSelf: 'stretch',
    backgroundColor: COLORS.dorado,
  },
  dateColumn: {
    width: WEEK_CARD.dateColumnWidth,
    backgroundColor: COLORS.columnaFecha,
    position: 'relative',
  },
  // "SÁBADO" y "DE SEPTIEMBRE" van en SemiBold: son las dos líneas más
  // pequeñas de la hoja, van espaciadas y sobre beige, y en Regular se leían
  // lavadas. Montserrat SemiBold tiene las mismas métricas verticales que la
  // Regular, así que engordarlas no mueve nada de sitio.
  dayName: {
    fontFamily: FONT_SANS,
    fontWeight: WEIGHT_SEMIBOLD,
    letterSpacing: WEEK_CARD.dayNameLetterSpacing,
    color: COLORS.textoFecha,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  // Zen Antique y no Cormorant: ver la nota de DATE_COLUMN_FONT en theme.ts.
  // Cormorant escribiría "IO" donde tiene que poner "10".
  //
  // Sin `lineHeight` propio: la caja natural de la fuente es justo la que deja
  // el aire correcto BAJO las cifras. Lo que sobra por arriba lo corrige
  // `layout.dayNumberMarginTop`, no un interlineado.
  dayNumber: {
    fontFamily: FONT_NUMBERS,
    color: COLORS.dorado,
    textAlign: 'center',
  },
  monthLabel: {
    fontFamily: FONT_SANS,
    fontWeight: WEIGHT_SEMIBOLD,
    color: COLORS.textoFecha,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  /**
   * Continuación del separador de filas DENTRO de la columna de fechas.
   *
   * Va suelto y posicionado en absoluto sobre la columna, no como borde de la
   * celda de fecha: así no consume alto y las dos fechas siguen midiendo
   * exactamente `rowHeight`, que es de lo que depende que caigan alineadas con
   * sus filas de asignaciones. Es corto y centrado a propósito
   * (`dateDividerWidth`): marca la separación sin partir la tarjeta en dos.
   */
  dateDivider: {
    position: 'absolute',
    left: (WEEK_CARD.dateColumnWidth - WEEK_CARD.dateDividerWidth) / 2,
    width: WEEK_CARD.dateDividerWidth,
    height: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.divisorFila,
  },
  assignmentZone: {
    flex: 1,
    flexDirection: 'column',
  },
  // La ÚNICA separación entre las dos fechas de una tarjeta. Como no hay nada
  // más que las separe, tiene que verse: va en un tono más oscuro que el
  // punteado de la cabecera y no llega a la columna de fechas, igual que en la
  // hoja de referencia.
  assignmentRowDivider: {
    borderTopWidth: 1,
    borderTopStyle: 'dotted',
    borderTopColor: COLORS.divisorFila,
  },
  assignmentCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: WEEK_CARD.cellPaddingHorizontal,
    paddingVertical: WEEK_CARD.cellPaddingVertical,
  },
  emptyMark: {
    fontFamily: FONT_SANS,
    color: COLORS.vacio,
  },
});

/**
 * Estilos que dependen de cuántas fechas tiene el mes.
 *
 * No pueden vivir en el `StyleSheet.create` de arriba porque el alto de fila y
 * el cuerpo de los nombres se calculan por documento: son justo lo que hace
 * que la hoja llene la página tanto con 8 fechas como con 10.
 */
function createLayoutStyles(layout: PdfLayout) {
  return StyleSheet.create({
    dateCell: {
      height: layout.rowHeight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    assignmentRow: {
      height: layout.rowHeight,
      flexDirection: 'row',
    },
    // Los nombres van en negrita y al mayor cuerpo que permita la casilla:
    // esta hoja se lee colgada en un tablón, no en la mano.
    assignmentLine: {
      fontFamily: FONT_SANS,
      fontWeight: WEIGHT_SEMIBOLD,
      fontSize: layout.nameFontSize,
      lineHeight: layout.nameLineHeight,
      color: COLORS.textoNombre,
      textAlign: 'center',
    },
    emptyMarkSized: { fontSize: layout.emptyMarkFontSize },
    dayNameSized: { fontSize: layout.dayNameFontSize },
    // El margen negativo es la corrección óptica del número: ver
    // `dayNumberMarginTop` en layout.ts.
    dayNumberSized: {
      fontSize: layout.dayNumberFontSize,
      marginTop: layout.dayNumberMarginTop,
    },
    monthLabelSized: { fontSize: layout.monthLabelFontSize },
  });
}

type LayoutStyles = ReturnType<typeof createLayoutStyles>;

function Header({ model }: { model: ProgramPdfModel }): JSX.Element {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{model.title}</Text>
      <View style={styles.ornamentRow}>
        <View style={styles.ornamentLine} />
        <View style={styles.ornamentDiamond} />
        <View style={styles.ornamentLine} />
      </View>
      <Text style={styles.subtitle}>{model.subtitle}</Text>
    </View>
  );
}

function ColumnsHeaderContent({ columns }: { columns: readonly PdfColumn[] }): JSX.Element {
  return (
    <View style={styles.columnsHeader}>
      <View style={styles.columnsHeaderDateCell}>
        <Icon name="calendar" size={COLUMNS_HEADER.iconSize} color={COLORS.textoEtiqueta} />
        <Text style={styles.columnsHeaderLabel}>FECHA</Text>
      </View>
      <View style={styles.columnsHeaderSeparator} />
      <View style={styles.columnsHeaderRest}>
        {columns.map((column, index) => (
          <View key={column.typeKey} style={styles.columnsHeaderCellGroup}>
            {index > 0 ? <View style={styles.columnsHeaderSeparator} /> : null}
            <View style={styles.columnsHeaderCell}>
              <Icon name={column.icon} size={COLUMNS_HEADER.iconSize} color={COLORS.textoEtiqueta} />
              <Text style={styles.columnsHeaderLabel}>{column.label}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Cabecera de columnas fija: se repite en todas las páginas.
 *
 * ATENCIÓN — no envuelvas esto en `render={() => <ColumnsHeaderContent .../>}`.
 * Lo estuvo, y hacía que TODOS los iconos de la cabecera salieran como siluetas
 * negras macizas: dentro de esa llamada, `@react-pdf/renderer` pierde las props
 * de los componentes SVG anidados, así que `stroke` y `fill="none"` se ignoran y
 * cada figura cae al relleno negro por defecto. El icono del pie, que estaba
 * fuera del `render`, se dibujaba correctamente al mismo tiempo: esa era la
 * pista.
 *
 * El motivo original para usar `render` era que la cabecera se recolocara al
 * principio de las páginas de continuación. Comprobado con `programaPdfModelLargo`
 * rasterizando la página 2: con `fixed` y children normales queda igual de bien.
 * Ningún test detecta esta regresión —el PDF sigue siendo válido y el texto se
 * extrae igual—, así que solo se ve mirando el documento.
 */
function ColumnsHeader({ columns }: { columns: readonly PdfColumn[] }): JSX.Element {
  return (
    <View style={styles.columnsHeaderWrap} fixed>
      <ColumnsHeaderContent columns={columns} />
    </View>
  );
}

function DateCell({ row, ls }: { row: PdfDateRow; ls: LayoutStyles }): JSX.Element {
  return (
    <View style={ls.dateCell}>
      <Text style={[styles.dayName, ls.dayNameSized]}>{row.dayName}</Text>
      <Text style={[styles.dayNumber, ls.dayNumberSized]}>{row.dayNumber}</Text>
      <Text style={[styles.monthLabel, ls.monthLabelSized]}>{row.monthLabel}</Text>
    </View>
  );
}

function AssignmentCell({ cell, ls }: { cell: PdfCell; ls: LayoutStyles }): JSX.Element {
  if (cell.lines.length === 0) {
    return (
      <View style={styles.assignmentCell}>
        <Text style={[styles.emptyMark, ls.emptyMarkSized]}>—</Text>
      </View>
    );
  }
  return (
    <View style={styles.assignmentCell}>
      {cell.lines.map((line, index) => (
        <Text key={index} style={ls.assignmentLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function WeekCard({
  card,
  ls,
  layout,
}: {
  card: PdfWeekCard;
  ls: LayoutStyles;
  layout: PdfLayout;
}): JSX.Element {
  return (
    <View style={styles.weekCardWrap} wrap={false}>
      <View style={styles.weekCardShadow} />
      <View style={styles.weekCard}>
        <View style={styles.goldBar} />
        <View style={styles.dateColumn}>
          {card.rows.map((row) => (
            <DateCell key={row.date} row={row} ls={ls} />
          ))}
          {/* Un separador por cada junta entre fechas, en el borde de la fila. */}
          {card.rows.slice(1).map((row, index) => (
            <View
              key={`sep-${row.date}`}
              style={[styles.dateDivider, { top: (index + 1) * layout.rowHeight }]}
            />
          ))}
        </View>
        <View style={styles.assignmentZone}>
          {card.rows.map((row, rowIndex) => (
            <View
              key={row.date}
              style={
                rowIndex > 0 ? [ls.assignmentRow, styles.assignmentRowDivider] : ls.assignmentRow
              }
            >
              {row.cells.map((cell, cellIndex) => (
                // El índice de columna identifica la celda de forma estable
                // dentro de la fila (el número de columnas es fijo por
                // documento); `PdfCell` no trae un id propio.
                <AssignmentCell key={cellIndex} cell={cell} ls={ls} />
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function ProgramDocument({ model }: { model: ProgramPdfModel }): JSX.Element {
  const layout = computeLayout(model);
  const ls = createLayoutStyles(layout);
  return (
    <Document>
      <Page size="LETTER" orientation="portrait" style={styles.page} wrap>
        <Header model={model} />
        <ColumnsHeader columns={model.columns} />
        <View>
          {model.weeks.map((card, index) => (
            <WeekCard key={index} card={card} ls={ls} layout={layout} />
          ))}
        </View>
      </Page>
    </Document>
  );
}
