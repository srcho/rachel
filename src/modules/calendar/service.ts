import type { ServiceContext } from "@/core/contracts";
import {
  emailFromIdToken,
  exchangeCode,
  type GCalendar,
  google,
} from "./google";
import { type CalendarRow, calendarRepository } from "./repository";
import { forgetAccessToken, getAccessToken } from "./tokens";

export const CALENDAR_EVENTS = {
  connected: "calendar.connected",
  disconnected: "calendar.disconnected",
  synced: "calendar.synced",
} as const;

export function calendarService(ctx: ServiceContext) {
  const repo = calendarRepository(ctx.db, ctx.userId);

  /** OAuth 콜백: 코드 교환 → refresh token 을 Vault 에 → 캘린더 목록 저장(기본 캘린더 선택). */
  async function connectWithCode(
    code: string,
  ): Promise<{ email: string | null; calendars: CalendarRow[] }> {
    const tokens = await exchangeCode(code);
    const email = emailFromIdToken(tokens.id_token);
    const integration = await repo.upsertIntegration({
      account_email: email,
      scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
      status: "connected",
      last_error: null,
    });
    if (tokens.refresh_token)
      await repo.setSecret(integration.id, tokens.refresh_token);
    else if (!(await repo.getSecret(integration.id)))
      throw new Error(
        "Google 이 refresh token 을 주지 않았어요. 계정 권한 페이지에서 앱 접근을 제거하고 다시 연결해 주세요.",
      );
    forgetAccessToken(integration.id);
    const calendars = await refreshCalendarList(
      integration.id,
      tokens.access_token,
    );
    await ctx.emit({
      type: CALENDAR_EVENTS.connected,
      entity: { type: "integration", id: integration.id },
      payload: { email },
    });
    return { email, calendars };
  }

  async function refreshCalendarList(
    integrationId: string,
    accessToken?: string,
  ): Promise<CalendarRow[]> {
    const token = accessToken ?? (await getAccessToken(ctx, integrationId));
    const { items = [] } = await google.listCalendars(token);
    const existing = await repo.listCalendars();
    const rows = items.map((c: GCalendar) => {
      const prev = existing.find((e) => e.external_id === c.id);
      return {
        integration_id: integrationId,
        external_id: c.id,
        name: c.summary,
        color: c.backgroundColor ?? null,
        is_primary: Boolean(c.primary),
        writable: c.accessRole === "owner" || c.accessRole === "writer",
        selected: prev ? prev.selected : Boolean(c.primary),
      };
    });
    return repo.upsertCalendars(rows);
  }

  async function setSelected(
    calendarId: string,
    selected: boolean,
  ): Promise<void> {
    await repo.updateCalendar(calendarId, {
      selected,
      ...(selected ? {} : { sync_token: null }),
    });
  }

  async function disconnect(): Promise<void> {
    const integration = await repo.getIntegration();
    if (!integration) return;
    await repo.deleteSecret(integration.id);
    await repo.deleteIntegration(integration.id); // calendars·events cascade
    forgetAccessToken(integration.id);
    await ctx.emit({
      type: CALENDAR_EVENTS.disconnected,
      entity: { type: "integration", id: integration.id },
      payload: {},
    });
  }

  async function status() {
    const integration = await repo.getIntegration();
    const calendars = integration ? await repo.listCalendars() : [];
    return { integration, calendars };
  }

  return {
    connectWithCode,
    refreshCalendarList,
    setSelected,
    disconnect,
    status,
    repo,
  };
}
