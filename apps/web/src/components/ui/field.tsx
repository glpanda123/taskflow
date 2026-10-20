import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

type FieldProps = {
  label: string;
  /** Short help shown under the input, e.g. "At least 8 characters." */
  hint?: ReactNode;
  /** Error from the server (422) or client validation; replaces the hint. */
  error?: string | undefined;
  optional?: boolean;
} & InputHTMLAttributes<HTMLInputElement>;

/**
 * Label + input + hint/error, wired for screen readers:
 * the label is linked with htmlFor, the hint/error with aria-describedby,
 * and aria-invalid marks the field red for assistive tech, not just visually.
 */
export function Field({ label, hint, error, optional, className, ...input }: FieldProps) {
  const id = useId();
  const describedBy = error || hint ? `${id}-desc` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-caption font-semibold">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`block min-h-touch w-full rounded-control border bg-card px-3 aria-invalid:border-status-overdue ${error ? 'border-status-overdue' : 'border-input'} ${className ?? ''}`}
        {...input}
      />
      {(error || hint) && (
        <p
          id={describedBy}
          className={`text-caption ${error ? 'text-status-overdue-text' : 'text-muted-foreground'}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

type SelectFieldProps = {
  label: string;
  options: { value: string; label: string }[];
} & InputHTMLAttributes<HTMLSelectElement>;

export function SelectField({ label, options, className, ...select }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-caption font-semibold">
        {label}
      </label>
      <select
        id={id}
        className={`block min-h-touch w-full rounded-control border border-input bg-card px-3 ${className ?? ''}`}
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
