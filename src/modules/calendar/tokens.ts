import type { ServiceContext } from "@/core/contracts";
import { GoogleApiError, refreshAccessToken } from "./google";
import { calendarRepository } from "./repository";

/** 액세스 토큰 메모리 캐시(인스턴스당). 만료 5분 전 갱신. */
const cache = new Map<string, { token: string; expiresAt: number }>();

export class NeedsReauthError extends Error {
  constructor() {
    super("Google 연결이 만료됐어요. 설정에서 다시 연결해 주세요.");
  }
}

export async function getAccessToken(
  ctx: ServiceContext,
  integrationId: string,
): Promise<string> {
  const hit = cache.get(integrationId);
  if (hit && hit.expiresAt - Date.now() > 5 * 60_000) return hit.token;
  const repo = calendarRepository(ctx.db, ctx.userId);
  const refresh = await repo.getSecret(integrationId);
  if (!refresh) throw new NeedsReauthError();
  try {
    const t = await refreshAccessToken(refresh);
    cache.set(integrationId, {
      token: t.access_token,
      expiresAt: Date.now() + t.expires_in * 1000,
    });
    return t.access_token;
  } catch (e) {
    if (
      e instanceof GoogleApiError &&
      (e.reason === "invalid_grant" || e.status === 400 || e.status === 401)
    ) {
      await repo.updateIntegration(integrationId, {
        status: "needs_reauth",
        last_error: e.message,
      });
      throw new NeedsReauthError();
    }
    throw e;
  }
}

export function forgetAccessToken(integrationId: string): void {
  cache.delete(integrationId);
}
