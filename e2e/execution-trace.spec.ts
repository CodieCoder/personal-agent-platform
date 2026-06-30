import { expect, test } from "@playwright/test";

test("user runs echo and sees the persisted trace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Echo runtime" })).toBeVisible();
  await expect(page.locator('[data-runtime-ready="true"]')).toBeVisible();

  await page.getByLabel("Message").fill("Hello Personal Agent");
  await page.getByRole("button", { name: "Run echo" }).click();

  const resultStatus = page.getByRole("status").filter({ hasText: "Completed" });
  await expect(resultStatus.getByText("Hello Personal Agent")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open execution detail" })).toBeVisible();

  await page.getByRole("link", { name: "Open execution detail" }).click();

  await expect(page.getByRole("heading", { name: "Execution detail" })).toBeVisible();
  await expect(page.getByText("completed").first()).toBeVisible();
  await expect(page.getByText("validate input")).toBeVisible();
  await expect(page.getByText("echo.normalize")).toBeVisible();
  await expect(page.getByText("finalize execution")).toBeVisible();
});
