import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { registry } from "@/modules";
import { captureService } from "@/modules/capture/service";
import { Inbox } from "@/modules/capture/ui/Inbox";
import { ShareReceiver } from "@/modules/capture/ui/ShareReceiver";

export const dynamic = "force-dynamic";

/** 수집함. PWA share_target 이 GET 으로 title/text/url 을 넘기면 캡처를 만든다. */
export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await createServerSupabase();
  const items = await captureService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  ).list("open", 100);
  const shared =
    sp.text || sp.title || sp.url
      ? { text: [sp.title, sp.text].filter(Boolean).join("\n"), url: sp.url }
      : null;
  return (
    <>
      <PageHeader
        title="수집함"
        meta={items.length ? `${items.length}개` : undefined}
      />
      <Page width="narrow">
        {shared && <ShareReceiver text={shared.text} url={shared.url} />}
        <Inbox items={items} userId={user.id} />
      </Page>
    </>
  );
}
