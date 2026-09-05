/** Google Calendar REST 클라이언트(fetch 기반, googleapis 없이). */
import { requireEnv } from "@/core/env";

export const GTASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  GTASKS_SCOPE,
  "openid",
  "email",
];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public reason?: string,
  ) {
    super(message);
  }
}

export function buildAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

async function tokenRequest(
  params: Record<string, string>,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      ...params,
    }),
  });
  const json = (await res.json()) as TokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok)
    throw new GoogleApiError(
      res.status,
      json.error_description ?? json.error ?? "token error",
      json.error,
    );
  return json;
}

export const exchangeCode = (code: string) =>
  tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
  });
export const refreshAccessToken = (refreshToken: string) =>
  tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

/** id_token(JWT) payload 에서 이메일만 읽는다(서명 검증은 토큰 엔드포인트 응답이므로 생략). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(
      Buffer.from(
        part.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    ) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

async function api<T>(
  accessToken: string,
  path: string,
  init: RequestInit & {
    query?: Record<string, string | undefined>;
    base?: string;
  } = {},
): Promise<T> {
  const url = new URL(`${init.base ?? API}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {}))
    if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  };
  if (!res.ok)
    throw new GoogleApiError(
      res.status,
      json.error?.message ?? `Google API ${res.status}`,
      json.error?.errors?.[0]?.reason,
    );
  return json;
}

export interface GCalendar {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: "owner" | "writer" | "reader" | "freeBusyReader";
  selected?: boolean;
}
export interface GEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
export interface GEvent {
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
  transparency?: "opaque" | "transparent";
  id: string;
  etag?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start?: GEventTime;
  end?: GEventTime;
  recurringEventId?: string;
  attendees?: Array<{
    email?: string;
    displayName?: string;
    responseStatus?: string;
    self?: boolean;
  }>;
  htmlLink?: string;
  updated?: string;
}
export interface GEventList {
  items?: GEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export const google = {
  listCalendars: (token: string) =>
    api<{ items?: GCalendar[] }>(token, "/users/me/calendarList", {
      query: { minAccessRole: "reader" },
    }),
  listEvents: (
    token: string,
    calendarId: string,
    query: Record<string, string | undefined>,
  ) =>
    api<GEventList>(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { query },
    ),
  getEvent: (token: string, calendarId: string, eventId: string) =>
    api<GEvent>(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    ),
  insertEvent: (token: string, calendarId: string, body: Partial<GEvent>) =>
    api<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchEvent: (
    token: string,
    calendarId: string,
    eventId: string,
    body: Partial<GEvent>,
    etag?: string,
  ) =>
    api<GEvent>(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: etag ? { "If-Match": etag } : {},
      },
    ),
  deleteEvent: (token: string, calendarId: string, eventId: string) =>
    api<void>(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    ),
};

// ── Google Tasks (카드 미러) ──
export interface GTaskList {
  id: string;
  title: string;
}
export interface GTask {
  id: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  /** RFC3339, 날짜만 의미 있음 (시각은 무시됨). PATCH 에서 null 이면 지운다 */
  due?: string | null;
  completed?: string | null;
  deleted?: boolean;
  hidden?: boolean;
  updated?: string;
  etag?: string;
}
const t = (token: string, path: string, init: Parameters<typeof api>[2] = {}) =>
  api(token, path, { ...init, base: TASKS_API });
export const gtasks = {
  listLists: (token: string) =>
    t(token, "/users/@me/lists", { query: { maxResults: "100" } }) as Promise<{
      items?: GTaskList[];
    }>,
  createList: (token: string, title: string) =>
    t(token, "/users/@me/lists", {
      method: "POST",
      body: JSON.stringify({ title }),
    }) as Promise<GTaskList>,
  list: (
    token: string,
    listId: string,
    query: Record<string, string | undefined>,
  ) =>
    t(token, `/lists/${encodeURIComponent(listId)}/tasks`, {
      query: {
        maxResults: "100",
        showCompleted: "true",
        showHidden: "true",
        ...query,
      },
    }) as Promise<{ items?: GTask[]; nextPageToken?: string }>,
  insert: (token: string, listId: string, body: Partial<GTask>) =>
    t(token, `/lists/${encodeURIComponent(listId)}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }) as Promise<GTask>,
  patch: (token: string, listId: string, id: string, body: Partial<GTask>) =>
    t(
      token,
      `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ) as Promise<GTask>,
  delete: (token: string, listId: string, id: string) =>
    t(
      token,
      `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ) as Promise<void>,
};
