"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DEFAULT_TZ, fmtDateTime } from "@/core/utils/date";

export function MemoryActivity({
  latest,
  unavailable,
}: {
  latest: {
    status: string;
    updated_at: string;
    run_at: string;
    retrying: boolean;
  } | null;
  unavailable: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        router.refresh();
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [router]);
  const status = !latest
    ? "아직 자동 추출 요청이 없어요"
    : latest.status === "done"
      ? "최근 요청 처리 완료"
      : latest.status === "pending"
        ? latest.retrying
          ? "오류 후 재시도 대기"
          : "자동 추출 대기"
        : latest.status === "running"
          ? "기억 후보를 살펴보는 중"
          : latest.status === "failed"
            ? "최근 자동 추출 실패"
            : "최근 요청 종료";
  return (
    <section
      className="mb-4 space-y-3 rounded-xl border bg-card p-4 text-sm"
      aria-label="기억 저장 안내"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <output className="font-medium">
          {unavailable ? "추출 상태를 확인하지 못했어요" : status}
        </output>
        <button
          type="button"
          className="min-h-9 text-xs underline"
          onClick={() => router.refresh()}
        >
          상태 새로고침
        </button>
      </div>
      {latest && (
        <p className="text-xs text-muted-foreground">
          {latest.status === "pending" ? "실행 예정" : "상태 갱신"} ·{" "}
          {fmtDateTime(
            latest.status === "pending" ? latest.run_at : latest.updated_at,
            DEFAULT_TZ,
          )}
        </p>
      )}
      <details>
        <summary className="cursor-pointer font-medium">
          언제, 무엇을 기억하나요?
        </summary>
        <ul className="mt-3 list-disc space-y-2 pl-4 text-muted-foreground">
          <li>
            <strong className="text-foreground">직접 저장:</strong> 아래
            입력창에 적거나 대화에서 “이걸 기억해 줘”라고 요청하세요. 저장된
            기억은 여기서 확인하고 수정할 수 있어요.
          </li>
          <li>
            <strong className="text-foreground">대화 후:</strong> 레이첼의
            응답이 끝나면 약 10분 뒤 자동 추출을 예약해요. 대기 중인 같은 대화는
            한 번에 처리하고 최근 30개 메시지 중 사용자 발언을 살펴봐요.
          </li>
          <li>
            <strong className="text-foreground">회의 요약 후:</strong> 최신
            요약에서 계속 참고할 사실·결정·선호를 찾아요. 다시 요약하면 최신
            내용으로 검토해요.
          </li>
          <li>
            <strong className="text-foreground">수집함:</strong> 메모 저장만으로
            기억이 되지는 않아요. 분류 제안을 확인하고 기억으로 확정할 때
            저장해요.
          </li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          취향, 반복 습관, 중요한 사람·목표처럼 오래 쓸 내용이 대상이에요.
          일회성 할 일이나 짧은 잡담은 보통 남기지 않아요. 처리가 완료돼도 새
          기억이 없을 수 있어요.
        </p>
        <p className="mt-2 text-muted-foreground">
          자동 추출은 ‘직접 확인하지 않은 후보’로 표시해요. 충돌하는 기억은 확인
          전 답변에 사용하지 않아요. 중요한 선호는 직접 저장하고 고정해 주세요.
        </p>
      </details>
    </section>
  );
}
