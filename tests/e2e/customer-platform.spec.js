import fs from "node:fs";
import { expect, test } from "@playwright/test";

const backofficeState = process.env.E2E_BACKOFFICE_STORAGE_STATE;
const portalAState = process.env.E2E_PORTAL_A_STORAGE_STATE;
const portalBState = process.env.E2E_PORTAL_B_STORAGE_STATE;
const customerId = process.env.E2E_CUSTOMER_ID;

function usableState(file) {
  return Boolean(file && fs.existsSync(file));
}

test.describe("geauthenticeerde backoffice", () => {
  test.skip(!usableState(backofficeState) || !customerId, "Geauthenticeerde backoffice-state en E2E_CUSTOMER_ID zijn vereist");

  test("bewaart klantdeeplink, tab en rijselectie bij herladen", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ storageState: backofficeState });
    const page = await context.newPage();
    await page.goto(`${baseURL}/CustomerDetail?id=${encodeURIComponent(customerId)}&tab=contacts`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/tab=contacts/);
    await page.reload();
    await expect(page).toHaveURL(/tab=contacts/);
    await context.close();
  });
});

test.describe("geauthenticeerde portaalisolatie", () => {
  test.skip(
    !usableState(portalAState)
      || !usableState(portalBState)
      || !process.env.E2E_PORTAL_A_CUSTOMER_NAME
      || !process.env.E2E_PORTAL_B_CUSTOMER_NAME,
    "Twee geauthenticeerde portaalstates en verwachte klantnamen zijn vereist",
  );

  test("klant A en B blijven op UI-niveau strikt gescheiden", async ({ browser, baseURL }) => {
    const contextA = await browser.newContext({ storageState: portalAState });
    const pageA = await contextA.newPage();
    await pageA.goto(`${baseURL}/CustomerPortal?tab=overview`);
    await expect(pageA.getByText(process.env.E2E_PORTAL_A_CUSTOMER_NAME, { exact: true }).first()).toBeVisible();
    await expect(pageA.getByText(process.env.E2E_PORTAL_B_CUSTOMER_NAME, { exact: true })).toHaveCount(0);

    const contextB = await browser.newContext({ storageState: portalBState });
    const pageB = await contextB.newPage();
    await pageB.goto(`${baseURL}/CustomerPortal?tab=overview&customer_id=guessed-customer-a`);
    await expect(pageB.getByText(process.env.E2E_PORTAL_B_CUSTOMER_NAME, { exact: true }).first()).toBeVisible();
    await expect(pageB.getByText(process.env.E2E_PORTAL_A_CUSTOMER_NAME, { exact: true })).toHaveCount(0);
    await contextA.close();
    await contextB.close();
  });
});
