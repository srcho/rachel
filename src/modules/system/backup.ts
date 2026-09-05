import type { ServiceContext } from "@/core/contracts";
import { localYmd } from "@/core/utils/date";
import { buildExport, gzip } from "./export";

const KEEP = 8; // 최근 8주

/** 주간 백업: Storage backups/<user>/<date>.json.gz, 오래된 것 정리 */
export async function runBackup(
  ctx: ServiceContext,
): Promise<{ path: string; bytes: number; counts: Record<string, number> }> {
  const { json, counts } = await buildExport(ctx);
  const gz = gzip(json);
  const path = `${ctx.userId}/${localYmd(ctx.now, ctx.timezone)}.json.gz`;
  const { error } = await ctx.db.storage
    .from("backups")
    .upload(path, gz, { contentType: "application/gzip", upsert: true });
  if (error) throw new Error(`백업 업로드 실패: ${error.message}`);
  const { data: files } = await ctx.db.storage
    .from("backups")
    .list(ctx.userId, { sortBy: { column: "name", order: "desc" } });
  const old = (files ?? []).slice(KEEP).map((f) => `${ctx.userId}/${f.name}`);
  if (old.length) await ctx.db.storage.from("backups").remove(old);
  await ctx.emit({
    type: "system.backup_done",
    entity: { type: "backup", id: path },
    payload: { bytes: gz.byteLength, counts },
  });
  return { path, bytes: gz.byteLength, counts };
}

export async function listBackups(
  ctx: ServiceContext,
): Promise<Array<{ name: string; bytes: number; createdAt: string }>> {
  const { data, error } = await ctx.db.storage
    .from("backups")
    .list(ctx.userId, { sortBy: { column: "name", order: "desc" }, limit: 10 });
  if (error) throw new Error(`백업 조회 실패: ${error.message}`);
  return (data ?? []).map((f) => ({
    name: f.name,
    bytes: Number((f.metadata as { size?: number } | null)?.size ?? 0),
    createdAt: f.created_at ?? "",
  }));
}
