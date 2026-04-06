import React, { useEffect, useRef } from "react";
import type { FormState } from "../lib/types";

// ── helpers ───────────────────────────────────────────────────────────────────
// Форматировать число с пробелами: 1880000 → "1 880 000"
function formatThousands(v: string): string {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "";
  return parseInt(digits).toLocaleString("ru-RU");
}

// Убрать форматирование → чистые цифры для хранения в state
function unformatThousands(v: string): string {
  return v.replace(/\s/g, "").replace(/\D/g, "");
}
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function parseNum(v: string | number): number {
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function formatMoney(v: number): string {
  if (v === 0) return "0 ₽";
  return (
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v) + " ₽"
  );
}

function daysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms < 0 ? 0 : Math.round(ms / 86_400_000) + 1;
}

// Пытаемся выделить тип судна из полного имени
// ("мфасс спасатель заборщиков" → type:"МФАСС", name:"Спасатель Заборщиков")
const VESSEL_TYPES = [
  "мфасс", "мспс", "мпасс", "исп", "спкр", "рб", "б/с", "бс",
];

function splitVesselName(full: string): { type: string; name: string } {
  if (!full) return { type: "", name: "" };
  const lower = full.toLowerCase().trim();
  for (const t of VESSEL_TYPES) {
    if (lower === t || lower.startsWith(t + " ")) {
      return {
        type: toTitleCase(t),
        name: toTitleCase(full.slice(t.length).trim()),
      };
    }
  }
  return { type: "", name: toTitleCase(full) };
}

// ── types ─────────────────────────────────────────────────────────────────────


