import { z } from "zod";

/** 서버 전용 환경변수. 빌드 시점이 아니라 접근 시점에 검증한다(키 없이도 빌드 가능). */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  META_MODEL_API_KEY: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_GOOGLE_EMAIL: z.string().email().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  LLM_MONTHLY_BUDGET_USD: z.coerce.number().positive().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `환경변수 형식 오류: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

/** 필수 키가 없으면 명확한 메시지로 실패시킨다. */
export function requireEnv<K extends keyof ServerEnv>(
  key: K,
): NonNullable<ServerEnv[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `환경변수 ${key}가 비어 있어요. .env.local을 확인해 주세요.`,
    );
  }
  return value as NonNullable<ServerEnv[K]>;
}
