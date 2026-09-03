"use client";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">주간 리뷰</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await generateWeeklyReviewAction();
              toast.success("이번 주 리뷰를 만들었어요");
              router.refresh();
            })
          }
        >
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />{" "}
          지금 만들기
        </Button>
      </div>
      {reviews.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          일요일 저녁마다 한 주를 정리한 리뷰가 여기에 쌓여요. 지금 만들어 볼
          수도 있어요.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {reviews.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                onClick={() => setOpen(open === r.id ? null : r.id)}
              >
                <span>
                  {r.periodStart} ~ {r.periodEnd}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </button>
              {open === r.id && (
                <div className="space-y-1 px-3 pb-3 text-sm leading-relaxed">
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
    </section>
  );
}
