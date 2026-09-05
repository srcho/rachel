// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { SuggestionRow } from "../proactive";
import { ProactiveCards } from "../proactive-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../proactive-actions", () => ({ respondSuggestionAction: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("A34 displays one primary suggestion and keeps extras collapsed", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const rows = [0, 1, 2].map(
    (i) =>
      ({
        id: String(i),
        kind: "time_conflict",
        title: `제안 ${i}`,
        body: "확인할 내용",
        href: "/today",
        updated_at: "2026-09-05T00:00:00Z",
      }) as SuggestionRow,
  );
  await act(async () =>
    root.render(<ProactiveCards items={rows} notices={[]} />),
  );
  expect(container.querySelectorAll("section > article")).toHaveLength(1);
  expect(container.querySelector("details")?.open).toBe(false);
  expect(container.querySelectorAll("details article")).toHaveLength(2);
  expect(container.textContent).toContain("이런 제안 끄기");
  await act(async () => root.unmount());
  container.remove();
});
