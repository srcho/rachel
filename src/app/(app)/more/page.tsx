import Link from "next/link";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
export default function MorePage() {
  return (
    <>
      <PageHeader title="더보기" />
      <Page width="content">
        <nav aria-label="추가 메뉴" className="divide-y rounded-lg border">
          {[
            ["/capture", "수집함", "빠른 메모를 할 일·일정·기억으로 정리"],
            ["/memory", "기억", "레이첼이 참고하는 사실과 선호 수정"],
            ["/insights", "리뷰", "하루와 한 주 돌아보기"],
            ["/settings", "설정", "연결·알림·개인 설정"],
          ].map(([href, title, description]) => (
            <Link
              key={href}
              href={href ?? "/more"}
              className="block px-4 py-3 hover:bg-muted/40"
            >
              <span className="block text-sm font-medium">{title}</span>
              <span className="text-xs text-muted-foreground">
                {description}
              </span>
            </Link>
          ))}
        </nav>
      </Page>
    </>
  );
}
