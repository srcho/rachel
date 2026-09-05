// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TodayPlanData } from "../../today-plan";
import { DayClose, TodayPlan } from "../TodayPlan";

const mocks = vi.hoisted(() => ({
  plan: vi.fn(async () => ({ completed: 1, remaining: [] })),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/modules/tasks/actions", () => ({ planCardsAction: mocks.plan }));
vi.mock("@/modules/tasks/ui/ScheduleTask", () => ({
  ScheduleTask: ({ id }: { id: string }) => (
    <button type="button">시간 잡기 {id}</button>
  ),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
const card = {
  id: "task",
  title: "제안서 완성",
  boardId: "board",
  version: "v1",
  planDate: null,
  dueAt: "2026-09-09T00:00:00Z",
  dueHasTime: false,
  calendarEventId: null,
  url: "/tasks/board?card=task",
  estimatedMinutes: 60,
  estimateConfirmed: false,
  reason: "우선순위",
};
const data = {
  today: "2026-09-07",
  tomorrow: "2026-09-08",
  timezone: "Asia/Seoul",
  asOf: "2026-09-07T00:00:00Z",
  availableMinutes: 120,
  calendarStatus: null,
  calendarError: null,
  workStart: 9,
  workEnd: 19,
  outcomes: [card],
  planned: [{ ...card, planDate: "2026-09-07" }],
  deadlines: [],
  fixedEvents: [],
  tasksComplete: true,
} satisfies TodayPlanData;
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  if (!button) throw new Error(`Missing ${text}`);
  await act(async () => button.click());
}
it("only saves selected outcomes after an explicit click, using the read version", async () => {
  await act(async () => root.render(<TodayPlan data={data} />));
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(container.textContent).toContain("60분으로 임시 계산");
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('input[type="checkbox"]')
      ?.click(),
  );
  await click("오늘 계획에 넣기");
  expect(mocks.plan).toHaveBeenCalledWith(
    [{ id: "task", expectedVersion: "v1" }],
    "2026-09-07",
  );
  expect(container.textContent).toContain("시간 잡기 task");
});
it("keeping an unfinished plan performs no mutation", async () => {
  await act(async () => root.render(<DayClose data={data} />));
  await click("그대로 두기");
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(container.textContent).toContain("그대로 뒀어요");
});
it("tomorrow and remove send only the plan date and version", async () => {
  await act(async () => root.render(<DayClose data={data} />));
  await click("내일 계획");
  expect(mocks.plan).toHaveBeenLastCalledWith(
    [{ id: "task", expectedVersion: "v1" }],
    "2026-09-08",
  );
  await click("계획에서 빼기");
  expect(mocks.plan).toHaveBeenLastCalledWith(
    [{ id: "task", expectedVersion: "v1" }],
    null,
  );
});
