import { formatErrors, type ContentError } from '../../content/parse';

/** Shown before any session exists, so it is bilingual on purpose (no Dict). */
export function ContentErrorScreen({ errors }: { errors: readonly ContentError[] }) {
  return (
    <main data-screen="content-error" style={{ padding: 'var(--space-6)' }}>
      <h1>Контент не прошёл проверку · Content failed validation</h1>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{formatErrors(errors)}</pre>
    </main>
  );
}
