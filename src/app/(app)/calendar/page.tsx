import Link from "next/link";
import { requireUser } from "@/core/auth/session";
import { PageHeader } from "@/core/ui/PageHeader";

export default async function CalendarPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="일정" />
      <div className="p-4 text-sm text-muted-foreground">
        캘린더 화면은 곧 채워져요. 먼저{" "}
        <Link href="/settings" className="underline">
          설정
        </Link>
        에서 Google 캘린더를 연결해 주세요.
      </div>
    </>
  );
}
