import { useEffect, useState } from 'react';

/**
 * Campo de texto/número que se confirma al perder el foco (`onBlur`), no en
 * cada tecla: así renombrar un equipo o cambiar un `order` no dispara una
 * escritura a Firestore por carácter. Mantiene un valor local propio y lo
 * resincroniza cuando cambia `valor` desde fuera (p. ej. tras recargar la
 * lista después de guardar).
 */
export interface CampoEnLineaProps {
  readonly valor: string;
  readonly tipo?: 'text' | 'number';
  readonly ocupado: boolean;
  readonly ariaLabel: string;
  readonly placeholder?: string;
  readonly onGuardar: (valor: string) => void;
}

export function CampoEnLinea(props: CampoEnLineaProps) {
  const [local, setLocal] = useState(props.valor);

  useEffect(() => {
    setLocal(props.valor);
  }, [props.valor]);

  return (
    <input
      type={props.tipo ?? 'text'}
      className="entrada-en-linea"
      value={local}
      disabled={props.ocupado}
      aria-label={props.ariaLabel}
      placeholder={props.placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== props.valor) props.onGuardar(local);
      }}
    />
  );
}
