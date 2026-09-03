import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { Panel } from "@/core/ui/Panel";
import { registry } from "@/modules";
import {
  FINAL_LABEL,
  fmtDuration,
  STATUS_LABEL,
} from "@/modules/meetings/format";
import { meetingsService } from "@/modules/meetings/service";
import { StartMeetingButton } from "@/modules/meetings/ui/StartMeetingButton";

export const dynamic = "force-dynamic";

/** 회의 목록. 목적: 녹음 시작 한 번, 지난 회의는 날짜순으로 빠르게 되찾기. */
export default async function MeetingsPage() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const svc = meetingsService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  );
  const meetings = await svc.list(50);
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (
    <>
      <PageHeader
        title="회의"
        meta={meetings.length ? `${meetings.length}개` : undefined}
        actions={<StartMeetingButton />}
      />
      <Page width="narrow">
        {meetings.length === 0 ? (
          <Panel>
            <p className="py-6 text-center text-sm text-muted-foreground">
              아직 회의가 없어요. 녹음을 시작하면 실시간 전사와 요약이
              만들어져요.
            </p>
          </Panel>
        ) : (
          <Panel bodyClassName="px-0 pb-0">
            <ul className="divide-y">
              {meetings.map((m) => (
                <li key={m.id}>
                  <Link
                    href={
                      m.status === "recording"
                        ? `/meetings/live/${m.id}`
                        : `/meetings/${m.id}`
                    }
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.title}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {fmt.format(new Date(m.started_at))}
                        {m.duration_sec
                          ? ` · ${fmtDuration(m.duration_sec)}`
                          : ""}
                        {m.final_pass_status === "running" &&
                          ` · ${FINAL_LABEL.running}`}
                      </p>
                    </div>
                    <Badge
                      variant={
                        m.status === "recording"
                          ? "destructive"
                          : m.status === "ready"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {STATUS_LABEL[m.status] ?? m.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </Page>
    </>
  );
}
