import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from './motion';
import styles from './Typewriter.module.css';

/** Sentences: split after . ! ? … or a closing quote followed by whitespace. */
export function splitLines(text: string): string[] {
  return text.split(/(?<=[.!?…»"])\s+/).filter((l) => l.length > 0);
}

export interface TypewriterProps { text: string; msPerLine?: number; className?: string }

/** ТЗ 6.2: text appears line by line. The whole text stays in the DOM; click reveals the rest. */
export function Typewriter({ text, msPerLine = 700, className }: TypewriterProps) {
  const reduced = useReducedMotion();
  const lines = useMemo(() => splitLines(text), [text]);
  const [shown, setShown] = useState(reduced ? lines.length : 1);
  useEffect(() => {
    if (reduced || shown >= lines.length) return undefined;
    const id = window.setTimeout(() => setShown((n) => n + 1), msPerLine);
    return () => window.clearTimeout(id);
  }, [shown, lines.length, msPerLine, reduced]);
  const visible = reduced ? lines.length : shown;
  return (
    <p className={[styles.text, className].filter(Boolean).join(' ')} onClick={() => setShown(lines.length)}>
      {lines.map((line, i) => (
        <span key={i} className={styles.line} data-shown={i < visible ? 'true' : 'false'}>{line} </span>
      ))}
    </p>
  );
}
