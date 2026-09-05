"use client";
import { openDB } from "idb";

/**
 * 오프라인 뮤테이션 아웃박스. 서버 액션이 네트워크 오류로 실패하면 큐에 넣고, 온라인이 되면 순서대로 재생한다.
 * 액션 이름 → 실행 함수는 모듈이 register() 로 등록한다(코어는 모듈을 모른다).
 */
interface OutboxItem {
  id: string;
  action: string;
  args: unknown[];
  createdAt: number;
  attempts: number;
  userId?: string;
  error?: string;
}
type Handler = (...args: unknown[]) => Promise<unknown>;

export type MutationResult<T = void> =
  | { status: "saved"; value: T }
  | { status: "queued" }
  | { status: "failed"; message: string };

const handlers = new Map<string, Handler>();
const listeners = new Set<(n: number) => void>();
let replaying = false;
let currentUserId: string | undefined;
export function setOutboxUser(userId: string) {
  currentUserId = userId;
}

function db() {
  return openDB<{ outbox: { key: string; value: OutboxItem } }>(
    "rachel-outbox",
    1,
    {
      upgrade(d) {
        d.createObjectStore("outbox");
      },
    },
  );
}

export function registerOutboxHandler(action: string, fn: Handler): void {
  handlers.set(action, fn);
}

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET/i.test(
    msg,
  );
}

export async function enqueueOutbox(
  action: string,
  args: unknown[],
): Promise<string> {
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const tx = (await db()).transaction("outbox", "readwrite");
  const previous = await tx.store.getAll();
  const createdAt = Math.max(
    Date.now(),
    ...previous.map((item) => item.createdAt + 1),
  );
  await tx.store.put(
    { id, action, args, createdAt, attempts: 0, userId: currentUserId },
    id,
  );
  await tx.done;
  notify();
  return id;
}

/** 테스트·설정용 초기화 */
export async function clearOutbox(): Promise<void> {
  await (await db()).clear("outbox");
  notify();
}

export async function outboxCount(): Promise<number> {
  return (await (await db()).getAll("outbox")).filter(
    (item) => item.userId === currentUserId,
  ).length;
}

export function onOutboxChange(fn: (n: number) => void): () => void {
  listeners.add(fn);
  void outboxCount().then(fn);
  return () => listeners.delete(fn);
}
function notify() {
  void outboxCount().then((n) => {
    for (const l of listeners) l(n);
  });
}

/** 큐를 순서대로 재생. 네트워크 오류면 중단(다음 online 때), 서버 오류도 보존하고 중단한다. 이후 변경이 앞선 실패를 덮어쓰지 않게 순서를 지킨다. */
export async function replayOutbox(): Promise<{
  done: number;
  failed: number;
  remaining: number;
}> {
  if (replaying) return { done: 0, failed: 0, remaining: await outboxCount() };
  replaying = true;
  const replayUserId = currentUserId;
  let done = 0;
  let failed = 0;
  try {
    const d = await db();
    const items = (await d.getAll("outbox")).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    for (const item of items) {
      if (currentUserId !== replayUserId) break;
      if (item.userId !== replayUserId) continue;
      const fn = handlers.get(item.action);
      if (!fn) {
        failed++;
        break;
      }
      try {
        await fn(...item.args);
        await d.delete("outbox", item.id);
        done++;
      } catch (e) {
        if (isNetworkError(e)) break;
        console.warn("[outbox] 전송 실패, 기기에 보존", item.action, e);
        await d.put(
          "outbox",
          {
            ...item,
            attempts: item.attempts + 1,
            error: e instanceof Error ? e.message : "전송 실패",
          },
          item.id,
        );
        failed++;
        break;
      }
    }
  } finally {
    replaying = false;
    notify();
  }
  return { done, failed, remaining: await outboxCount() };
}

/** 온라인 액션 실행기: 실패가 네트워크 문제면 아웃박스에 넣고 성공한 것처럼 돌려준다(낙관적 상태 유지). */
export async function runOrQueue<T>(
  action: string,
  args: unknown[],
  fn: () => Promise<T>,
): Promise<{ result?: T; queued: boolean }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await enqueueOutbox(action, args);
    return { queued: true };
  }
  try {
    return { result: await fn(), queued: false };
  } catch (e) {
    if (isNetworkError(e)) {
      await enqueueOutbox(action, args);
      return { queued: true };
    }
    throw e;
  }
}
