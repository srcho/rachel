import { beforeEach, expect, it, vi } from "vitest";
import { resolveCaptureAction, retriageAction } from "../actions";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  triage: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/core/context", () => ({ userContext: async () => ({}) }));
vi.mock("../service", () => ({ captureService: () => mocks }));

beforeEach(() => {
  vi.resetAllMocks();
});

it("returns a safe, retryable result for a database failure instead of throwing a production React error", async () => {
  const error = {
    code: "PGRST204",
    message: "Could not find the index_status column of memories",
  };
  mocks.resolve.mockRejectedValue(error);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = await resolveCaptureAction("capture-id");
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("원문"),
    });
    expect(JSON.stringify(result)).not.toContain("index_status");
    expect(log).toHaveBeenCalledWith("[capture.resolve]", {
      id: "capture-id",
      error,
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

it("refreshes the inbox, today and destination after confirmation", async () => {
  const result = { type: "memory", changed: true, ref: { id: "memory-id" } };
  mocks.resolve.mockResolvedValue(result);
  expect(await resolveCaptureAction("capture-id")).toEqual({
    ok: true,
    result,
  });
  expect(mocks.revalidate).toHaveBeenCalledWith("/capture", "layout");
  expect(mocks.revalidate).toHaveBeenCalledWith("/today");
  expect(mocks.revalidate).toHaveBeenCalledWith("/memory");
});

it("keeps model provider errors on the server and explains that the original is saved", async () => {
  mocks.triage.mockRejectedValue(
    new Error("Invalid schema for response_format"),
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await retriageAction("capture-id")).toEqual({
      ok: false,
      error: expect.stringContaining("원문은 저장되어 있어요"),
    });
  } finally {
    log.mockRestore();
  }
});
