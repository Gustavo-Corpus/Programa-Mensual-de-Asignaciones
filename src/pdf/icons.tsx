// React 19 dejó de exponer el namespace JSX global: hay que importarlo.
import type { JSX } from 'react';
import { Svg, Path, Circle, Line, Rect } from '@react-pdf/renderer';
import type { IconName } from './model';

const STROKE_WIDTH = 1.2;

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
}

/**
 * Un único despachador por nombre, como pide la especificación: los llamantes
 * no importan iconos individuales ni deciden cuál usar por `typeKey` — ese
 * dato viaja en `PdfColumn.icon`.
 */
export function Icon({ name, size = 12, color = '#000000' }: IconProps): JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderGlyph(name, color)}
    </Svg>
  );
}

function renderGlyph(name: IconName, color: string): JSX.Element {
  switch (name) {
    case 'calendar':
      return <CalendarGlyph color={color} />;
    case 'person':
      return <PersonGlyph color={color} />;
    case 'arrow-left':
      return <ArrowGlyph color={color} direction="left" />;
    case 'arrow-right':
      return <ArrowGlyph color={color} direction="right" />;
    case 'broom':
      return <BroomGlyph color={color} />;
    case 'hands-heart':
      return <HandsHeartGlyph color={color} />;
    case 'people':
      return <PeopleGlyph color={color} />;
    case 'dot':
    default:
      return <DotGlyph color={color} />;
  }
}

function CalendarGlyph({ color }: { color: string }): JSX.Element {
  return (
    <>
      <Rect
        x={3}
        y={5}
        width={18}
        height={16}
        rx={2}
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
      <Line x1={3} y1={10} x2={21} y2={10} stroke={color} strokeWidth={STROKE_WIDTH} />
      <Line x1={7.5} y1={3} x2={7.5} y2={7} stroke={color} strokeWidth={STROKE_WIDTH} />
      <Line x1={16.5} y1={3} x2={16.5} y2={7} stroke={color} strokeWidth={STROKE_WIDTH} />
    </>
  );
}

function PersonGlyph({ color }: { color: string }): JSX.Element {
  return (
    <>
      <Circle cx={12} cy={8} r={3.6} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
      <Path
        d="M5 21c0-4.4 3.13-7.5 7-7.5s7 3.1 7 7.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
    </>
  );
}

function ArrowGlyph({ color, direction }: { color: string; direction: 'left' | 'right' }): JSX.Element {
  const flip = direction === 'left';
  const x1 = flip ? 20 : 4;
  const x2 = flip ? 4 : 20;
  const headX = flip ? 10 : 14;
  return (
    <>
      <Line x1={x1} y1={12} x2={x2} y2={12} stroke={color} strokeWidth={STROKE_WIDTH} />
      <Path
        d={`M${headX} ${6} L${x2} 12 L${headX} 18`}
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
    </>
  );
}

function BroomGlyph({ color }: { color: string }): JSX.Element {
  return (
    <>
      <Line x1={16} y1={3} x2={9} y2={14} stroke={color} strokeWidth={STROKE_WIDTH} />
      <Path
        d="M9 14 L4 20 L7.2 21 L9.8 16.6 L12.4 20.4 L15.4 19.4 L11.4 13.6 Z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
    </>
  );
}

/**
 * Simplificación deliberada: unas manos sosteniendo un corazón son
 * demasiado detalladas para un trazo de 13pt legible a tamaño de icono de
 * columna. Se reproduce como un corazón de contorno simple, que conserva el
 * significado ("hospitalidad" / cuidado) sin intentar el detalle de manos.
 */
function HandsHeartGlyph({ color }: { color: string }): JSX.Element {
  return (
    <Path
      d="M12 20.5 C7 16.5 3.5 13.3 3.5 9.6 C3.5 6.9 5.6 4.8 8.2 4.8 C9.7 4.8 11.1 5.5 12 6.7 C12.9 5.5 14.3 4.8 15.8 4.8 C18.4 4.8 20.5 6.9 20.5 9.6 C20.5 13.3 17 16.5 12 20.5 Z"
      stroke={color}
      strokeWidth={STROKE_WIDTH}
      fill="none"
    />
  );
}

function PeopleGlyph({ color }: { color: string }): JSX.Element {
  return (
    <>
      <Circle cx={8.5} cy={8} r={3} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
      <Circle cx={16} cy={9} r={2.4} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
      <Path
        d="M2.8 20c0-3.6 2.6-6.2 5.7-6.2s5.7 2.6 5.7 6.2"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
      <Path
        d="M13.6 20c0-2.9 1.85-5.1 4.3-5.1s4.3 2.2 4.3 5.1"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
    </>
  );
}

function DotGlyph({ color }: { color: string }): JSX.Element {
  return <Circle cx={12} cy={12} r={3.4} fill={color} />;
}
