// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Triage } from "../../schema";
import type { CaptureRow } from "../../service";
import { CaptureReview } from "../CaptureReview";

const resolve = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("../../actions", () => ({ resolveCaptureAction: resolve }));
vi.mock("@/core/ui/FormDialog", () => ({
  FormDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});
async function editTitle(triage: Triage) {
  await act(async () =>
    root.render(
      <CaptureReview
        capture={
          {
            id: "capture",
            raw_text: "원본",
            status: "triaged",
            triage,
          } as unknown as CaptureRow
        }
        onDone={() => {}}
      />,
    ),
  );
  await act(async () => container.querySelector("button")?.click());
  const el = container.querySelector("textarea");
  if (!el) throw new Error("missing title");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(el, "수정 제목");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
it("preserves date-only deadline and exact due timestamp when editing only the title", async () => {
  const task = {
    title: "원본",
    due: "2026-09-06T23:59:00+09:00",
    dueHasTime: false,
    priority: 2,
  };
  await editTitle({ type: "task", reason: "", task });
  expect(resolve).toHaveBeenCalledWith(
    "capture",
    expect.objectContaining({ task: { ...task, title: "수정 제목" } }),
  );
});
it("preserves all-day dates and location when editing only the title", async () => {
  const event = {
    title: "원본",
    startAt: "2026-09-06T00:00:00+09:00",
    endAt: "2026-09-07T00:00:00+09:00",
    allDay: true,
    location: "서울",
  };
  await editTitle({ type: "event", reason: "", event });
  expect(resolve).toHaveBeenCalledWith(
    "capture",
    expect.objectContaining({ event: { ...event, title: "수정 제목" } }),
  );
});
