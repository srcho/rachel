import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { disconnectGoogleAction, refreshCalendarsAction } from "../actions";
import { calendarService } from "../service";
import { CalendarToggle } from "./CalendarToggle";

/** 설정 > Google 캘린더 섹션(서버 컴포넌트) */
export async function CalendarSettings() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const { integration, calendars } = await calendarService(
    createContext({
      db,
      userId: user.id,
      actor: "user",
      registry: await getRegistry(),
    }),
  ).status();

  if (!integration) {
    return (
      <div className="flex items-center justify-between text-sm">
        <div>
          <p>Google 캘린더가 연결되지 않았어요.</p>
          <p className="text-xs text-muted-foreground">
            일정을 보고, 만들고, 레이첼이 다룰 수 있게 돼요.
          </p>
        </div>
        <Button asChild size="sm">
          <Link
            href="/api/integrations/google/start?next=/settings"
            prefetch={false}
          >
            연결
          </Link>
        </Button>
      </div>
    );
  }
  const needsReauth = integration.status !== "connected";
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate">
            {integration.account_email ?? "Google 계정"}
          </p>
          <p className="text-xs text-muted-foreground">
            {needsReauth
              ? "연결이 만료됐어요. 다시 연결해 주세요."
              : integration.last_synced_at
                ? `마지막 동기화 ${new Date(integration.last_synced_at).toLocaleString("ko-KR")}`
                : "아직 동기화 전"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {needsReauth && (
            <Button asChild size="sm">
              <Link
                href="/api/integrations/google/start?next=/settings"
                prefetch={false}
              >
                다시 연결
              </Link>
            </Button>
          )}
          <form action={refreshCalendarsAction}>
            <Button size="sm" variant="outline" type="submit">
              목록 새로고침
            </Button>
          </form>
          <form action={disconnectGoogleAction}>
            <Button
              size="sm"
              variant="ghost"
              type="submit"
              className="text-destructive"
            >
              연결 해제
            </Button>
          </form>
        </div>
      </div>
      <ul className="divide-y">
        {calendars.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: c.color ?? "var(--muted-foreground)" }}
            />
            <span className="min-w-0 flex-1 truncate">
              {c.name}
              {c.is_primary && (
                <span className="ml-1 text-xs text-muted-foreground">기본</span>
              )}
              {!c.writable && (
                <span className="ml-1 text-xs text-muted-foreground">
                  읽기 전용
                </span>
              )}
            </span>
            <CalendarToggle id={c.id} selected={c.selected} />
          </li>
        ))}
      </ul>
    </div>
  );
}
