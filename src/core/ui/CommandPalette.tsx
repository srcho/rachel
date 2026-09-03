"use client";
import {
  CalendarDays,
  FileText,
  Mic,
  Search,
  Sparkles,
  SquareKanban,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Command as Cmd,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Command } from "@/core/contracts";

export interface PaletteHit {
  id: string;
  sourceType: string;
  title: string;
  snippet: string;
  href: string | null;
}

interface Props {
  commands: Command[];
  search: (q: string) => Promise<PaletteHit[]>;
  onAction: (action: NonNullable<Command["action"]>) => void;
}

const TYPE_LABEL: Record<string, { label: string; Icon: typeof Search }> = {
  card: { label: "할 일", Icon: SquareKanban },
  calendar_event: { label: "일정", Icon: CalendarDays },
  meeting: { label: "회의", Icon: Mic },
  memory: { label: "기억", Icon: FileText },
};

/** ⌘K: 명령 + 전역 검색(디바운스 250ms, 2자 이상) */
export function CommandPalette({ commands, search, onAction }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PaletteHit[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener("rachel:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("rachel:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        setHits(await search(term));
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [q, search]);

  function run(c: Command) {
    setOpen(false);
    if (c.href) router.push(c.href);
    else if (c.action) onAction(c.action);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="명령·검색"
      description="명령을 실행하거나 할 일·일정·회의·기억을 검색해요"
    >
      <Cmd shouldFilter={false}>
        <CommandInput
          placeholder="무엇이든 검색… (⌘K)"
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          <CommandEmpty>
            {loading
              ? "검색 중…"
              : q.trim().length >= 2
                ? "결과가 없어요"
                : "명령을 고르거나 검색어를 입력하세요"}
          </CommandEmpty>
          {hits.length > 0 && (
            <CommandGroup heading="검색 결과">
              {hits.map((h) => {
                const t = TYPE_LABEL[h.sourceType] ?? {
                  label: h.sourceType,
                  Icon: Search,
                };
                return (
                  <CommandItem
                    key={h.id}
                    value={h.id}
                    onSelect={() => {
                      setOpen(false);
                      if (h.href) router.push(h.href);
                    }}
                  >
                    <t.Icon className="size-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate">{h.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.label} · {h.snippet}
                      </p>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          <CommandGroup heading="명령">
            {commands
              .filter(
                (c) =>
                  !q.trim() ||
                  `${c.label} ${(c.keywords ?? []).join(" ")}`
                    .toLowerCase()
                    .includes(q.trim().toLowerCase()),
              )
              .map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => run(c)}>
                  <Sparkles className="size-4 text-muted-foreground" />
                  <span>{c.label}</span>
                  {c.shortcut && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.shortcut.replace("mod", "⌘")}
                    </span>
                  )}
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </Cmd>
    </CommandDialog>
  );
}
