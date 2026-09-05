import { beforeEach, expect, it } from "vitest";
import { useDock } from "../dock/store";

beforeEach(() => {
  useDock.setState({
    threadId: "active",
    drafts: { active: "draft", other: "keep" },
    conversations: { active: [], other: [] },
  });
});

it("removing the active thread clears its messages and draft and starts a new thread", () => {
  useDock.getState().removeThread("active");
  const state = useDock.getState();
  expect(state.threadId).not.toBe("active");
  expect(state.threadId).toMatch(/^[0-9a-f-]{36}$/);
  expect(state.drafts).toEqual({ other: "keep" });
  expect(state.conversations).toEqual({ other: [] });
});

it("removing another thread clears only its data and preserves the active thread", () => {
  useDock.getState().removeThread("other");
  const state = useDock.getState();
  expect(state.threadId).toBe("active");
  expect(state.drafts).toEqual({ active: "draft" });
  expect(state.conversations).toEqual({ active: [] });
});
