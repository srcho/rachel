import { expect, test } from "@playwright/test";
import { loginAsTestUser } from "./helpers";

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
});

test("today → tasks: create a card and see it on the board", async ({
  page,
}) => {
  const user = await loginAsTestUser(page);
  try {
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: "Personal" })).toBeVisible();
    // Todo 컬럼의 "카드 추가"
    const todo = page.getByRole("region", { name: "Todo" });
    await todo.getByRole("button", { name: "카드 추가" }).click();
    await todo.getByLabel("새 카드 제목").fill("내일 3시 E2E 카드");
    await todo.getByLabel("새 카드 제목").press("Enter");
    const card = todo
      .getByRole("button", { name: "E2E 카드 열기", exact: true })
      .last();
    await expect(card).toBeVisible();
    await expect(card.getByText("내일")).toBeVisible();
    // 낙관적 UI 뒤의 서버 액션이 끝나기 전에 새로고침하면 저장이 끊기므로 네트워크가 잠잠해질 때까지 기다린다
    await page.waitForLoadState("networkidle");
    // 새로고침 후에도 남아 있다(서버 저장)
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "Todo" })
        .getByRole("button", { name: "E2E 카드 열기", exact: true })
        .last(),
    ).toBeVisible();
    // Today 위젯에 표시(내일 마감이라 오늘 목록엔 없음) → 설정 화면 진입
    await page.goto("/settings");
    await expect(page.getByText(user.email)).toBeVisible();
  } finally {
    await user.cleanup();
  }
});

test("capture inbox accepts text", async ({ page }) => {
  const user = await loginAsTestUser(page);
  try {
    await page.goto("/today");
    await page.getByLabel("빠른 캡처").fill("금요일까지 E2E 정산");
    await page.getByRole("button", { name: "캡처", exact: true }).click();
    await expect(
      page.getByRole("link", { name: /인박스/ }).getByText("1"),
    ).toBeVisible();
    await page.goto("/capture");
    await expect(page.getByText("E2E 정산")).toBeVisible();
  } finally {
    await user.cleanup();
  }
});
