"use client";
export function SearchButton() {
  return (
    <button
      type="button"
      aria-label="전체 검색"
      className="ml-auto min-h-11 px-2 text-xs text-muted-foreground md:hidden"
      onClick={() => window.dispatchEvent(new Event("rachel:palette"))}
    >
      검색
    </button>
  );
}
