import type { RachelModule } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { helloModule } from "./_hello/module";

/** 기능 추가 = 여기에 한 줄. 순서는 nav order 와 무관. */
export const modules: RachelModule[] = [helloModule];

export const registry = createRegistry(() => modules);
