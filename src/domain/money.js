// Money is always integer pence; VAT is integer basis points.
export function vatFromNet(netPence, vatRateBp) {
  return Math.round((netPence * vatRateBp) / 10000);
}

export function grossFromNet(netPence, vatRateBp) {
  return netPence + vatFromNet(netPence, vatRateBp);
}

export function formatMoney(pence, currency = "GBP") {
  if (pence === null || pence === undefined || Number.isNaN(Number(pence))) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(pence) / 100);
}

export function lineAmount(qty, unitPence) {
  return Math.round(Number(qty) * Number(unitPence));
}

export function parsePoundsToPence(value) {
  const normalised = String(value ?? "").replace(/[£,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalised)) throw new Error("Enter an amount in pounds, e.g. 4250.00");
  return Math.round(Number(normalised) * 100);
}

export function penceToPoundsInput(pence) {
  if (pence === null || pence === undefined) return "";
  return (Number(pence) / 100).toFixed(2);
}
