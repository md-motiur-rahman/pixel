"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Label } from "@/components/ui";

export type ComboboxOption = { id: string; label: string };

export function Combobox({
  label,
  placeholder,
  value,
  onSelect,
  onCreateNew,
  search,
  disabled,
}: {
  label: string;
  placeholder?: string;
  value: ComboboxOption | null;
  onSelect: (option: ComboboxOption) => void;
  onCreateNew: (name: string) => void;
  search: (query: string) => Promise<ComboboxOption[]>;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await search(query);
        if (!cancelled) setOptions(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, open, search]);

  const exactMatch = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      {label && <Label>{label}</Label>}
      <Input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && query.trim().length > 0 && (
        <div className="absolute z-10 mt-1.5 max-h-56 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg shadow-neutral-900/10">
          {loading && <div className="px-3.5 py-2.5 text-sm text-neutral-400">Searching…</div>}
          {!loading &&
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onSelect(opt);
                  setQuery(opt.label);
                  setOpen(false);
                }}
                className="block w-full px-3.5 py-2.5 text-left text-sm text-neutral-900 hover:bg-indigo-50"
              >
                {opt.label}
              </button>
            ))}
          {!loading && !exactMatch && query.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                onCreateNew(query.trim());
                setOpen(false);
              }}
              className="block w-full border-t border-neutral-100 px-3.5 py-2.5 text-left text-sm font-medium text-indigo-600 hover:bg-indigo-50"
            >
              + Add &ldquo;{query.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
