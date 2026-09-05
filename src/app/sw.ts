import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // AI·전사·잡 라우트는 절대 캐시하지 않는다
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/api/chat") ||
        url.pathname.startsWith("/api/meetings") ||
        url.pathname.startsWith("/api/jobs"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// ── 웹 푸시 ──
self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data?.json() as {
        title?: string;
        body?: string;
        url?: string;
        tag?: string;
        taskId?: string;
      };
    } catch {
      return { title: "Rachel", body: event.data?.text() ?? "" };
    }
  })();
  event.waitUntil(
    self.registration.showNotification(data?.title ?? "Rachel", {
      body: data?.body ?? "",
      tag: data?.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data?.url ?? "/today", taskId: data?.taskId },
      ...(data?.taskId
        ? {
            actions: [
              { action: "complete", title: "완료" },
              { action: "snooze", title: "15분 뒤 알림" },
            ],
          }
        : {}),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const taskId = (event.notification.data as { taskId?: string } | undefined)
    ?.taskId;
  if (taskId && (event.action === "complete" || event.action === "snooze")) {
    event.waitUntil(
      fetch("/api/push/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId, action: event.action }),
      })
        .then(async (res) => {
          if (!res.ok)
            await self.registration.showNotification("처리하지 못했어요", {
              body: "앱을 열어 다시 시도해 주세요.",
              data: { url: event.notification.data.url },
            });
        })
        .catch(() =>
          self.registration.showNotification("연결 후 다시 시도해 주세요", {
            body: "할 일은 변경하지 않았어요.",
            data: { url: event.notification.data.url },
          }),
        ),
    );
    return;
  }
  const url =
    (event.notification.data as { url?: string } | undefined)?.url ?? "/today";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        const existing = list.find((c) => "focus" in c);
        if (existing) {
          void existing.navigate(url);
          return existing.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