interface Props {
  form: FormState;
  editId: number | null;
  vesselName: string;
  readOnly: boolean;
  onChange: (f: FormState) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

// ── style tokens ──────────────────────────────────────────────────────────────

const COLOR = {
  contract: "#2563eb",
  kp:       "#7c3aed",
  plan:     "#d97706",
};

const SUMMARY_BG: Record<string, string> = {
  contract: "#f0fdf4",
  kp:       "#f5f3ff",
  plan:     "#fefce8",
};
const SUMMARY_BORDER: Record<string, string> = {
  contract: "#86efac",
  kp:       "#c4b5fd",
  plan:     "#fde047",
};

// ── component ─────────────────────────────────────────────────────────────────

export function ContractForm({
  form,
  editId,
  vesselName,
  readOnly,
  onChange,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = React.useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const set = (patch: Partial<FormState>) => onChange({ ...form, ...patch });

  const inp = (id: string) => ({
    onFocus: () => setFocused(id),
    onBlur:  () => setFocused(null),
    style: {
      width: "100%",
      padding: "9px 12px",
      border: `1.5px solid ${focused === id ? "#2563eb" : "#e2e8f0"}`,
      borderRadius: "8px",
      fontSize: "14px",
      color: "#0f172a",
      background: readOnly ? "#f8fafc" : "#fff",
      outline: "none",
      boxSizing: "border-box" as const,
      transition: "border-color 0.15s",
    } as React.CSSProperties,
    disabled: readOnly,
  });

  // Calculations
  const days    = daysBetween(form.start, form.end);
  const firmN   = parseNum(form.firmDays);
  const rateN   = parseNum(form.rate);
  const mobN    = parseNum(form.mob);
  const demobN  = parseNum(form.demob);
  const revenue = firmN * rateN + mobN + demobN;

  const { type: vType, name: vName } = splitVesselName(vesselName);
  const showDocRow = form.priority === "contract" || form.priority === "kp";
  const docLabel   = form.priority === "contract" ? "контракта" : "КП";

  return (
    <div
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100dvh - 32px)",
          overflow: "hidden",
        }}
      >
        {/* ── HEADER ── */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {vType && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: "#94a3b8",
                }}
              >
                {vType}
              </span>
            )}
            <span
              style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}
            >
              {vName || toTitleCase(vesselName)}
            </span>
            <span style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
              {editId ? `Редактирование · #${editId}` : "Новый контракт"}
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: "#f1f5f9",
              color: "#64748b",
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#e2e8f0")}
            onMouseLeave={e => (e.currentTarget.style.background = "#f1f5f9")}
          >
            ×
          </button>
        </div>

        {/* ── BODY ── */}
        <div
          style={{
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            overflowY: "auto",
          }}
        >
          {/* Контрагент */}
          <div>
            <Label>Контрагент</Label>
            <input
              {...inp("cpty")}
              value={form.counterparty}
              onChange={e => set({ counterparty: e.target.value })}
              placeholder="Название организации"
            />
          </div>

          {/* Тип / приоритет */}
          <div>
            <Label>Тип</Label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "5px",
                background: "#f8fafc",
                borderRadius: "10px",
                padding: "4px",
              }}
            >
              {(["contract", "kp", "plan"] as const).map((p) => {
                const labels = { contract: "Контракт", kp: "КП", plan: "План" };
                const active = form.priority === p;
                return (
                  <button
                    key={p}
                    disabled={readOnly}
                    onClick={() => set({ priority: p })}
                    style={{
                      padding: "8px 0",
                      border: "none",
                      borderRadius: "7px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: readOnly ? "default" : "pointer",
                      background: active ? COLOR[p] : "transparent",
                      color: active ? "#fff" : "#64748b",
                      boxShadow: active ? "0 2px 8px rgba(0,0,0,0.13)" : "none",
                      transition: "all 0.15s",
                    }}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Номер и дата документа */}
          {showDocRow && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Label>Номер {docLabel}</Label>
                <input
                  {...inp("num")}
                  value={form.contractNumber ?? ""}
                  onChange={e => set({ contractNumber: e.target.value })}
                  placeholder="МСС-000/2026"
                />
              </div>
              <div>
                <Label>Дата {docLabel}</Label>
                <input
                  {...inp("cdate")}
                  type="date"
                  value={form.contractDate ?? ""}
                  onChange={e => set({ contractDate: e.target.value })}
                />
              </div>
            </div>
          )}

          <Divider />

          {/* Период */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Начало</Label>
              <input
                {...inp("start")}
                type="date"
                value={form.start}
                onChange={e => set({ start: e.target.value })}
              />
            </div>
            <div>
              <Label>Конец</Label>
              <input
                {...inp("end")}
                type="date"
                value={form.end}
                onChange={e => set({ end: e.target.value })}
              />
            </div>
          </div>

          {/* Ставка */}
<div>
  <Label>Суточная ставка (₽)</Label>
  <input
    {...inp("rate")}
    type="text"
    inputMode="numeric"
    value={formatThousands(form.rate)}
    placeholder="0"
    onFocus={() => setFocused("rate")}
    onBlur={() => setFocused(null)}
    onChange={e => set({ rate: unformatThousands(e.target.value) })}
  />
</div>

         {/* Моб / Демоб */}
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
  <div>
    <Label>Мобилизация (₽)</Label>
    <input
      {...inp("mob")}
      type="text"
      inputMode="numeric"
      value={formatThousands(form.mob)}
      placeholder="0"
      onFocus={() => setFocused("mob")}
      onBlur={() => setFocused(null)}
      onChange={e => set({ mob: unformatThousands(e.target.value) })}
    />
  </div>
  <div>
    <Label>Демобилизация (₽)</Label>
    <input
      {...inp("demob")}
      type="text"
      inputMode="numeric"
      value={formatThousands(form.demob)}
      placeholder="0"
      onFocus={() => setFocused("demob")}
      onBlur={() => setFocused(null)}
      onChange={e => set({ demob: unformatThousands(e.target.value) })}
    />
  </div>
</div>
          {/* Твёрдый / Опционы */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Твёрдый период (дн.)</Label>
              <input
                {...inp("firm")}
                type="number"
                value={form.firmDays}
                onChange={e => set({ firmDays: e.target.value })}
                placeholder="0"
                min="0"
              />
            </div>
            <div>
              <Label>Опционы (дн.)</Label>
              <input
                {...inp("opt")}
                type="number"
                value={form.optionDays}
                onChange={e => set({ optionDays: e.target.value })}
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          {/* ── Итог ── */}
          <div
            style={{
              background: SUMMARY_BG[form.priority],
              border: `1.5px solid ${SUMMARY_BORDER[form.priority]}`,
              borderRadius: "10px",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            {/* Левая часть — дни */}
            <div style={{ fontSize: "13px", color: "#475569" }}>
              {days > 0 ? (
                <>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    {days}
                  </span>
                  {" "}дн.
                  {firmN > 0 && (
                    <span style={{ color: "#94a3b8", marginLeft: 6 }}>
                      твёрд. {firmN}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: "#94a3b8" }}>Период не задан</span>
              )}
            </div>

            {/* Правая часть — выручка */}
            <div style={{ textAlign: "right" }}>
              {form.priority === "plan" ? (
                <>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#92400e" }}>
                    —
                  </div>
                  <div style={{ fontSize: "11px", color: "#b45309", marginTop: 1 }}>
                    выручка не учитывается
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    {formatMoney(revenue)}
                  </div>
                  {form.priority === "kp" && (
                    <div style={{ fontSize: "11px", color: "#7c3aed", marginTop: 1 }}>
                      ~ ориентировочно
                    </div>
                  )}
                  {form.priority === "contract" && revenue > 0 && rateN > 0 && (
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: 1 }}>
                      {firmN} дн. × {formatMoney(rateN)}
                      {(mobN > 0 || demobN > 0) && " + моб/демоб"}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        {!readOnly && (
          <div
            style={{
              padding: "14px 24px",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              gap: "8px",
            }}
          >
            {editId && (
              <button
                onClick={onDelete}
                style={{
                  padding: "10px 16px",
                  background: "transparent",
                  color: "#ef4444",
                  border: "1.5px solid #fca5a5",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                Удалить
              </button>
            )}
            <button
              onClick={onSave}
              style={{
                flex: 1,
                padding: "10px 0",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#1d4ed8")}
              onMouseLeave={e => (e.currentTarget.style.background = "#2563eb")}
            >
              {editId ? "Сохранить изменения" : "Добавить контракт"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── micro-components ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: "11px",
        fontWeight: 600,
        color: "#94a3b8",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        marginBottom: "6px",
      }}
    >
      {children}
    </label>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#f1f5f9", margin: "2px 0" }} />;
}
