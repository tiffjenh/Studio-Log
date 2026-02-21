import { describe, expect, it } from "vitest";
import { normalizeDateRange } from "../metrics/dateNormalize";

describe("normalizeDateRange i18n", () => {
  const today = "2026-02-21";

  it("parses last month (EN)", () => {
    const r = normalizeDateRange("How much did I make last month?", today);
    expect(r).toMatchObject({ start: "2026-01-01", end: "2026-01-31", label: "2026-01" });
  });

  it("parses last month (ES)", () => {
    const r = normalizeDateRange("¿Cuánto gané el mes pasado?", today);
    expect(r).toMatchObject({ start: "2026-01-01", end: "2026-01-31", label: "2026-01" });
  });

  it("parses last month (ZH)", () => {
    const r = normalizeDateRange("上个月我赚了多少？", today);
    expect(r).toMatchObject({ start: "2026-01-01", end: "2026-01-31", label: "2026-01" });
  });

  it("parses explicit month/year (ES)", () => {
    const r = normalizeDateRange("enero de 2026", today);
    expect(r).toMatchObject({ start: "2026-01-01", end: "2026-01-31", label: "2026-01" });
  });

  it("parses explicit month/year (ZH)", () => {
    const r = normalizeDateRange("2026年1月", today);
    expect(r).toMatchObject({ start: "2026-01-01", end: "2026-01-31", label: "2026-01" });
  });

  it("parses this year as YTD (EN)", () => {
    const r = normalizeDateRange("this year", today);
    expect(r).toMatchObject({ start: "2026-01-01", end: "2026-02-21", label: "2026 YTD" });
  });

  it("parses YTD as Jan 1..today (EN)", () => {
    const r = normalizeDateRange("YTD", today);
    expect(r).toMatchObject({ start: "2026-01-01", end: "2026-02-21", label: "2026 YTD" });
  });
});

