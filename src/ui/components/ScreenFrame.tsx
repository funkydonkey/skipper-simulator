import type { ReactNode } from 'react';
import type { Screen } from '../session/types';
import styles from './ScreenFrame.module.css';

export interface ScreenFrameProps {
  screen: Screen;
  title: string;
  subtitle?: string;
  side?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

/** Root of every screen: `data-screen` is how tests and themes know where we are. */
export function ScreenFrame({ screen, title, subtitle, side, actions, children }: ScreenFrameProps) {
  return (
    <main className={styles.frame} data-screen={screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </header>
      <div className={side ? styles.withSide : styles.body}>
        <section className={styles.content}>{children}</section>
        {side && <aside className={styles.side}>{side}</aside>}
      </div>
      {actions && <footer className={styles.actions}>{actions}</footer>}
    </main>
  );
}
