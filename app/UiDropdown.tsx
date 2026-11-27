"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// Κοινό dropdown (αντικαθιστά το native <select>). Ανοίγει αγκυρωμένο στο πεδίο του, δείχνει ✓ στο επιλεγμένο,
// λειτουργεί με πληκτρολόγιο (↑ ↓ Home End Enter Esc) και ανοίγει προς τα πάνω όταν δεν υπάρχει χώρος κάτω.
// Το οπτικό περιεχόμενο του πεδίου (children) το ορίζει ο καλών, ώστε να κρατά το υπάρχον στυλ του κουμπιού.
// Το πραγματικό <button> είναι διάφανο και καλύπτει το πεδίο· έτσι το στυλ της θέσης του δεν αλλάζει.

export type UiDropdownOption<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  value: T;
  options: ReadonlyArray<UiDropdownOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  children?: ReactNode;
  placement?: "auto" | "top" | "bottom";
  align?: "start" | "end";
};

const ROW = 34;

export default function UiDropdown<T extends string | number>({ value, options, onChange, ariaLabel, className = "", children, placement = "auto", align = "start" }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const current = options[selected];

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    setActive(selected);
    setOpen(true);
  }, [selected]);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const need = options.length * ROW + 16;
    const below = window.innerHeight - rect.bottom;
    setSide(placement === "auto" ? (below < need && rect.top > below ? "top" : "bottom") : placement);
  }, [open, options.length, placement]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, close]);

  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  };

  const onPanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(last, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(last); }
    else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={`ui-dd ${className}${open ? " is-open" : ""}`.trim()} data-side={side} data-align={align}>
      <span className="ui-dd-face" aria-hidden="true">
        {children ?? (
          <>
            <span className="ui-dd-value">{current?.label}</span>
            <svg className="ui-dd-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 9 5 5 5-5" /></svg>
          </>
        )}
      </span>
      <button
        ref={button}
        type="button"
        className="ui-dd-btn"
        data-tip={ariaLabel}
        aria-label={`${ariaLabel}: ${current?.label ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKey}
      />
      {open && (
        <div ref={panel} id={listId} className="ui-dd-panel" role="listbox" aria-label={ariaLabel} data-notip="" onKeyDown={onPanelKey}>
          {options.map((option, index) => (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={index === selected}
              tabIndex={index === active ? 0 : -1}
              className={`ui-dd-option${index === selected ? " is-selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                close(true);
              }}
            >
              <span>{option.label}</span>
              {index === selected && (
                <svg className="ui-dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
