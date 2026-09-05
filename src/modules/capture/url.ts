/** Keep pasted links usable without accepting executable URL schemes. */
export function captureUrl(text: string): string | undefined {
  const candidate = text.match(/https?:\/\/[^\s<>]+/i)?.[0];
  if (!candidate) return undefined;
  try {
    return new URL(candidate.replace(/[.,!?;\u3002]+$/, "")).href;
  } catch {
    return undefined;
  }
}
