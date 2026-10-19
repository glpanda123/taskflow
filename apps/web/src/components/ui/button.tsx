import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = {
  variant?: 'primary' | 'secondary';
  /** While true: disabled and shows `pendingLabel`, so double submits are impossible. */
  pending?: boolean;
  pendingLabel?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const styles = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border border-input bg-card hover:bg-accent',
};

export function Button({
  variant = 'primary',
  pending = false,
  pendingLabel,
  disabled,
  className,
  children,
  ...button
}: ButtonProps) {
  return (
    <button
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-touch items-center justify-center rounded-control px-4 font-medium disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className ?? ''}`}
      {...button}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Form-level error (wrong password, network down…). role="alert" makes screen readers announce it. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-control bg-status-overdue-subtle px-3 py-2 text-caption text-status-overdue-text"
    >
      {message}
    </p>
  );
}
