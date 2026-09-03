"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { RachelUIMessage } from "../agent";
import { CostChip } from "./CostChip";
import { ToolCard, type ToolPartLike } from "./ToolCard";

export function MessageList({
  messages,
  status,
  onApprove,
}: {
  messages: RachelUIMessage[];
  status: string;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  // 스트리밍 중 매 렌더마다 끝으로(의존성 없음)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  });

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">무엇을 도와드릴까요?</p>
        <p className="max-w-[28ch]">
          “오늘 마감인 것 보여줘”, “내일 3시 PRD 검토 카드 만들어줘”, “Doing에서
          지연된 건 다음주 월요일로 옮겨줘”
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            "flex flex-col",
            m.role === "user" ? "items-end" : "items-start",
          )}
        >
          <div
            className={cn(
              "max-w-[92%] text-sm",
              m.role === "user"
                ? "rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
                : "w-full",
            )}
          >
            {m.parts.map((part, i) => {
              if (part.type === "text")
                return part.text ? (
                  <p
                    key={`${m.id}-${i}`}
                    className="whitespace-pre-wrap leading-relaxed"
                  >
                    {part.text}
                  </p>
                ) : null;
              if (part.type.startsWith("tool-") || part.type === "dynamic-tool")
                return (
                  <ToolCard
                    key={(part as ToolPartLike).toolCallId ?? `${m.id}-${i}`}
                    part={part as unknown as ToolPartLike}
                    onApprove={onApprove}
                  />
                );
              if (part.type === "reasoning") return null;
              return null;
            })}
          </div>
          {m.role === "assistant" && m.metadata?.costUsd !== undefined && (
            <div className="mt-1">
              <CostChip
                costUsd={m.metadata.costUsd}
                inputTokens={m.metadata.inputTokens}
                outputTokens={m.metadata.outputTokens}
              />
            </div>
          )}
        </div>
      ))}
      {(status === "submitted" || status === "streaming") &&
        messages.at(-1)?.role === "user" && (
          <p className="text-xs text-muted-foreground">생각 중…</p>
        )}
      <div ref={endRef} />
    </div>
  );
}
