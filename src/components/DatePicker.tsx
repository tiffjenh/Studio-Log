import { useState, useRef, useEffect } from "react";

const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatKeyToDisplay(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  const [y, m, d] = key.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

/** Parse MM/DD/YYYY, M/D/YYYY, or YYYY-MM-DD to YYYY-MM-DD or null */
function parseToDateKey(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) {
    const [, y, m, d] = iso;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime()) && date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d)) {
      return `${y}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
    }
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (us) {
    const [, m, d, y] = us;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime()) && date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d)) {
      return `${y}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
    }
  }
  return null;
}

export interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}

export default function DatePicker({ value, onChange, placeholder = "MM/DD/YYYY", id }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [inputStr, setInputStr] = useState(() => formatKeyToDisplay(value));
  const [viewDate, setViewDate] = useState(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputStr(formatKeyToDisplay(value));
  }, [value]);

  useEffect(() => {
    if (open && value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      setViewDate(new Date(y, m - 1, 1));
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handleInputBlur = () => {
    const parsed = parseToDateKey(inputStr);
    if (parsed !== null) {
      onChange(parsed);
      setInputStr(formatKeyToDisplay(parsed));
    } else if (inputStr.trim() === "") {
      onChange("");
      setInputStr("");
    } else {
      setInputStr(formatKeyToDisplay(value));
    }
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    cells.push({ date: d, isCurrentMonth: d.getMonth() === month });
  }

  const todayKey = toDateKey(new Date());

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "stretch", gap: 8, width: "fit-content", maxWidth: "100%" }}>
      <input
        type="text"
        id={id}
        value={inputStr}
        onChange={(e) => setInputStr(e.target.value)}
        onBlur={handleInputBlur}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder={placeholder}
        style={{
          width: 140,
          minWidth: 100,
          flex: "0 1 auto",
          minHeight: 48,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card)",
          fontSize: 16,
          fontFamily: "var(--font-sans)",
          color: "var(--text)",
        }}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="pill pill--active"
        style={{
          width: 48,
          minWidth: 48,
          maxWidth: 48,
          height: 48,
          minHeight: 48,
          maxHeight: 48,
          padding: 0,
          border: "none",
          borderRadius: "50%",
          background: "var(--accent-gradient)",
          color: "white",
          fontSize: 18,
          fontFamily: "var(--font-sans)",
          cursor: "pointer",
          boxShadow: "var(--shadow-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-label="Open calendar"
        title="Pick date"
      >
        📅
      </button>

      {open && (
        <div
          className="float-card"
          style={{
            position: "absolute",
            left: 0,
            top: "100%",
            marginTop: 8,
            minWidth: 280,
            maxWidth: 320,
            zIndex: 50,
            padding: 16,
            boxShadow: "var(--shadow-elevated)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setViewDate((d) => addDays(new Date(d.getFullYear(), d.getMonth(), 1), -1))}
              style={{
                width: 36,
                height: 36,
                minWidth: 36,
                maxWidth: 36,
                minHeight: 36,
                maxHeight: 36,
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: "var(--card)",
                cursor: "pointer",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text)",
              }}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span style={{ fontWeight: 600, fontSize: 16, fontFamily: "var(--font-sans)" }}>
              {viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => setViewDate((d) => addDays(new Date(d.getFullYear(), d.getMonth() + 1, 0), 1))}
              style={{
                width: 36,
                height: 36,
                minWidth: 36,
                maxWidth: 36,
                minHeight: 36,
                maxHeight: 36,
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: "var(--card)",
                cursor: "pointer",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text)",
              }}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8, textAlign: "center" }}>
            {DAYS_SHORT.map((label) => (
              <div key={label} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>
                {label}
              </div>
            ))}
            {cells.map(({ date, isCurrentMonth }) => {
              const key = toDateKey(date);
              const isSelected = value === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  style={{
                    width: 36,
                    minWidth: 36,
                    height: 36,
                    minHeight: 36,
                    maxHeight: 36,
                    padding: 0,
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    fontFamily: "var(--font-sans)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isSelected ? "var(--primary)" : "transparent",
                    color: isSelected ? "white" : isCurrentMonth ? "var(--text)" : "var(--text-muted)",
                    opacity: isCurrentMonth ? 1 : 0.6,
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--primary)", fontFamily: "var(--font-sans)" }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(todayKey);
                setOpen(false);
              }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--primary)", fontFamily: "var(--font-sans)" }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
