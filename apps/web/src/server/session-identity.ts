export function cookieToken(request: Request): string | null {
  const values = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith("__Host-meal_session="));
  return values.length === 1 ? values[0].slice("__Host-meal_session=".length) : null;
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

export async function hash(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
