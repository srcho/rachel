import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizeTriage, triageOutputSchema } from "../schema";
import { captureUrl } from "../url";

describe("capture structured output", () => {
  it("does not persist an empty task proposal", () => {
    expect(() =>
      normalizeTriage({
        type: "task",
        reason: "",
        task: null,
        event: null,
        memory: null,
      }),
    ).toThrow("분류 결과가 비어");
  });
  it("requires every nested property for OpenAI strict mode", () => {
    function check(node: unknown) {
      if (!node || typeof node !== "object") return;
      const schema = node as Record<string, unknown>;
      if (schema.type === "object") {
        expect(schema.required).toEqual(
          Object.keys(schema.properties as object),
        );
        expect(schema.additionalProperties).toBe(false);
      }
      for (const value of Object.values(schema)) {
        if (Array.isArray(value)) value.forEach(check);
        else check(value);
      }
    }
    check(z.toJSONSchema(triageOutputSchema));
  });
  it("normalizes empty proposals and absent locations for existing consumers", () => {
    expect(
      normalizeTriage({
        type: "note",
        reason: "참고 링크",
        task: null,
        event: null,
        memory: null,
      }),
    ).toEqual({ type: "note", reason: "참고 링크" });
    const result = normalizeTriage({
      type: "event",
      reason: "회의",
      task: null,
      memory: null,
      event: {
        title: "기획 회의",
        startAt: "2026-09-06T10:00:00+09:00",
        endAt: "2026-09-06T11:00:00+09:00",
        allDay: false,
        location: null,
      },
    });
    expect(result.event?.location).toBeUndefined();
    expect(result.event?.title).toBe("기획 회의");
  });
});

describe("pasted links", () => {
  it("recognizes links in a note and preserves query parameters", () => {
    expect(
      captureUrl("나중에 읽기\nhttps://example.com/a?q=one&x=two#part"),
    ).toBe("https://example.com/a?q=one&x=two#part");
    expect(captureUrl("참고 https://example.com/test.")).toBe(
      "https://example.com/test",
    );
  });
  it("does not turn arbitrary or executable text into a link", () => {
    expect(captureUrl("일반 메모")).toBeUndefined();
    expect(captureUrl("javascript:alert(1)")).toBeUndefined();
    expect(captureUrl("https://")).toBeUndefined();
  });
});
