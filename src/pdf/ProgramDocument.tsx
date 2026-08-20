// React 19 dejó de exponer el namespace JSX global: hay que importarlo.
import type { JSX } from 'react';
import { Document, Page, View, Text, Svg, Path, StyleSheet } from '@react-pdf/renderer';
import type { ProgramPdfModel, PdfColumn, PdfWeekCard, PdfDateRow, PdfCell } from './model';
import { Icon } from './icons';
import { registerFonts, FONT_SERIF, FONT_SANS, WEIGHT_SEMIBOLD } from './fonts';
import { COLORS, SUBTITLE_COLOR, ONDA_FONDO_OPACIDAD, PAGE, HEADER, COLUMNS_HEADER, WEEK_CARD, FOOTER } from './theme';

registerFonts();

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.fondoPagina,
    paddingTop: PAGE.marginTop,
    paddingBottom: PAGE.marginBottom,
    paddingLeft: PAGE.marginLeft,
    paddingRight: PAGE.marginRight,
    fontFamily: FONT_SANS,
  },
  backgroundWave: {
    position: 'absolute',
    top: 0,
    right: 0,
  },

  // Cabecera del título. El "alto ~96pt" de la especificación es una
  // medida aproximada de referencia, no una altura mínima forzada: con 9
  // fechas (5 tarjetas) el documento ya llena casi toda la página, y
  // forzar 96pt exactos lo hace desbordar a una segunda página. Se deja
  // que el bloque tome su alto natural (título + adorno + subtítulo).
  header: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONT_SERIF,
    fontSize: HEADER.titleFontSize,
    letterSpacing: HEADER.titleLetterSpacing,
    color: COLORS.textoTitulo,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  ornamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
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
    paddingHorizontal: 2,
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
    letterSpacing: COLUMNS_HEADER.labelLetterSpacing,
    color: COLORS.textoEtiqueta,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 4,
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
    backgroundColor: COLORS.tarjetaBlanca,
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
  dateCell: {
    height: WEEK_CARD.rowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayName: {
    fontFamily: FONT_SANS,
    fontSize: WEEK_CARD.dayNameFontSize,
    letterSpacing: WEEK_CARD.dayNameLetterSpacing,
    color: COLORS.textoDiaSemana,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontFamily: FONT_SERIF,
    fontSize: WEEK_CARD.dayNumberFontSize,
    color: COLORS.dorado,
    textAlign: 'center',
    marginTop: 1,
  },
  monthLabel: {
    fontFamily: FONT_SANS,
    fontSize: WEEK_CARD.monthLabelFontSize,
    color: COLORS.textoMesPeque,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  dateConnectorLine: {
    position: 'absolute',
    left: WEEK_CARD.dateColumnWidth / 2,
    width: 0,
    height: WEEK_CARD.connectorHeight,
    borderLeftWidth: 1,
    borderLeftStyle: 'dotted',
    borderLeftColor: COLORS.punteado,
  },
  dateConnectorDot: {
    position: 'absolute',
    left: WEEK_CARD.dateColumnWidth / 2 - WEEK_CARD.connectorDotSize / 2,
    width: WEEK_CARD.connectorDotSize,
    height: WEEK_CARD.connectorDotSize,
    borderRadius: WEEK_CARD.connectorDotSize / 2,
    backgroundColor: COLORS.punteado,
  },
  assignmentZone: {
    flex: 1,
    flexDirection: 'column',
  },
  assignmentRow: {
    height: WEEK_CARD.rowHeight,
    flexDirection: 'row',
  },
  assignmentRowDivider: {
    borderTopWidth: 1,
    borderTopStyle: 'dotted',
    borderTopColor: COLORS.punteado,
  },
  assignmentCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  assignmentLine: {
    fontFamily: FONT_SANS,
    fontSize: WEEK_CARD.assignmentFontSize,
    lineHeight: WEEK_CARD.assignmentLineHeight,
    color: COLORS.textoNombre,
    textAlign: 'center',
  },
  emptyMark: {
    fontFamily: FONT_SANS,
    fontSize: WEEK_CARD.emptyMarkFontSize,
    color: COLORS.vacio,
  },

  // Pie
  footer: {
    marginTop: FOOTER.marginTop,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCircle: {
    width: FOOTER.circleDiameter,
    height: FOOTER.circleDiameter,
    borderRadius: FOOTER.circleDiameter / 2,
    backgroundColor: COLORS.circuloPie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTextBlock: {
    marginLeft: 8,
  },
  footerLine: {
    fontFamily: FONT_SANS,
    fontSize: FOOTER.textFontSize,
    color: COLORS.textoEtiqueta,
  },
  footerLine2Bold: {
    fontFamily: FONT_SANS,
    fontWeight: WEIGHT_SEMIBOLD,
    color: COLORS.dorado,
  },
});

/** Onda suave del fondo, arriba a la derecha. Sin hojas decorativas: es un gesto mínimo, no una ilustración. */
function BackgroundWave(): JSX.Element {
  const width = 260;
  const height = 190;
  return (
    <View style={styles.backgroundWave} fixed>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={`M${width * 0.25} 0
              C ${width * 0.55} ${height * 0.12}, ${width * 0.7} ${height * 0.02}, ${width} ${height * 0.2}
              L ${width} 0 Z`}
          fill={COLORS.ondaFondo}
          opacity={ONDA_FONDO_OPACIDAD}
        />
        <Path
          d={`M${width * 0.45} 0
              C ${width * 0.7} ${height * 0.22}, ${width * 0.8} ${height * 0.1}, ${width} ${height * 0.38}
              L ${width} 0 Z`}
          fill={COLORS.ondaFondo}
          opacity={ONDA_FONDO_OPACIDAD * 0.6}
        />
      </Svg>
    </View>
  );
}

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
 * cada figura cae al relleno negro por defecto. El icono del pie, que está fuera
 * del `render`, se dibujaba correctamente al mismo tiempo: esa era la pista.
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

function DateCell({ row }: { row: PdfDateRow }): JSX.Element {
  return (
    <View style={styles.dateCell}>
      <Text style={styles.dayName}>{row.dayName}</Text>
      <Text style={styles.dayNumber}>{row.dayNumber}</Text>
      <Text style={styles.monthLabel}>{row.monthLabel}</Text>
    </View>
  );
}

function AssignmentCell({ cell }: { cell: PdfCell }): JSX.Element {
  if (cell.lines.length === 0) {
    return (
      <View style={styles.assignmentCell}>
        <Text style={styles.emptyMark}>—</Text>
      </View>
    );
  }
  return (
    <View style={styles.assignmentCell}>
      {cell.lines.map((line, index) => (
        <Text key={index} style={styles.assignmentLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function WeekCard({ card }: { card: PdfWeekCard }): JSX.Element {
  const hasTwoRows = card.rows.length === 2;
  return (
    <View style={styles.weekCardWrap} wrap={false}>
      <View style={styles.weekCardShadow} />
      <View style={styles.weekCard}>
        <View style={styles.goldBar} />
        <View style={styles.dateColumn}>
          {card.rows.map((row) => (
            <DateCell key={row.date} row={row} />
          ))}
          {hasTwoRows ? (
            <>
              <View style={[styles.dateConnectorDot, { top: WEEK_CARD.rowHeight - WEEK_CARD.connectorHeight / 2 - WEEK_CARD.connectorDotSize / 2 }]} />
              <View style={[styles.dateConnectorLine, { top: WEEK_CARD.rowHeight - WEEK_CARD.connectorHeight / 2 }]} />
              <View style={[styles.dateConnectorDot, { top: WEEK_CARD.rowHeight + WEEK_CARD.connectorHeight / 2 - WEEK_CARD.connectorDotSize / 2 }]} />
            </>
          ) : null}
        </View>
        <View style={styles.assignmentZone}>
          {card.rows.map((row, rowIndex) => (
            <View
              key={row.date}
              style={rowIndex > 0 ? [styles.assignmentRow, styles.assignmentRowDivider] : styles.assignmentRow}
            >
              {row.cells.map((cell, cellIndex) => (
                // El índice de columna identifica la celda de forma estable
                // dentro de la fila (el número de columnas es fijo por
                // documento); `PdfCell` no trae un id propio.
                <AssignmentCell key={cellIndex} cell={cell} />
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Footer({ model }: { model: ProgramPdfModel }): JSX.Element {
  return (
    <View style={styles.footer}>
      <View style={styles.footerCircle}>
        <Icon name="people" size={FOOTER.circleIconSize} color={COLORS.dorado} />
      </View>
      <View style={styles.footerTextBlock}>
        <Text style={styles.footerLine}>{model.footer.line1}</Text>
        <Text style={styles.footerLine}>
          {model.footer.line2Plain}
          <Text style={styles.footerLine2Bold}>{model.footer.line2Bold}</Text>
        </Text>
      </View>
    </View>
  );
}

export function ProgramDocument({ model }: { model: ProgramPdfModel }): JSX.Element {
  return (
    <Document>
      <Page size="LETTER" orientation="portrait" style={styles.page} wrap>
        <BackgroundWave />
        <Header model={model} />
        <ColumnsHeader columns={model.columns} />
        <View>
          {model.weeks.map((card, index) => (
            <WeekCard key={index} card={card} />
          ))}
        </View>
        <Footer model={model} />
      </Page>
    </Document>
  );
}
