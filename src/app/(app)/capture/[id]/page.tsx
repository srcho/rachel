import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { userContext } from "@/core/context";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { captureService } from "@/modules/capture/service";
import { CaptureDetail } from "@/modules/capture/ui/CaptureDetail";

export const dynamic = "force-dynamic";

export default async function CaptureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ctx = await userContext();
  const capture = await captureService(ctx).get(id);
  if (!capture) notFound();
  return (
    <>
      <PageHeader
        title="수집함 메모"
        actions={
          <Link href="/capture" className="text-sm underline">
            수집함 목록
          </Link>
        }
      />
      <Page width="narrow">
        <CaptureDetail capture={capture} userId={ctx.userId} />
      </Page>
    </>
  );
}
