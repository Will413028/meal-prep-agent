import Decimal from "decimal.js";

export function parseTarget(value: string): number | { min: number; max: number } | null {
  if (!value.trim()) return null;
  const parts = value.trim().split("..");
  if (parts.length > 2) throw new Error("請輸入單值或下限..上限");
  const numbers = parts.map((part) => {
    if (!/^\d+(?:\.\d+)?$/.test(part.trim())) throw new Error("請輸入十進位數字");
    const decimal = new Decimal(part.trim());
    if (!decimal.isFinite() || decimal.decimalPlaces() > 1 || decimal.gt(5000)) throw new Error("數值最多一位小數且不得超出支援範圍");
    return decimal.toNumber();
  });
  if (numbers.length === 1) return numbers[0];
  if (numbers[0] > numbers[1]) throw new Error("下限不得大於上限");
  return { min: numbers[0], max: numbers[1] };
}
