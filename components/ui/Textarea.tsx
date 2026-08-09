'use client';

type TextareaProps = {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  name?: string;
  rows?: number;
  required?: boolean;
};

export function Textarea({
  label,
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  name,
  rows = 4,
  required = false,
}: TextareaProps) {
  const inputId = name;

  return (
    <label className="block">
      {label ? (
        <span className="mb-2 block text-sm font-semibold text-espresso">
          {label}
          {required ? <span className="ml-1 text-red-500">*</span> : null}
        </span>
      ) : null}
      <textarea
        id={inputId}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        className={`w-full rounded-md border bg-cream px-3 py-3 text-sm text-espresso placeholder:text-warm-gray focus:outline-none focus:ring-2 focus:ring-peach disabled:cursor-not-allowed disabled:opacity-50 ${
          error ? 'border-red-500' : 'border-espresso/30'
        }`}
      />
      {error ? (
        <span id={inputId ? `${inputId}-error` : undefined} className="mt-2 block text-sm text-red-500">
          {error}
        </span>
      ) : null}
    </label>
  );
}
