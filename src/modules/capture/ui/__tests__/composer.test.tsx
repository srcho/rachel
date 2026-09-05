// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureComposer } from "../CaptureComposer";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("../CaptureOutbox", () => ({ saveCapture: mocks.save }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
    push: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  mocks.save.mockResolvedValue({ queued: false, result: { id: "saved-id" } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function submit() {
  await act(async () =>
    container
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
describe("quick capture", () => {
  it("previews a shared URL without writing until the user saves", async () => {
    await act(async () =>
      root.render(
        <CaptureComposer userId="u" shared initialText="https://example.com" />,
      ),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    await submit();
    expect(mocks.save).toHaveBeenCalledWith(
      "https://example.com",
      "share",
      undefined,
      expect.any(String),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/capture");
  });
  it("keeps failed input and reuses the same creation ID on retry", async () => {
    mocks.save.mockRejectedValueOnce(new Error("잠시 후 다시 저장해 주세요"));
    await act(async () =>
      root.render(<CaptureComposer userId="u" initialText="내 퀵메모" />),
    );
    await submit();
    expect(container.querySelector("textarea")?.value).toBe("내 퀵메모");
    expect(container.querySelector("[role=alert]")?.textContent).toContain(
      "다시 저장",
    );
    await submit();
    expect(mocks.save.mock.calls[0]).toEqual(mocks.save.mock.calls[1]);
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/capture/saved-id",
    );
  });
  it("restores only this user's draft and clears it after saving", async () => {
    localStorage.setItem(
      "rachel-capture:u",
      JSON.stringify({ text: "아직 안 보낸 메모", id: "draft-id" }),
    );
    localStorage.setItem(
      "rachel-capture:other",
      JSON.stringify({ text: "다른 계정의 메모", id: "other-id" }),
    );
    await act(async () => root.render(<CaptureComposer userId="u" />));
    expect(container.querySelector("textarea")?.value).toBe(
      "아직 안 보낸 메모",
    );
    await submit();
    expect(mocks.save).toHaveBeenCalledWith(
      "아직 안 보낸 메모",
      "text",
      undefined,
      "draft-id",
    );
    expect(localStorage.getItem("rachel-capture:u")).toBeNull();
    expect(localStorage.getItem("rachel-capture:other")).not.toBeNull();
  });
  it("distinguishes an offline queue from a successful server save", async () => {
    mocks.save.mockResolvedValue({ queued: true });
    await act(async () =>
      root.render(<CaptureComposer userId="u" initialText="오프라인 메모" />),
    );
    await submit();
    expect(container.querySelector("output")?.textContent).toContain(
      "기기에 보관됨",
    );
    expect(container.querySelector("a")).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
