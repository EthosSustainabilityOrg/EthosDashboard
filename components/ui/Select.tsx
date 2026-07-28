'use client';

import { useEffect, useRef, useState } from 'react';

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
};

export function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
  name,
  id,
  className = '',
}: SelectProps) {
  const selectId = id ?? name;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectOption(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative block ${className}`}>
      {label ? (
        <label htmlFor={selectId} className="mb-2 block text-sm font-semibold text-espresso">
          {label}
        </label>
      ) : null}

      <span className="relative block">
        <button
          type="button"
          id={selectId}
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
          className="flex h-11 w-full items-center justify-between rounded-md border border-sand bg-cream px-3 pr-10 text-left text-sm text-espresso focus:outline-none focus:ring-2 focus:ring-peach disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="truncate">{selectedOption?.label ?? 'Select'}</span>
        </button>

        {name ? <input type="hidden" name={name} value={value} /> : null}

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-gray"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </span>

      {isOpen && !disabled ? (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-sand bg-cream py-1 shadow-lg">
          {options.map((option) => {
            const active = option.value === value;
            const isSeparator = option.value.startsWith('separator-');

            if (isSeparator) {
              return (
                <div
                  key={option.value}
                  className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-warm-gray"
                >
                  {option.label.replace(/-/g, '').trim()}
                </div>
              );
            }

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => selectOption(option.value)}
                className={`block w-full px-3 py-2 text-left text-sm text-espresso transition hover:bg-sand/40 ${
                  active ? 'bg-peach-light' : ''
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
