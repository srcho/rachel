import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { DashboardWidget } from "@/core/contracts";
import { FINAL_LABEL, fmtDuration, STATUS_LABEL } from "./format";
import type { MeetingRow } from "./repository";
import { meetingsService } from "./service";
import { StartMeetingButton } from "./ui/StartMeetingButton";

interface Data {
  recent: MeetingRow[];
  imminent: { id: string; title: string; startAt: string } | null;
}

/** 임박한 일정(±10분)이면 "녹음 시작" 을 앞세우고, 아니면 최근 회의. */
export const meetingsWidget: DashboardWidget<Data> = {
  id: "meetings.recent",
  title: "회의",
  surface: "today",
  size: "md",
  rows: 2,
  href: "/meetings",
  order: 30,
  load: async (ctx) => {
    const svc = meetingsService(ctx);
    const recent = await svc.listRecent(5);
    const from = new Date(ctx.now.getTime() - 10 * 60_000).toISOString();
    const to = new Date(ctx.now.getTime() + 10 * 60_000).toISOString();
    const { data } = await ctx.db
      .from("calendar_events")
      .select("id, title, start_at")
      .eq("user_id", ctx.userId)
      .is("deleted_at", null)
      .eq("all_day", false)
      .gte("start_at", from)
      .lte("start_at", to)
      .order("start_at")
      .limit(1)
      .maybeSingle();
    return {
      recent,
      imminent: data
        ? { id: data.id, title: data.title, startAt: data.start_at }
        : null,
    };
  },
  Component: ({ data }) => (
    <div className="flex h-full flex-col">
      {data.imminent && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <span className="truncate">지금 “{data.imminent.title}”</span>
          <StartMeetingButton
            title={data.imminent.title}
            calendarEventId={data.imminent.id}
          />
        </div>
      )}
      {data.recent.length === 0 ? (
        <div className="flex flex-1 items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>최근 회의가 없어요.</span>
          {!data.imminent && <StartMeetingButton />}
        </div>
      ) : (
        <ul className="divide-y">
          {data.recent.map((m) => (
            <li key={m.id}>
              <Link
                href={`/meetings/${m.id}`}
                className="flex items-center gap-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{m.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {fmtDuration(m.duration_sec)}
                </span>
                <Badge variant="secondary" className="shrink-0">
                  {m.status === "ready"
                    ? FINAL_LABEL[m.final_pass_status] || "완료"
                    : STATUS_LABEL[m.status]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  ),
};
