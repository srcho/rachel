export function PageHeader({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-3 px-4">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {children}
    </header>
  );
}
