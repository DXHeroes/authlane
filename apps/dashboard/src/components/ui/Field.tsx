import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

const CONTROL =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors ' +
  'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 ' +
  'focus-visible:outline-offset-0 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50';

function Wrapper({
  id,
  label,
  hint,
  error,
  hintId,
  errorId,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  hintId: string;
  errorId: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  fieldClassName?: string;
}

/** Label, hint, error and focus ring in one place, so no input can lose one of them. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, fieldClassName, id: providedId, ...props },
  ref
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <Wrapper
      id={id}
      label={label}
      hint={hint}
      error={error}
      hintId={hintId}
      errorId={errorId}
      className={fieldClassName}
    >
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(CONTROL, 'mt-1.5', error && 'border-destructive', className)}
        {...props}
      />
    </Wrapper>
  );
});

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  fieldClassName?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, className, fieldClassName, id: providedId, children, ...props },
  ref
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <Wrapper
      id={id}
      label={label}
      hint={hint}
      error={error}
      hintId={hintId}
      errorId={errorId}
      className={fieldClassName}
    >
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(CONTROL, 'mt-1.5', error && 'border-destructive', className)}
        {...props}
      >
        {children}
      </select>
    </Wrapper>
  );
});

export { CONTROL as controlClassName };
