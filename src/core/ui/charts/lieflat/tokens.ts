/**
 * lieflat-charts(https://github.com/larashero3-dotcom/lieflat-charts) 의 Basics 갤러리를 React SVG 로 옮긴 것.
 * 라이브러리가 아니라 HTML 템플릿 스킬이라 import 할 수 없어, 갤러리의 기하·규칙(mono-tokens.js)을 재구현했다.
 * 규칙: 명도 = 데이터(가장 중요 = 가장 진함), 실심, 발스트로크 0.6–1px, 1 단위 = 셀 수 있는 실제 단위,
 * 결정적 지터(rnd), 카드 = 결론 제목 + 부제(범례·기간) + 그림 + 대문자 출처행.
 * 색은 테마 변수로(라이트 = 종이/먹, 다크는 자동 반전).
 */
export const INK = "var(--foreground)";
export const PAPER = "var(--card)";
export const MUTED = "var(--muted-foreground)";
export const GRID = "var(--border)";
/** 7단 회색 ladder(진함→옅음). 다중 시리즈는 중요도 순으로 앞에서부터 */
export const LADDER = [
  "var(--foreground)",
  "color-mix(in oklch, var(--foreground) 72%, var(--card))",
  "color-mix(in oklch, var(--foreground) 55%, var(--card))",
  "var(--muted-foreground)",
  "color-mix(in oklch, var(--muted-foreground) 70%, var(--card))",
  "color-mix(in oklch, var(--muted-foreground) 50%, var(--card))",
  "color-mix(in oklch, var(--muted-foreground) 32%, var(--card))",
];
export const FAINT = LADDER[5] as string;

/** 결정적 의사난수 — 새로고침해도 같은 그림(mono-tokens.rnd) */
export const rnd = (i: number, k: number) =>
  Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000;

/** 값이 크면 한 칸(=한 단위)을 2·5·10… 로 올려 칸 수를 ≤ max 로 */
export function unitFor(maxValue: number, maxRungs = 40): number {
  if (maxValue <= maxRungs) return 1;
  const candidates = [2, 5, 10, 20, 50, 100, 200, 500, 1000];
  return candidates.find((u) => maxValue / u <= maxRungs) ?? 1000;
}

export const AXIS = {
  fontSize: 7.5,
  weight: 600,
  spacing: ".08em",
} as const;
