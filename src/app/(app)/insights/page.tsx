import { requireUser } from "@/core/auth/session";
import { PageHeader } from "@/core/ui/PageHeader";

export default async function InsightsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="인사이트" />
      <p className="p-4 text-sm text-muted-foreground">
        지표·대시보드·주간 리뷰는 P5 에서 채워져요. 지금은 설정의 AI 사용량
        패널을 참고해 주세요.
      </p>
    </>
  );
}
