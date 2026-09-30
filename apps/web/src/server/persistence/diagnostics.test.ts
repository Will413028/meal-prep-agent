import { expect, test, vi } from "vitest";
import { sessionHttp } from "./http";
import type { SessionStore } from "./sessions";

test("storage faults emit safe diagnostics without cookie or exception payload", async () => {
  const warn = vi.spyOn(console,"warn").mockImplementation(()=>{});
  const token="a".repeat(64);
  const store={find:async()=>{throw new Error("private-snapshot-sentinel");}} as unknown as SessionStore;
  try {
    const result=await sessionHttp(new Request("https://meal.test/api/plan",{headers:{cookie:`__Host-meal_session=${token}`}}),store);
    expect(result.status).toBe(503);
    expect(warn).toHaveBeenCalled();
    const output=warn.mock.calls.flat().join(" ");
    expect(JSON.parse(output)).toMatchObject({event:"persistence_error",code:"storage_unavailable",status:503});
    expect(output).not.toContain(token);
    expect(output).not.toContain("private-snapshot-sentinel");
  } finally {warn.mockRestore();}
});
