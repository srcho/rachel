import type { Registry } from "./registry";

/**
 * 조립된 레지스트리 접근점. src/modules/index.ts 가 setRegistry() 로 등록한다.
 * 모듈 내부 코드(actions·jobs·tools)는 `@/modules` 를 정적 import 하면 순환이 생기므로 여기서 받는다.
 */
let current: Registry | undefined;

export function setRegistry(r: Registry): void {
  current = r;
}

export async function getRegistry(): Promise<Registry> {
  if (!current) {
    await import("@/modules"); // 조립 루트를 지연 로드(정적 순환 없음)
  }
  if (!current) throw new Error("레지스트리가 아직 조립되지 않았어요");
  return current;
}
