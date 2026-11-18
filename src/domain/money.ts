/**
 * Money is always an integer number of pence. Quantities are integer
 * thousandths. No floating-point values are ever stored or compared.
 */

/** Round half away from zero for positive monetary values. */
export function roundPence(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function grossFromNet(netPence: number, vatRateBp: number): number {
  return netPence + roundPence((netPence * vatRateBp) / 10000);
}

export function vatFromNet(netPence: number, vatRateBp: number): number {
  return roundPence((netPence * vatRateBp) / 10000);
}

export function lineAmount(qtyMilli: number, unitPence: number): number {
  return roundPence((qtyMilli * unitPence) / 1000);
}

export function formatMoney(pence: number | null | undefined, currency = "GBP"): string {
  if (pence === null || pence === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(pence / 100);
}

/** Parse a pounds string from a form into integer pence. */
export function parsePoundsToPence(value: unknown): number | null {
  const raw = String(value ?? "").trim().replace(/[£,\s]/g, "");
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("Enter money as pounds and pence, for example 4250.00.");
  }
  return Math.round(Number(raw) * 100);
}

export function penceToPoundsInput(pence: number | null): string {
  return pence === null ? "" : (pence / 100).toFixed(2);
}

/** Parse a quantity with up to three decimals into thousandths. */
export function parseQtyToMilli(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(raw)) {
    throw new Error("Enter a positive quantity, up to three decimals.");
  }
  return Math.round(Number(raw) * 1000);
}

export function milliToQty(qtyMilli: number): number {
  return qtyMilli / 1000;
}
