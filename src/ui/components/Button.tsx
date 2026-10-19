import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant }

export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={[styles.button, styles[variant], className].filter(Boolean).join(' ')} {...rest} />;
}
