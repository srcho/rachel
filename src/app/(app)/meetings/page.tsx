import Link from "next/link";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { PageHeader } from "@/core/ui/PageHeader";
import { cn } from "@/lib/utils";
import { registry } from "@/modules";
import {
  FINAL_LABEL,
  fmtDuration,
  STATUS_LABEL,
} from "@/modules/meetings/format";
import { meetingsService } from "@/modules/meetings/service";
import { StartMeetingButton } from "@/modules/meetings/ui/StartMeetingButton";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const svc = meetingsService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  );
  const meetings = await svc.list(50);
  return (
    <>
      <PageHeader title="회의" actions={<StartMeetingButton />} />
      <div className="mx-auto max-w-3xl p-4">
        {meetings.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <p>
              아직 회의가 없어요. 녹음을 시작하면 실시간 전사와 요약이
              만들어져요.
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
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
                    <p className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(m.started_at))}
                      {m.duration_sec
                        ? ` · ${fmtDuration(m.duration_sec)}`
                        : ""}
                      {m.final_pass_status === "running" &&
                        ` · ${FINAL_LABEL.running}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded px-1.5 py-px text-[11px]",
                      m.status === "recording"
                        ? "bg-red-500/15 text-red-600"
                        : m.status === "ready"
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-500/15 text-amber-700",
                    )}
                  >
                    {STATUS_LABEL[m.status] ?? m.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
