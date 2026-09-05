import { describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { memoryModule } from "../module";

describe("memory triggers", () => {
  it("does not discard a newer summary behind a pending old version", async () => {
    const handler = memoryModule.eventHandlers?.find(
      (h) => h.on === "meeting.summarized",
    );
    if (!handler) throw new Error("missing summary handler");
    const enqueue = vi.fn();
    const ctx = { enqueue } as unknown as ServiceContext;
    for (const version of [1, 2]) {
      await handler.handle(
        {
          type: "meeting.summarized",
          id: crypto.randomUUID(),
          userId: "u",
          occurredAt: new Date().toISOString(),
          actor: "user",
          entity: { type: "meeting", id: "m" },
          payload: { version, summaryText: `summary ${version}` },
        },
        ctx,
      );
    }
    expect(enqueue.mock.calls[0]?.[0].dedupeKey).not.toBe(
      enqueue.mock.calls[1]?.[0].dedupeKey,
    );
    expect(enqueue.mock.calls[1]?.[0].payload.version).toBe(2);
  });
});
