import Link from "next/link";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { registry } from "@/modules";
import { captureListSchema } from "@/modules/capture/schema";
import { captureService } from "@/modules/capture/service";
import { CaptureComposer } from "@/modules/capture/ui/CaptureComposer";
import { Inbox } from "@/modules/capture/ui/Inbox";

export const dynamic = "force-dynamic";

/** 공유된 내용은 미리 보여 주고 사용자가 저장할 때만 캡처를 만든다. */
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
        <section
          className="mb-5 rounded-xl border bg-card p-4"
          aria-label="빠른 메모"
        >
          <CaptureComposer
            key={shared ? `${shared.text}:${shared.url}` : "compose"}
            userId={user.id}
            initialText={
              shared
                ? [
                    shared.text,
                    shared.url && !shared.text.includes(shared.url)
                      ? shared.url
                      : "",
                  ]
                    .filter(Boolean)
                    .join("\n")
                : ""
            }
            shared={!!shared}
          />
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              다른 앱의 링크는 어떻게 저장하나요?
            </summary>
            <p className="mt-2 leading-relaxed">
              링크 복사 → 레이첼의 메모 버튼 → 붙여넣기 → 수집함에 저장.
              Android에서는 설치 후 다른 앱의 공유 메뉴에서 Rachel을 선택할 수도
              있어요. iPhone에서는 링크를 복사해 붙여넣어 주세요.
            </p>
          </details>
        </section>
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
