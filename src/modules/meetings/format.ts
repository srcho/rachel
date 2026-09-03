export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}
export function fmtDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}
export const STATUS_LABEL: Record<string, string> = {
  recording: "녹음 중",
  processing: "정리 중",
  ready: "완료",
  failed: "실패",
};
export const FINAL_LABEL: Record<string, string> = {
  pending: "화자 분리 대기",
  running: "화자 분리 중",
  done: "화자 분리 완료",
  skipped: "",
  failed: "화자 분리 실패",
};
