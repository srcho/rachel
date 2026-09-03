import { describe, expect, it } from "vitest";
import { registry } from "@/modules";

/** 실제 모듈 조립 회귀 테스트: 잡·도구·위젯 키가 빠지면 프로덕션에서 '핸들러 없음' 이 난다 */
describe("assembled registry", () => {
  it("exposes job handlers for every scheduled job type", () => {
    const jobs = Object.keys(registry.jobHandlers());
    expect(jobs).toEqual(
      expect.arrayContaining([
        "calendar.sync",
        "insights.brief",
        "memory.extract",
        "meetings.postprocess",
      ]),
    );
  });
  it("exposes tools with module prefixes", () => {
    const tools = Object.keys(registry.tools());
    expect(tools).toEqual(
      expect.arrayContaining([
        "tasks.create",
        "calendar.findFreeSlots",
        "memory.remember",
        "insights.generateBrief",
      ]),
    );
  });
  it("has today widgets ordered", () => {
    expect(registry.widgets("today").map((w) => w.id)).toEqual([
      "insights.brief",
      "calendar.today",
      "tasks.due",
      "meetings.recent",
    ]);
  });
});
