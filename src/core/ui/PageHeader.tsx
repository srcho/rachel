export function PageHeader({
  title,
  meta,
  actions,
  children,
}: {
  title: string;
  /** 제목 옆 보조 정보(날짜·개수) */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center gap-3 px-4">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {meta && (
          <span className="truncate text-xs text-muted-foreground">{meta}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions}
        </div>
      </div>
      {children}
    </header>
  );
}
