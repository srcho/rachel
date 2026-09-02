import type {
  Command,
  ContextProvider,
  DashboardWidget,
  EventHandler,
  Indexer,
  JobHandler,
  ModuleManifest,
  RachelModule,
  SettingsSection,
  WidgetSurface,
} from "@/core/contracts";
import type { AnyAgentTool } from "@/core/contracts/tool";

export interface NavEntry extends ModuleManifest {
  href: string;
  order: number;
  mobileTab: boolean;
}

/** 글롭 매칭: 'task.*' 는 'task.created' 에, '*' 는 전부에 매칭 */
export function matchesEventPattern(pattern: string, type: string): boolean {
  if (pattern === "*" || pattern === type) return true;
  if (pattern.endsWith(".*")) return type.startsWith(pattern.slice(0, -1));
  return false;
}

/**
 * 모듈 배열을 받아 파생물을 조립한다. 로더를 지연 호출해 순환 import를 피한다.
 * 코어는 모듈을 모른다: 인스턴스는 src/modules/index.ts 에서 만든다.
 */
export class Registry {
  private cache: RachelModule[] | undefined;

  constructor(private readonly loader: () => RachelModule[]) {}

  modules(): RachelModule[] {
    if (!this.cache) {
      const mods = this.loader();
      const ids = new Set<string>();
      for (const m of mods) {
        if (ids.has(m.manifest.id))
          throw new Error(`모듈 id 중복: ${m.manifest.id}`);
        ids.add(m.manifest.id);
      }
      this.cache = mods;
    }
    return this.cache;
  }

  module(id: string): RachelModule | undefined {
    return this.modules().find((m) => m.manifest.id === id);
  }

  /** { 'tasks.create': tool, … } */
  tools(): Record<string, AnyAgentTool> {
    const out: Record<string, AnyAgentTool> = {};
    for (const m of this.modules()) {
      for (const [name, tool] of Object.entries(m.tools ?? {})) {
        out[`${m.manifest.id}.${name}`] = tool;
      }
    }
    return out;
  }

  /** { 'meetings.postprocess': handler, … } */
  // biome-ignore lint/suspicious/noExplicitAny: 잡 페이로드 타입은 잡마다 다르다
  jobHandlers(): Record<string, JobHandler<any>> {
    // biome-ignore lint/suspicious/noExplicitAny: 위와 같음
    const out: Record<string, JobHandler<any>> = {};
    for (const m of this.modules()) {
      for (const [name, handler] of Object.entries(m.jobs ?? {})) {
        out[`${m.manifest.id}.${name}`] = handler;
      }
    }
    return out;
  }

  eventHandlers(type: string): EventHandler[] {
    return this.modules().flatMap((m) =>
      (m.eventHandlers ?? []).filter((h) =>
        (Array.isArray(h.on) ? h.on : [h.on]).some((p) =>
          matchesEventPattern(p, type),
        ),
      ),
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: 위젯 데이터 타입은 위젯마다 다르다
  widgets(surface: Exclude<WidgetSurface, "both">): DashboardWidget<any>[] {
    return this.modules()
      .flatMap((m) => m.widgets ?? [])
      .filter((w) => w.surface === surface || w.surface === "both")
      .sort((a, b) => a.order - b.order);
  }

  contextProviders(): ContextProvider[] {
    return this.modules().flatMap((m) => m.contextProviders ?? []);
  }

  indexers(eventType?: string): Indexer[] {
    const all = this.modules().flatMap((m) => m.indexers ?? []);
    if (!eventType) return all;
    return all.filter((i) =>
      i.on.some((p) => matchesEventPattern(p, eventType)),
    );
  }

  nav(): NavEntry[] {
    return this.modules()
      .filter((m) => m.manifest.nav)
      .map((m) => {
        const nav = m.manifest.nav as NonNullable<ModuleManifest["nav"]>;
        return {
          ...m.manifest,
          href: nav.href,
          order: nav.order,
          mobileTab: nav.mobileTab ?? false,
        };
      })
      .sort((a, b) => a.order - b.order);
  }

  commands(): Command[] {
    return this.modules().flatMap((m) => m.commands ?? []);
  }

  settings(): SettingsSection[] {
    return this.modules()
      .flatMap((m) => (m.settings ? [m.settings] : []))
      .sort((a, b) => a.order - b.order);
  }
}

export function createRegistry(loader: () => RachelModule[]): Registry {
  return new Registry(loader);
}
