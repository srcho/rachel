"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { captureAction } from "../actions";

/** 공유 시트로 들어온 내용을 한 번만 캡처하고 URL 을 정리한다 */
export function ShareReceiver({ text, url }: { text: string; url?: string }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void captureAction(text || url || "", "share", url).then(() => {
      toast.success("공유한 내용을 인박스에 넣었어요");
      router.replace("/capture");
    });
  }, [text, url, router]);
  return null;
}
