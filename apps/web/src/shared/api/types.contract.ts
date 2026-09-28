import { createApiClient } from "./client";

// Compile-only counterexamples; this function is never executed.
function checkContract() {
  const api = createApiClient("http://127.0.0.1");
  api.POST("/api/v1/goals/validate", { body: { schemaVersion: 1, kcal: 2000, protein: 100 } });
  // @ts-expect-error unsupported method
  api.GET("/api/v1/goals/validate");
  // @ts-expect-error energy must be a JSON number or explicit range
  api.POST("/api/v1/goals/validate", { body: { schemaVersion: 1, kcal: "2000", protein: 100 } });
  // @ts-expect-error unknown schema version
  api.POST("/api/v1/goals/validate", { body: { schemaVersion: 2, kcal: 2000, protein: 100 } });
}
void checkContract;
