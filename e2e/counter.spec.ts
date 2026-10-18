import { expect, test, type Page } from "@playwright/test";

const dialog = (page: Page) => page.getByRole("dialog");
const table = (page: Page) => page.getByRole("table", { name: "Scores" });
const totals = (page: Page) => table(page).getByRole("row", { name: /^Total/ }).getByRole("cell");
const roundCells = (page: Page, round: number) =>
  table(page).getByRole("row", { name: new RegExp(`^Round ${round}\\b`) }).getByRole("cell");
const cell = (page: Page, name: string, round: number) =>
  page.getByRole("button", { name: `${name}, round ${round}`, exact: true });

async function addPlayer(page: Page, name: string) {
  await page.getByRole("button", { name: "Add player" }).first().click();
  await dialog(page).getByLabel("Name").fill(name);
  await dialog(page).getByRole("button", { name: "Save" }).click();
}

async function score(page: Page, name: string, round: number, value: string) {
  await cell(page, name, round).click();
  await dialog(page).getByLabel("Points").fill(value);
  await dialog(page).getByRole("button", { name: "Save" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("starts with an empty state that adds players", async ({ page }) => {
  await expect(page.getByText("Add the players to start")).toBeVisible();
  await addPlayer(page, "Alice");
  await addPlayer(page, "Bob");
  await expect(table(page).getByRole("columnheader")).toContainText(["Alice", "Bob"]);
  await expect(totals(page)).toHaveText(["0", "0"]);
});

test("ignores blank names", async ({ page }) => {
  await addPlayer(page, "   ");
  await expect(table(page)).toBeHidden();
});

test("enters a typed score in a dialog", async ({ page }) => {
  await addPlayer(page, "Alice");
  await cell(page, "Alice", 1).click();
  await expect(dialog(page)).toContainText("Alice · Round 1");
  await dialog(page).getByLabel("Points").fill("-7");
  await dialog(page).getByLabel("Points").press("Enter");
  await expect(dialog(page)).toBeHidden();
  await expect(roundCells(page, 1)).toHaveText(["-7"]);
  await expect(totals(page)).toHaveText(["-7"]);
});

test("adjusts the score with quick buttons", async ({ page }) => {
  await addPlayer(page, "Alice");
  await cell(page, "Alice", 1).click();
  await dialog(page).getByRole("button", { name: "+10", exact: true }).click();
  await dialog(page).getByRole("button", { name: "+5", exact: true }).click();
  await dialog(page).getByRole("button", { name: "−1", exact: true }).click();
  await expect(dialog(page).getByLabel("Points")).toHaveValue("14");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(totals(page)).toHaveText(["14"]);
});

test("cancel leaves the score alone", async ({ page }) => {
  await addPlayer(page, "Alice");
  await score(page, "Alice", 1, "3");
  await cell(page, "Alice", 1).click();
  await dialog(page).getByLabel("Points").fill("99");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(totals(page)).toHaveText(["3"]);
});

test("next player walks through the round", async ({ page }) => {
  await addPlayer(page, "Alice");
  await addPlayer(page, "Bob");
  await cell(page, "Alice", 1).click();
  await dialog(page).getByLabel("Points").fill("3");
  await dialog(page).getByRole("button", { name: "Next player" }).click();
  await expect(dialog(page)).toContainText("Bob · Round 1");
  await dialog(page).getByLabel("Points").fill("4");
  await dialog(page).getByRole("button", { name: "Next player" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(roundCells(page, 1)).toHaveText(["3", "4"]);
});

test("keeps a row per round and totals them", async ({ page }) => {
  await addPlayer(page, "Alice");
  await addPlayer(page, "Bob");
  await score(page, "Alice", 1, "2");
  await page.getByRole("button", { name: "Next round" }).click();
  await expect(roundCells(page, 2)).toHaveText(["–", "–"]);
  await score(page, "Bob", 2, "5");
  await score(page, "Alice", 1, "10"); // fix an earlier round
  await expect(roundCells(page, 1)).toHaveText(["10", "–"]);
  await expect(totals(page)).toHaveText(["10", "5"]);
});

test("highlights the leader", async ({ page }) => {
  await addPlayer(page, "Alice");
  await addPlayer(page, "Bob");
  await score(page, "Bob", 1, "1");
  await expect(totals(page).nth(1)).toHaveClass(/leader/);
  await expect(totals(page).nth(0)).not.toHaveClass(/leader/);
});

test("undo reverts scores and rounds", async ({ page }) => {
  await addPlayer(page, "Alice");
  await score(page, "Alice", 1, "4");
  await page.getByRole("button", { name: "Next round" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(roundCells(page, 2)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(totals(page)).toHaveText(["0"]);
});

test("new game keeps players and can be undone", async ({ page }) => {
  await addPlayer(page, "Alice");
  await score(page, "Alice", 1, "4");
  await page.getByRole("button", { name: "Next round" }).click();
  await page.getByRole("button", { name: "New game" }).click();
  await expect(roundCells(page, 2)).toHaveCount(0);
  await expect(totals(page)).toHaveText(["0"]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(totals(page)).toHaveText(["4"]);
});

test("renames and removes a player", async ({ page }) => {
  await addPlayer(page, "Alice");
  await addPlayer(page, "Bob");
  await page.getByRole("button", { name: "Edit Alice" }).click();
  await dialog(page).getByLabel("Name").fill("Alicia");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(table(page).getByRole("columnheader")).toContainText(["Alicia", "Bob"]);

  await page.getByRole("button", { name: "Edit Bob" }).click();
  await dialog(page).getByRole("button", { name: "Remove" }).click();
  await expect(table(page).getByRole("columnheader")).toContainText(["Alicia"]);
  await expect(totals(page)).toHaveCount(1);
});

test.describe("remembered players", () => {
  test("offers players from earlier games in one tap", async ({ page }) => {
    await addPlayer(page, "Alice");
    await addPlayer(page, "Bob");
    await page.getByRole("button", { name: "Edit Bob" }).click();
    await dialog(page).getByRole("button", { name: "Remove" }).click();
    await page.reload();

    await page.getByRole("button", { name: "Add player" }).first().click();
    await expect(dialog(page).getByRole("button", { name: "Add Alice" })).toHaveCount(0); // already playing
    await dialog(page).getByRole("button", { name: "Add Bob" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(table(page).getByRole("columnheader")).toContainText(["Alice", "Bob"]);
  });

  test("forgets a remembered player", async ({ page }) => {
    await addPlayer(page, "Carol");
    await page.getByRole("button", { name: "Edit Carol" }).click();
    await dialog(page).getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Add player" }).first().click();
    await dialog(page).getByRole("button", { name: "Forget Carol" }).click();
    await expect(dialog(page).getByRole("button", { name: "Add Carol" })).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Add player" }).first().click();
    await expect(dialog(page).getByRole("button", { name: "Add Carol" })).toHaveCount(0);
  });

  test("does not add the same name twice", async ({ page }) => {
    await addPlayer(page, "Alice");
    await addPlayer(page, "alice");
    await expect(totals(page)).toHaveCount(1);
  });
});

test("keeps the game across reloads", async ({ page }) => {
  await addPlayer(page, "Alice");
  await score(page, "Alice", 1, "6");
  await page.getByRole("button", { name: "Next round" }).click();
  await page.reload();
  await expect(roundCells(page, 1)).toHaveText(["6"]);
  await expect(roundCells(page, 2)).toHaveText(["–"]);
});

test("is installable and works offline", async ({ page, context }) => {
  const manifest = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifest).toBeTruthy();
  const res = await page.request.get(manifest!);
  expect((await res.json()).display).toBe("standalone");

  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Score Counter" })).toBeVisible();
});
