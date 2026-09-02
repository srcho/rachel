export function HelloWidget({
  data,
}: {
  data: { userId: string; at: string };
}) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <p className="font-medium">모듈 레지스트리 동작 중</p>
      <p className="text-muted-foreground">
        user {data.userId.slice(0, 8)}… ·{" "}
        {new Date(data.at).toLocaleTimeString("ko-KR")}
      </p>
    </div>
  );
}
