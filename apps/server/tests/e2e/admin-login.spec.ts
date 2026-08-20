import { expect, test } from "@playwright/test";

test("administrator signs in with the keyboard and sees aggregate cards", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("管理员账号").fill("admin");
  await page.getByLabel("密码").fill("test-password");
  await page.getByLabel("密码").press("Enter");

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "数据概览" })).toBeVisible();
  await expect(page.getByText("近 7 日活跃用户")).toBeVisible();
  await expect(page.getByRole("link", { name: "用户管理" })).toHaveCount(0);
});

test("failed login keeps the form and shows a safe error", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("管理员账号").fill("admin");
  await page.getByLabel("密码").fill("wrong-password");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "用户名或密码不正确" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("protected pages redirect an expired or missing session", async ({ page }) => {
  await page.goto("/admin/categories");
  await expect(page).toHaveURL(/\/admin\/login(?:\?expired=1)?$/);
});
