import { describe, expect, it } from "vitest";
import { resultLinks } from "../dock/result-links";

const id = "11111111-1111-4111-8111-111111111111";
const board = "22222222-2222-4222-8222-222222222222";

describe("assistant result destinations", () => {
  it.each([
    "meetings_reviewActionItems",
    "meetings_createTasksFromActionItems",
  ])("%s opens the created resource instead of treating its id as a meeting", (name) => {
    const href = `/tasks/${board}?card=${id}`;
    expect(
      resultLinks(name, { results: [{ id, href, kind: "task" }] }),
    ).toEqual([{ href, title: "결과 열기" }]);
    expect(
      resultLinks(name, { results: [{ id, href: `/calendar?event=${id}` }] })[0]
        ?.href,
    ).toBe(`/calendar?event=${id}`);
    expect(
      resultLinks(name, { results: [{ id, href: "https://evil.example" }] }),
    ).toEqual([]);
  });
  it("opens a memory directly even when it is outside the current page", () => {
    expect(resultLinks("memory_get", { id, content: "기억" })[0]?.href).toBe(
      `/memory?id=${id}#memory-${id}`,
    );
  });
});
