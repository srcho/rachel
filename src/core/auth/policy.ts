/** The same allowlist applies to OAuth callbacks, existing sessions and API requests. */
export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = process.env.ALLOWED_GOOGLE_EMAIL?.trim();
  return !allowed || (email ?? "").toLowerCase() === allowed.toLowerCase();
}

/** Resolve a relative return path without allowing URL parser host normalization. */
export function safeLocalRedirect(
  value: string | null | undefined,
  origin: string,
  fallback = "/today",
): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: reject URL parser control-character normalization.
    /[\\\u0000-\u001f\u007f]/u.test(value)
  )
    return fallback;
  try {
    const target = new URL(value, origin);
    return target.origin === new URL(origin).origin
      ? `${target.pathname}${target.search}${target.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
