"use client";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel } from "@/core/ui/Panel";
import { generateWeeklyReviewAction } from "../actions";

interface Review {
  id: string;
  periodStart: string;
  periodEnd: string;
  contentMd: string;
  createdAt: string;
}

export function ReviewList({ reviews }: { reviews: Review[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(reviews[0]?.id ?? null);
  return (
    <Panel
      title="주간 리뷰"
      count={reviews.length || undefined}
      action={
        <Button
          size="xs"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await generateWeeklyReviewAction();
              toast.success("이번 주 리뷰를 만들었어요");
              router.refresh();
            })
          }
        >
          <RefreshCw className={pending ? "animate-spin" : ""} /> 지금 만들기
        </Button>
      }
    >
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          일요일 저녁마다 한 주를 정리한 리뷰가 여기에 쌓여요. 지금 만들어 볼
          수도 있어요.
        </p>
      ) : (
        <ul className="divide-y">
          {reviews.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between py-2 text-left text-sm"
                onClick={() => setOpen(open === r.id ? null : r.id)}
                aria-expanded={open === r.id}
              >
                <span className="tabular-nums">
                  {r.periodStart} ~ {r.periodEnd}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </button>
              {open === r.id && (
                <div className="space-y-1 pb-3 text-sm leading-relaxed">
                  {r.contentMd.split("\n").map((line, i) => (
                    <p
                      key={`${r.id}-${i}`}
                      className={
                        line.startsWith("- ")
                          ? "pl-3 before:mr-1.5 before:content-['·']"
                          : line.startsWith("**")
                            ? "font-medium"
                            : ""
                      }
                    >
                      {line.replace(/^- /, "").replace(/\*\*(.+?)\*\*/g, "$1")}
                    </p>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
