'use client';

import { useId, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { getCountryOptions } from '@/lib/countries';

export function CountryResidenceSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (countryCode: string) => void;
}) {
  const listId = useId();
  const options = useMemo(() => getCountryOptions('en'), []);
  const selected = options.find(option => option.code === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter(option =>
      option.name.toLocaleLowerCase().includes(normalized)
      || option.code.toLocaleLowerCase().includes(normalized)
    );
  }, [options, query]);

  return (
    <div>
      <label htmlFor={`${listId}-input`} className="block text-sm font-medium">
        Country of residence
      </label>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        Used privately to determine the age and Guardian requirements that apply to your account.
      </p>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-3.5 text-gray-500" size={17} />
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          required
          autoComplete="country-name"
          value={open ? query : selected?.name || ''}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) onChange('');
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="Search countries"
          className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-10 pr-3 text-white"
        />
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-white/15 bg-[#171817] p-1 shadow-2xl"
          >
            {filtered.slice(0, 80).map(option => (
              <li key={option.code} role="option" aria-selected={option.code === value}>
                <button
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => {
                    onChange(option.code);
                    setQuery('');
                    setOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-white/[0.07] focus:bg-white/[0.07]"
                >
                  <span>{option.name}</span>
                  <span className="flex items-center gap-2 text-xs text-gray-500">
                    {option.code}
                    {option.code === value ? <Check size={15} className="text-[var(--accent-primary)]" /> : null}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li className="p-3 text-sm text-gray-500">No country found.</li> : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
