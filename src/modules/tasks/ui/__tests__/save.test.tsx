// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardRow, ColumnRow } from "../../repository";
import { CardSheet } from "../CardSheet";
import { NewCardDialog } from "../NewCardDialog";

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
});
const column = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Todo",
  is_done: false,
} as ColumnRow;
const card = {
  id: "22222222-2222-4222-8222-222222222222",
  column_id: column.id,
  title: "회의 준비",
  description_md: "",
  priority: 2,
  due_at: "2026-09-05T01:23:45+00:00",
  due_has_time: true,
  labels: [],
  checklist: [],
  source: {},
} as unknown as CardRow;
async function input(title: string) {
  const el = container.querySelector<HTMLInputElement>(
    'input[aria-label="제목"]',
  );
  if (!el) throw new Error("title missing");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(el, title);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return el;
}

describe("task save outcomes", () => {
  it("keeps the new task and form open when saving fails", async () => {
    const close = vi.fn();
    const create = vi.fn(async () => ({
      status: "failed" as const,
      message: "서버 오류",
    }));
    await act(async () =>
      root.render(
        <NewCardDialog
          open
          columns={[column]}
          onClose={close}
          onCreate={create}
        />,
      ),
    );
    await input("실패해도 남을 할 일");
    await act(async () =>
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(create).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(container.querySelector("input")?.value).toBe("실패해도 남을 할 일");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "서버 오류",
    );
  });
  it("distinguishes queued writes from server saved and permits failure retry", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed", message: "저장 거부" })
      .mockResolvedValueOnce({ status: "queued" });
    const noop = vi.fn(async () => ({
      status: "saved" as const,
      value: undefined,
    }));
    await act(async () =>
      root.render(
        <CardSheet
          card={card}
          columns={[column]}
          onSave={save}
          onMove={noop}
          onArchive={noop}
          onDelete={noop}
          onClose={() => {}}
        />,
      ),
    );
    const title = await input("수정한 회의 준비");
    await act(async () =>
      title.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );
    expect(container.querySelector("output")?.textContent).toContain(
      "저장 실패",
    );
    const retry = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "다시 저장",
    );
    expect(retry).toBeTruthy();
    await act(async () => retry?.click());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]?.[1].dueAt).toBe(card.due_at);
    expect(container.querySelector("output")?.textContent).toContain(
      "기기에 저장 · 전송 대기",
    );
    expect(container.querySelector("output")?.textContent).not.toContain(
      "저장됨",
    );
  });
});
