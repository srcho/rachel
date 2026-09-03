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
      };
    } catch {
      return { title: "Rachel", body: event.data?.text() ?? "" };
    }
  })();
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Rachel", {
      body: data.body ?? "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
