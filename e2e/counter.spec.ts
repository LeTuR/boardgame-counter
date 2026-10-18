import { expect, test, type Page } from "@playwright/test";

async function addPlayer(page: Page, name: string) {
  await page.getByPlaceholder("Player name").fill(name);
  await page.getByRole("button", { name: "Add player" }).click();
}

const player = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ hasText: name });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("adds players starting at zero", async ({ page }) => {
  await addPlayer(page, "Alice");
  await addPlayer(page, "Bob");
  await expect(player(page, "Alice").getByTestId("score")).toHaveText("0");
  await expect(player(page, "Bob").getByTestId("score")).toHaveText("0");
});

test("ignores blank names", async ({ page }) => {
  await addPlayer(page, "   ");
  await expect(page.getByRole("listitem")).toHaveCount(0);
});

test("adds and subtracts by the selected step", async ({ page }) => {
  await addPlayer(page, "Alice");
  const alice = player(page, "Alice");
  await alice.getByRole("button", { name: "Add points to Alice" }).click();
  await expect(alice.getByTestId("score")).toHaveText("1");

  await page.getByRole("radio", { name: "10" }).check();
  await alice.getByRole("button", { name: "Add points to Alice" }).click();
  await alice.getByRole("button", { name: "Add points to Alice" }).click();
  await alice.getByRole("button", { name: "Remove points from Alice" }).click();
  await expect(alice.getByTestId("score")).toHaveText("11");
});

test("highlights the leader", async ({ page }) => {
  await addPlayer(page, "Alice");
  await addPlayer(page, "Bob");
  await player(page, "Bob").getByRole("button", { name: "Add points to Bob" }).click();
  await expect(player(page, "Bob")).toHaveClass(/leader/);
  await expect(player(page, "Alice")).not.toHaveClass(/leader/);
});

test("undoes the last change", async ({ page }) => {
  await addPlayer(page, "Alice");
  const alice = player(page, "Alice");
  await alice.getByRole("button", { name: "Add points to Alice" }).click();
  await alice.getByRole("button", { name: "Add points to Alice" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(alice.getByTestId("score")).toHaveText("1");
});

test("new game resets scores but keeps players", async ({ page }) => {
  await addPlayer(page, "Alice");
  await player(page, "Alice").getByRole("button", { name: "Add points to Alice" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "New game" }).click();
  await expect(player(page, "Alice").getByTestId("score")).toHaveText("0");
});

test("removes a player", async ({ page }) => {
  await addPlayer(page, "Alice");
  await addPlayer(page, "Bob");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove Alice" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(player(page, "Bob")).toBeVisible();
});

test("keeps the game across reloads", async ({ page }) => {
  await addPlayer(page, "Alice");
  await player(page, "Alice").getByRole("button", { name: "Add points to Alice" }).click();
  await page.reload();
  await expect(player(page, "Alice").getByTestId("score")).toHaveText("1");
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

test.describe("rounds", () => {
  const plus = (page: Page, name: string) =>
    player(page, name).getByRole("button", { name: `Add points to ${name}` }).click();
  const cells = (page: Page, round: number) =>
    page.getByRole("table", { name: "Scores per round" }).getByRole("row", { name: `Round ${round}` }).getByRole("cell");

  test("counts points per round and keeps a running total", async ({ page }) => {
    await addPlayer(page, "Alice");
    await addPlayer(page, "Bob");
    await plus(page, "Alice");
    await plus(page, "Alice");
    await expect(player(page, "Alice").getByTestId("round-score")).toHaveText("+2");

    await page.getByRole("button", { name: "Next round" }).click();
    await expect(page.getByRole("heading", { name: "Round 2" })).toBeVisible();
    await expect(player(page, "Alice").getByTestId("round-score")).toHaveText("+0");

    await plus(page, "Alice");
    await page.getByRole("radio", { name: "5" }).check();
    await plus(page, "Bob");

    await expect(cells(page, 1)).toHaveText(["2", "0"]);
    await expect(cells(page, 2)).toHaveText(["1", "5"]);
    await expect(player(page, "Alice").getByTestId("score")).toHaveText("3");
    await expect(player(page, "Bob").getByTestId("score")).toHaveText("5");
  });

  test("undo reopens the previous round", async ({ page }) => {
    await addPlayer(page, "Alice");
    await plus(page, "Alice");
    await page.getByRole("button", { name: "Next round" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("heading", { name: "Round 1" })).toBeVisible();
    await expect(player(page, "Alice").getByTestId("round-score")).toHaveText("+1");
  });

  test("new game goes back to round 1", async ({ page }) => {
    await addPlayer(page, "Alice");
    await plus(page, "Alice");
    await page.getByRole("button", { name: "Next round" }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "New game" }).click();
    await expect(page.getByRole("heading", { name: "Round 1" })).toBeVisible();
    await expect(cells(page, 2)).toHaveCount(0);
  });

  test("keeps rounds across reloads", async ({ page }) => {
    await addPlayer(page, "Alice");
    await plus(page, "Alice");
    await page.getByRole("button", { name: "Next round" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Round 2" })).toBeVisible();
    await expect(cells(page, 1)).toHaveText(["1"]);
  });
});

test.describe("typed points", () => {
  const field = (page: Page, name: string) => page.getByRole("spinbutton", { name: `Points for ${name}` });

  test("adds a typed value to the current round", async ({ page }) => {
    await addPlayer(page, "Alice");
    const alice = player(page, "Alice");
    await field(page, "Alice").fill("12");
    await alice.getByRole("button", { name: "Add typed points to Alice" }).click();
    await field(page, "Alice").fill("-3");
    await field(page, "Alice").press("Enter");
    await expect(alice.getByTestId("round-score")).toHaveText("+9");
    await expect(alice.getByTestId("score")).toHaveText("9");
    await expect(field(page, "Alice")).toHaveValue("");
  });

  test("ignores an empty value", async ({ page }) => {
    await addPlayer(page, "Alice");
    await field(page, "Alice").press("Enter");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });
});
