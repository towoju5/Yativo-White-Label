import { describe, it, expect } from "vitest";
import { runInDemoContext, getCurrentDemoContext, isDemoRequest } from "./demoContext.js";

function fakePrisma(): any {
  return { __fake: true };
}

describe("demoContext (AsyncLocalStorage)", () => {
  it("is undefined outside any demo context", () => {
    expect(getCurrentDemoContext()).toBeUndefined();
    expect(isDemoRequest()).toBe(false);
  });

  it("is visible inside runInDemoContext, including across awaits", async () => {
    await runInDemoContext(
      { isDemoRequest: true, demoSessionId: "demo-1", demoDatabaseName: "demo_aaaa", demoPrisma: fakePrisma() },
      async () => {
        expect(isDemoRequest()).toBe(true);
        await new Promise((r) => setTimeout(r, 5));
        expect(getCurrentDemoContext()?.demoSessionId).toBe("demo-1");
      },
    );
  });

  it("does not leak between concurrent 'requests' running interleaved", async () => {
    const results: string[] = [];

    async function simulateRequest(demoSessionId: string, delayMs: number) {
      await runInDemoContext(
        { isDemoRequest: true, demoSessionId, demoDatabaseName: `demo_${demoSessionId}`, demoPrisma: fakePrisma() },
        async () => {
          await new Promise((r) => setTimeout(r, delayMs));
          // If context leaked from another concurrent call, this would read the wrong session id.
          const ctx = getCurrentDemoContext();
          results.push(`${demoSessionId}:${ctx?.demoSessionId}`);
        },
      );
    }

    await Promise.all([
      simulateRequest("a", 15),
      simulateRequest("b", 5),
      simulateRequest("c", 10),
    ]);

    expect(results.sort()).toEqual(["a:a", "b:b", "c:c"]);
  });

  it("reverts to undefined after runInDemoContext returns", async () => {
    await runInDemoContext(
      { isDemoRequest: true, demoSessionId: "demo-x", demoDatabaseName: "demo_x", demoPrisma: fakePrisma() },
      async () => {
        expect(isDemoRequest()).toBe(true);
      },
    );
    expect(isDemoRequest()).toBe(false);
  });
});
