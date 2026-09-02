import { LoginButton } from "./login-button";

const ERRORS: Record<string, string> = {
  "not-allowed":
    "이 계정은 사용할 수 없어요. 허용된 Google 계정으로 로그인해 주세요.",
  exchange: "로그인 처리 중 문제가 생겼어요. 다시 시도해 주세요.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Rachel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          할 일·일정·회의를 기억하는 개인 비서
        </p>
      </div>
      <LoginButton next={next} />
      {error ? (
        <p className="max-w-xs text-center text-sm text-destructive">
          {ERRORS[error] ?? "로그인에 실패했어요."}
        </p>
      ) : null}
    </main>
  );
}
