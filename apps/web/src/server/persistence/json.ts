import Decimal from "decimal.js";

// Worker actions are forwarded as JSON numbers. Reject lossy input before it
// can bypass Python's Decimal precision/range validation through JS rounding.
export function parseActionJson(text: string): unknown {
  return JSON.parse(text, (_key, value, context?: {source?: string}) => {
    if (typeof value !== "number") return value;
    const source = context?.source;
    if (!source || !Number.isFinite(value)
      || (value === 0 && /[1-9]/.test(source.split(/[eE]/)[0]))
      || !new Decimal(source).equals(new Decimal(value.toString()))) {
      throw new Error("Lossy JSON number");
    }
    return value;
  });
}
