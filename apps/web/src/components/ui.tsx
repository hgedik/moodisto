'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { StatusTone } from '@/lib/format';

export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ');

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600 shadow-lg shadow-brand-600/25',
  secondary: 'bg-white/10 text-white hover:bg-white/16 border border-white/10',
  ghost: 'bg-transparent text-muted hover:text-white hover:bg-white/8',
  danger: 'bg-danger-500/90 text-white hover:bg-danger-400',
};

const buttonBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export function Button({
  variant = 'primary',
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button type="button" className={cx(buttonBase, buttonVariants[variant], className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(buttonBase, buttonVariants[variant], className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('surface p-4 sm:p-5', className)}>{children}</section>;
}

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-white/10 text-muted',
  positive: 'bg-success-500/15 text-success-400',
  warning: 'bg-accent-500/15 text-accent-400',
  danger: 'bg-danger-500/15 text-danger-400',
  brand: 'bg-brand-500/20 text-brand-300',
};

export function Badge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ label = 'Yükleniyor' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-brand-400" />
      {label}
    </div>
  );
}

export function Notice({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'info' | 'success';
  children: ReactNode;
}) {
  const classes = {
    danger: 'border-danger-500/40 bg-danger-500/10 text-danger-400',
    info: 'border-brand-500/40 bg-brand-500/10 text-brand-300',
    success: 'border-success-500/40 bg-success-500/10 text-success-400',
  }[tone];
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('rounded-xl border px-4 py-3 text-sm', classes)}
    >
      {children}
    </p>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 px-4 py-10 text-center">
      <p className="font-medium text-white">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-white">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClasses =
  'w-full min-h-11 rounded-xl border border-white/12 bg-ink-850 px-3 text-base text-white placeholder:text-muted/70 focus:border-brand-400 focus:outline-none';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClasses, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClasses, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClasses, 'min-h-24 py-2', props.className)} />;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** A live-connection dot. Silence on a socket is indistinguishable from calm without it. */
export function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span
        className={cx('size-2 rounded-full', connected ? 'bg-success-500' : 'bg-white/25')}
        aria-hidden
      />
      {connected ? 'Canlı' : 'Bağlantı yok'}
    </span>
  );
}
