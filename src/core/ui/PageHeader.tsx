import { SearchButton } from "./SearchButton";
export function PageHeader({
  title,
  meta,
  actions,
  children,
  splitActions,
}: {
  title: string;
  splitActions?: boolean;
  /** 제목 옆 보조 정보(날짜·개수) */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div
        className={`flex min-h-12 items-center gap-x-3 px-4 ${splitActions ? "flex-wrap md:flex-nowrap" : ""}`}
      >
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {meta && (
          <span className="truncate text-xs text-muted-foreground">{meta}</span>
        )}
        <SearchButton />
        <div
          className={`ml-auto flex shrink-0 items-center gap-1.5 ${splitActions ? "w-full justify-between pb-1 md:w-auto md:justify-end md:pb-0" : ""}`}
        >
          {actions}
        </div>
      </div>
      {children}
    </header>
  );
}
