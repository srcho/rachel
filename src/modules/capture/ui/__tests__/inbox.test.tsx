// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureRow } from "../../service";
import { CaptureDetail } from "../CaptureDetail";

const actions = vi.hoisted(() => ({
  restore: vi.fn().mockResolvedValue({ changed: true }),
  dismiss: vi
    .fn()
    .mockResolvedValue({ changed: false, reason: "이미 처리한 메모예요" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/core/realtime/useTableChanges", () => ({
  useTableChanges: vi.fn(),
}));
vi.mock("../../actions", () => ({
  restoreCaptureAction: actions.restore,
  dismissCaptureAction: actions.dismiss,
  resolveCaptureAction: vi.fn(),
  retriageAction: vi.fn(),
  editCaptureAction: vi.fn(),
  deleteCaptureAction: vi.fn(),
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
const capture = {
  id: "22222222-2222-4222-8222-222222222222",
  raw_text: "보관한 참고 메모 원문",
  user_id: "u",
  created_at: "2026-09-05T00:00:00Z",
  updated_at: "2026-09-05T00:00:00Z",
  origin: "text",
  status: "resolved",
  url: null,
  triage: { type: "note", reason: "" },
  resolved_ref: { type: "note" },
} as CaptureRow;

describe("processed capture detail", () => {
  it("keeps the full text and stable link visible and reopens the same note", async () => {
    await act(async () =>
      root.render(<CaptureDetail capture={capture} userId="u" />),
    );
    expect(container.textContent).toContain(capture.raw_text);
    expect(container.textContent).toContain("처리 완료");
    expect(
      container.querySelector(`a[href='/capture/${capture.id}']`),
    ).not.toBeNull();
    const restore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "수집함으로 복원",
    );
    if (!restore) throw new Error("missing restore");
    await act(async () => restore.click());
    expect(actions.restore).toHaveBeenCalledWith(capture.id);
  });

  it("allows correcting or cancelling legacy invalid dates but freezes uncertain valid plans", async () => {
    const invalid = {
      ...capture,
      status: "resolving",
      resolved_ref: null,
      triage: {
        type: "task",
        reason: "",
        task: { title: "날짜 오류", due: "tomorrow", priority: 2 },
      },
    } as CaptureRow;
    await act(async () =>
      root.render(<CaptureDetail capture={invalid} userId="u" />),
    );
    expect(container.textContent).toContain("날짜 확인 필요");
    expect(
      container.querySelector<HTMLButtonElement>("button[aria-label='무시']")
        ?.disabled,
    ).toBe(false);
    const correction = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "수정 후 확정",
    );
    expect(correction?.disabled).toBe(false);
    const valid = {
      ...invalid,
      triage: {
        type: "task",
        reason: "",
        task: {
          title: "결과 확인 중",
          due: "2026-09-06T00:00:00Z",
          priority: 2,
        },
      },
    } as CaptureRow;
    await act(async () =>
      root.render(<CaptureDetail capture={valid} userId="u" />),
    );
    expect(
      container.querySelector<HTMLButtonElement>("button[aria-label='무시']")
        ?.disabled,
    ).toBe(true);
    expect(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "수정 후 확정",
      )?.disabled,
    ).toBe(true);
  });
});
