import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("refuses upstream redirects while using the Workers-supported manual mode", async () => {
  vi.stubEnv("MEAL_API_ORIGIN", "http://127.0.0.1:14318");
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.invalid" } }));
  vi.stubGlobal("fetch", fetchMock);
  const response = await POST(new Request("http://localhost/api/v1/goals/validate", { method: "POST", body: "{}" }));
  expect(fetchMock.mock.calls[0][1].redirect).toBe("manual");
  expect(response.status).toBe(502);
});
