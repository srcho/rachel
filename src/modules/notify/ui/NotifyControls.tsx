"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  sendTestPushAction,
  setNotificationPrefAction,
  setReminderSettingsAction,
  setSuggestionKindAction,
  snoozeNotificationsAction,
  unsubscribePushAction,
} from "../actions";
import {
  KIND_LABEL,
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "../constants";

function b64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotifyControls({
  subscriptions,
  snoozedUntil,
  disabledSuggestionKinds,
  reminders,
  prefs,
  vapidPublicKey,
}: {
  subscriptions: number;
  snoozedUntil: string | null;
  disabledSuggestionKinds: string[];
  reminders: {
    quietStart: number;
    quietEnd: number;
    morningHour: number;
    calendarAlongsideGoogle: boolean;
  };
  prefs: Record<NotificationKind, boolean>;
  vapidPublicKey: string;
}) {
  const [r, setR] = useState(reminders);
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
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
            <div className="flex shrink-0 flex-wrap gap-1">
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
      <p className="text-xs text-muted-foreground">
        시각 있는 마감과 일정은 10분 전, 날짜만 있는 할 일은 아침에 모아 알려요.
        Google 알림이 설정된 일정은 기본적으로 Google에서만 받아요.
      </p>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-xs">
          조용한 시간·중복 알림 설정
        </summary>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["quietStart", "조용한 시간 시작"],
                ["quietEnd", "조용한 시간 종료"],
                ["morningHour", "아침 알림"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs">
                {label}
                <select
                  aria-label={label}
                  className="ml-1 rounded border bg-background p-2"
                  value={r[key]}
                  onChange={(e) =>
                    setR({ ...r, [key]: Number(e.target.value) })
                  }
                >
                  {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                    <option key={h} value={h}>
                      {h}시
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={r.calendarAlongsideGoogle}
              onChange={(e) =>
                setR({ ...r, calendarAlongsideGoogle: e.target.checked })
              }
            />
            Google 알림이 있어도 레이첼 알림 함께 받기
          </label>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  await setReminderSettingsAction(r);
                  toast.success("알림 설정을 저장했어요");
                } catch {
                  toast.error("알림 설정을 저장하지 못했어요");
                }
              })
            }
          >
            저장
          </Button>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {snoozedUntil && Date.parse(snoozedUntil) > Date.now()
            ? `알림 일시 중지: ${new Date(snoozedUntil).toLocaleString()}`
            : "알림 수신 중"}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                await snoozeNotificationsAction(
                  new Date(Date.now() + 3600000).toISOString(),
                );
              } catch {
                toast.error("알림을 미루지 못했어요");
              }
            })
          }
        >
          1시간 동안 알림 중지
        </Button>
        {snoozedUntil && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await snoozeNotificationsAction(null);
              })
            }
          >
            중지 해제
          </Button>
        )}
      </div>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-xs">선제 제안 종류</summary>
        <ul className="mt-2 divide-y">
          {(
            [
              ["time_conflict", "시간 충돌"],
              ["capacity_risk", "마감·가용 시간"],
              ["meeting_followup", "내 회의 후속 항목"],
              ["waiting_followup", "받을 답 확인"],
              ["changed_evidence", "변경된 기억 근거"],
              ["preference", "반복 교정에서 배운 선호"],
            ] as const
          ).map(([kind, label]) => (
            <li key={kind} className="flex items-center justify-between py-2">
              <span>{label}</span>
              <Switch
                checked={!disabledSuggestionKinds.includes(kind)}
                disabled={pending}
                aria-label={label}
                onCheckedChange={(enabled) =>
                  start(async () => {
                    try {
                      await setSuggestionKindAction(kind, enabled);
                    } catch {
                      toast.error("제안 설정을 변경하지 못했어요");
                    }
                  })
                }
              />
            </li>
          ))}
        </ul>
      </details>
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
