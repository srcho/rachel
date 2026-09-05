import Link from "next/link";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { registry } from "@/modules";
import { captureListSchema } from "@/modules/capture/schema";
import { captureService } from "@/modules/capture/service";
import { Inbox } from "@/modules/capture/ui/Inbox";
import { ShareReceiver } from "@/modules/capture/ui/ShareReceiver";

export const dynamic = "force-dynamic";

/** 수집함. PWA share_target 이 GET 으로 title/text/url 을 넘기면 캡처를 만든다. */
export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{
    title?: string;
    text?: string;
    url?: string;
    status?: string;
    q?: string;
    offset?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await createServerSupabase();
  const parsed = captureListSchema.safeParse({
    status: sp.status ?? "open",
    q: sp.q,
    offset: Number(sp.offset ?? 0),
    limit: 50,
  });
  const filter = parsed.success ? parsed.data : captureListSchema.parse({});
  const page = await captureService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  ).listPage(filter);
  const items = page.items;
  const href = (offset: number) =>
    `/capture?${new URLSearchParams({ status: filter.status, q: filter.q ?? "", offset: String(offset) })}`;
  const shared =
    sp.text || sp.title || sp.url
      ? { text: [sp.title, sp.text].filter(Boolean).join("\n"), url: sp.url }
      : null;
  return (
    <>
      <PageHeader title="수집함" meta={`${page.total}개`} />
      <Page width="narrow">
        {shared && <ShareReceiver text={shared.text} url={shared.url} />}
        <form action="/capture" className="mb-4 flex flex-wrap gap-2">
          <select
            name="status"
            aria-label="메모 상태"
            defaultValue={filter.status}
            className="rounded-md border bg-background px-2 text-sm"
          >
            <option value="open">미처리</option>
            <option value="resolved">처리 완료</option>
            <option value="dismissed">무시함</option>
            <option value="all">전체</option>
          </select>
          <input
            name="q"
            type="search"
            aria-label="메모 검색"
            placeholder="메모 원문 검색"
            defaultValue={filter.q}
            className="min-h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <button type="submit" className="rounded-md border px-3 text-sm">
            조회
          </button>
        </form>
        <Inbox items={items} userId={user.id} />
        <nav
          aria-label="메모 페이지"
          className="mt-4 flex justify-between text-sm"
        >
          {filter.offset > 0 && (
            <Link href={href(Math.max(0, filter.offset - filter.limit))}>
              이전
            </Link>
          )}
          {page.nextOffset !== null && (
            <Link href={href(page.nextOffset)}>다음</Link>
          )}
        </nav>
      </Page>
    </>
  );
}
