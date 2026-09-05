import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { Panel } from "@/core/ui/Panel";
import { fmtDateTime, localYmd } from "@/core/utils/date";
import { registry } from "@/modules";
import {
  FINAL_LABEL,
  fmtDuration,
  STATUS_LABEL,
} from "@/modules/meetings/format";
import { meetingSummarySchema } from "@/modules/meetings/schema";
import { meetingsService } from "@/modules/meetings/service";
import { MeetingNote } from "@/modules/meetings/ui/MeetingNote";
import { StartMeetingButton } from "@/modules/meetings/ui/StartMeetingButton";

export const dynamic = "force-dynamic";

/** 회의 목록. 목적: 녹음 시작 한 번, 지난 회의는 날짜순으로 빠르게 되찾기. */
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pending?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(sp.page ?? "1", 10) || 1),
  );
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
  const svc = meetingsService(ctx);
  const { meetings, total, size } = await svc.repo.listPage({
    query: sp.q?.slice(0, 200),
    page,
    pending: sp.pending === "1",
  });
  const href = (next: number) =>
    `/meetings?${new URLSearchParams({ q: sp.q ?? "", pending: sp.pending ?? "", page: String(next) })}`;
  const months = [
    ...new Set(
      meetings.map((m) =>
        localYmd(new Date(m.started_at), ctx.timezone).slice(0, 7),
      ),
    ),
  ];
  return (
    <>
      <PageHeader
        title="회의"
        meta={`${total}개`}
        splitActions
        actions={
          <>
            <MeetingNote />
            <StartMeetingButton />
          </>
        }
      />
      <Page width="narrow" className="space-y-3">
        <form className="flex flex-wrap items-center gap-2" action="/meetings">
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="회의 제목 검색"
            aria-label="회의 검색"
            className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <Button type="submit" variant="outline" className="min-h-11">
            검색
          </Button>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="pending"
              value="1"
              defaultChecked={sp.pending === "1"}
            />
            후속 작업 남음
          </label>
        </form>
        {meetings.length === 0 ? (
          <Panel>
            <p className="py-6 text-center text-sm text-muted-foreground">
              {sp.q || sp.pending
                ? "조건에 맞는 회의가 없어요. 검색어나 필터를 바꿔 주세요."
                : "아직 회의가 없어요. 녹음을 시작하면 전사와 요약이 만들어져요."}
            </p>
          </Panel>
        ) : (
          <Panel bodyClassName="px-0 pb-0">
            {months.map((month) => (
              <section key={month}>
                <h2 className="border-y bg-muted/30 px-3 py-2 text-xs font-medium">
                  {month.replace("-", "년 ")}월
                </h2>
                <ul className="divide-y">
                  {meetings
                    .filter((m) =>
                      localYmd(new Date(m.started_at), ctx.timezone).startsWith(
                        month,
                      ),
                    )
                    .map((m) => (
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
                            <p className="truncate text-sm font-medium">
                              {m.title}
                            </p>
                            {meetingSummarySchema.safeParse(m.summary)
                              .success && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {meetingSummarySchema.parse(m.summary).tldr}
                              </p>
                            )}
                            {m.pending_count > 0 && (
                              <p className="mt-1 text-xs">
                                후속 할 일 {m.pending_count}개 남음
                              </p>
                            )}
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {fmtDateTime(m.started_at, ctx.timezone)}
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
              </section>
            ))}
          </Panel>
        )}
        {(page > 1 || page * size < total) && (
          <nav
            aria-label="회의 목록 페이지"
            className="flex items-center justify-between text-sm"
          >
            {page > 1 ? (
              <Link href={href(page - 1)} className="py-3 underline">
                이전
              </Link>
            ) : (
              <span />
            )}
            <span>
              {page} / {Math.max(1, Math.ceil(total / size))}
            </span>
            {page * size < total ? (
              <Link href={href(page + 1)} className="py-3 underline">
                이전 기록 더 보기
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Page>
    </>
  );
}
