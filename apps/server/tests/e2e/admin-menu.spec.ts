import { expect, test } from "@playwright/test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0YAAAAASUVORK5CYII=",
  "base64",
);

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("管理员账号").fill("admin");
  await page.getByLabel("密码").fill("test-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("administrator manages a category and a published dish", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const categoryName = `测试分类${suffix}`;
  const renamedCategory = `${categoryName}改`;
  const dishName = `测试菜品${suffix}`;

  await login(page);
  await page.goto("/admin/categories");
  await page.getByRole("button", { name: /新增分类/ }).click();
  await page.getByLabel("分类名称").fill(categoryName);
  await page.getByLabel("排序值").fill("88");
  await page.getByRole("button", { name: "加入菜单簿" }).click();
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

  const categoryRow = page.locator("article").filter({ hasText: categoryName });
  await categoryRow.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("分类名称").fill(renamedCategory);
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText(renamedCategory, { exact: true })).toBeVisible();

  await page.goto("/admin/dishes");
  await page.getByRole("button", { name: /新增菜品/ }).click();
  await page.getByLabel("菜品图片").setInputFiles({
    buffer: onePixelPng,
    mimeType: "image/png",
    name: "dish.png",
  });
  await page.getByLabel("所属分类").selectOption({ label: renamedCategory });
  await page.getByLabel("菜品名称").fill(dishName);
  await page.getByLabel("菜品简介").fill("浏览器验收创建的菜品");
  await page.getByLabel("参考价格（元）").fill("12.99");
  await page.getByLabel("保存后立即在小程序上架").check();
  await page.getByRole("button", { name: "收入菜品图鉴" }).click();

  const dishCard = page.locator("article").filter({ hasText: dishName });
  await expect(dishCard).toContainText("¥ 12.99");
  await expect(dishCard).toContainText("上架");

  await dishCard.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("参考价格（元）").fill("15.20");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.locator("article").filter({ hasText: dishName })).toContainText(
    "¥ 15.20",
  );

  await page
    .locator("article")
    .filter({ hasText: dishName })
    .getByRole("button", { name: "删除" })
    .click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText(dishName, { exact: true })).toHaveCount(0);

  await page.goto("/admin/categories");
  await page
    .locator("article")
    .filter({ hasText: renamedCategory })
    .getByRole("button", { name: "删除" })
    .click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText(renamedCategory, { exact: true })).toHaveCount(0);
});

test("dish form reports an invalid two-decimal price before upload", async ({ page }) => {
  await login(page);
  await page.goto("/admin/dishes");
  const add = page.getByRole("button", { name: /新增菜品/ });
  if (await add.isDisabled()) {
    await page.goto("/admin/categories");
    await page.getByRole("button", { name: /新增分类/ }).click();
    await page
      .getByLabel("分类名称")
      .fill(`价格校验分类${Date.now().toString().slice(-6)}`);
    await page.getByRole("button", { name: "加入菜单簿" }).click();
    await page.goto("/admin/dishes");
  }
  await add.click();
  await page.getByLabel("菜品名称").fill("价格校验菜品");
  await page.getByLabel("参考价格（元）").fill("1.999");
  await page.getByRole("button", { name: "收入菜品图鉴" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "最多两位小数" }),
  ).toBeVisible();

  await page.getByLabel("参考价格（元）").fill("1.99");
  await page.getByLabel("菜品图片").setInputFiles({
    buffer: Buffer.from("not a real image"),
    mimeType: "image/png",
    name: "fake.png",
  });
  await page.getByRole("button", { name: "收入菜品图鉴" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "图片实际格式" }),
  ).toBeVisible();
});
