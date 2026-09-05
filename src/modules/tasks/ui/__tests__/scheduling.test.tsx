// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScheduleTask } from "../ScheduleTask";

const actions = vi.hoisted(() => ({
  taskSlotsAction: vi.fn(async () => ({
    timezone: "Asia/Seoul",
    slots: [{ startAt: "2026-09-07T01:00:00Z", endAt: "2026-09-07T02:00:00Z" }],
  })),
  rescheduleTaskAction: vi.fn(async () => ({ id: "replacement" })),
  scheduleTaskAction: vi.fn(async () => ({ id: "new" })),
  unscheduleTaskAction: vi.fn(async () => ({ scheduled: false })),
}));
vi.mock("../../actions", () => actions);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => button.click());
}
it("A10 a stale linked block can be repaired and cancelled from the task UI", async () => {
  await act(async () =>
    root.render(<ScheduleTask id="task" linkedId="deleted" />),
  );
  await click("빈 시간 찾기");
  await click("분에 잡기");
  expect(actions.rescheduleTaskAction).toHaveBeenCalledWith({
    cardId: "task",
    startAt: "2026-09-07T01:00:00Z",
    durationMinutes: 60,
  });
  expect(container.querySelector("a")?.getAttribute("href")).toBe(
    "/calendar?event=replacement",
  );
  await click("시간 취소");
  expect(actions.unscheduleTaskAction).toHaveBeenCalledWith("task");
  expect(container.querySelector("a")).toBeNull();
  await click("빈 시간 찾기");
  await click("분에 잡기");
  expect(actions.scheduleTaskAction).toHaveBeenCalledOnce();
});
