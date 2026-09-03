"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  sendTestPushAction,
  setNotificationPrefAction,
  unsubscribePushAction,
} from "../actions";
import {
  KIND_LABEL,
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "../schema";

function b64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotifyControls({
  subscriptions,
  prefs,
  vapidPublicKey,
}: {
  subscriptions: number;
  prefs: Record<NotificationKind, boolean>;
  vapidPublicKey: string;
}) {
  const [pending, start] = useTransition();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [thisDevice, setThisDevice] = useState<PushSubscription | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok)
      void navigator.serviceWorker.ready
        .then((r) => r.pushManager.getSubscription())
        .then(setThisDevice);
  }, []);

  async function enable() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return toast.error("알림 권한이 거부됐어요");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(vapidPublicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("구독 저장 실패");
      setThisDevice(sub);
      toast.success("이 기기에서 알림을 받아요");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "알림 설정 실패");
    }
  }
  async function disable() {
    if (!thisDevice) return;
    await unsubscribePushAction(thisDevice.endpoint);
    await thisDevice.unsubscribe();
    setThisDevice(null);
    toast.success("이 기기 알림을 껐어요");
  }

  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p>
            {supported === false
              ? "이 브라우저는 푸시를 지원하지 않아요. iOS 는 홈 화면에 설치한 뒤 설정하세요."
              : thisDevice
                ? "이 기기에서 알림을 받고 있어요"
                : "이 기기 알림 꺼짐"}
          </p>
          <p className="text-xs text-muted-foreground">
            등록된 기기 {subscriptions}대
          </p>
        </div>
        {supported &&
          (thisDevice ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  start(async () => {
                    const r = await sendTestPushAction();
                    toast.message(`테스트 전송 ${r.sent}건`);
                  })
                }
                disabled={pending}
              >
                테스트
              </Button>
              <Button size="sm" variant="ghost" onClick={disable}>
                끄기
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={enable} disabled={!vapidPublicKey}>
              이 기기에서 켜기
            </Button>
          ))}
      </div>
      <ul className="divide-y">
        {NOTIFICATION_KINDS.map((k) => (
          <li key={k} className="flex items-center justify-between py-1.5">
            <span>{KIND_LABEL[k]}</span>
            <Switch
              checked={prefs[k]}
              disabled={pending}
              onCheckedChange={(v) =>
                start(() => setNotificationPrefAction(k, v))
              }
              aria-label={KIND_LABEL[k]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
