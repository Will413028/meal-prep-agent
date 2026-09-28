import createClient from "openapi-fetch";
import type { paths } from "./schema";

export function createApiClient(baseUrl: string, fetcher: typeof fetch = fetch) {
  return createClient<paths>({ baseUrl, fetch: fetcher });
}
