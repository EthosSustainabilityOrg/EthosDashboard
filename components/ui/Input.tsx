'use client';

type InputProps = {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'date' | 'number' | 'datetime-local';
  error?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  readOnly?: boolean;
  required?: boolean;
};

export function Input({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  error,
  disabled = false,
  name,
  id,
  readOnly = false,
  required = false,
}: InputProps) {
  const inputId = id ?? name;

  return (
    <label className="block">
      {label ? (
        <span className="mb-2 block text-sm font-semibold text-espresso">
          {label}
          {required ? <span className="ml-1 text-red-500">*</span> : null}
        </span>
      ) : null}
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        className={`h-11 w-full rounded-md border bg-cream px-3 text-sm text-espresso placeholder:text-warm-gray focus:outline-none focus:ring-2 focus:ring-peach disabled:cursor-not-allowed disabled:opacity-50 ${
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
