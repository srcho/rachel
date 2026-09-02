export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">오프라인이에요</h1>
      <p className="text-sm text-muted-foreground">
        연결이 돌아오면 자동으로 이어져요. 캐시된 화면은 뒤로 가기로 볼 수
        있어요.
      </p>
    </main>
  );
}
