import assert from "node:assert/strict";
import { createServer } from "vite";
import { parseWpbrPassOcrText } from "../src/lib/wpbrPassOcr.js";

const vite = await createServer({
  logLevel: "silent",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const {
    companyKorpschefNameMatches,
    findMatchingWpbrLicense,
    korpschefDatesMatch,
    korpschefValuesMatch,
    parseKorpschefLicenseNumber,
  } = await vite.ssrLoadModule("/src/lib/korpschefRules.js");

  const frontText = `
LEGITIMATIEBEWIJS
Naam organisatie: Veluwse Objectbeveiliging B.V. Vergunningnummer: ND 4462
Geldig van: 20-02-2025 tot en met: 19-02-2028
Naam: Eijsvogel Voornamen: David Martino
Geboortedatum: 10-01-2001 Pasnummer: 20252183179
BEVEILIGER
  `;
  const parsed = parseWpbrPassOcrText({
    frontText,
    backText: "LEGITIMATIEBEWIJS\nDe korpschef van de politie",
  });

  assert.equal(parsed.organization_name, "Veluwse Objectbeveiliging B.V.");
  assert.equal(parsed.license_number, "ND4462");
  assert.equal(parsed.valid_from, "2025-02-20");
  assert.equal(parsed.valid_until, "2028-02-19");
  assert.equal(parsed.last_name, "Eijsvogel");
  assert.equal(parsed.given_names, "David Martino");
  assert.equal(parsed.birth_date, "2001-01-10");
  assert.equal(parsed.card_number, "20252183179");

  const company = {
    id: "company-1",
    legal_name: "Veluwse Objectbeveiliging B.V.",
    display_name: "Veluwse Beveiliging",
  };
  const licenses = [{
    id: "license-1",
    company_id: company.id,
    license_type: "ND",
    license_number: "#4462",
    valid_from: "2023-01-01",
    valid_until: "2028-12-31",
    status: "active",
  }];

  assert.deepEqual(parseKorpschefLicenseNumber("ND 4462"), { type: "ND", number: "4462" });
  assert.equal(findMatchingWpbrLicense({
    company,
    licenses,
    recognizedLicenseNumber: "ND 4462",
  }).status, "matched");
  assert.equal(findMatchingWpbrLicense({
    company,
    licenses,
    recognizedLicenseNumber: "ND 446Z",
  }).status, "matched");
  assert.equal(findMatchingWpbrLicense({
    company,
    licenses,
    recognizedLicenseNumber: "ND 446",
  }).status, "probable");
  assert.equal(findMatchingWpbrLicense({
    company,
    licenses,
    recognizedLicenseNumber: "ND 9999",
  }).status, "mismatch");

  assert.equal(korpschefValuesMatch("Eijsvogel", "EijsvogeI"), true);
  assert.equal(korpschefValuesMatch("Eijsvogel", "Jansen"), false);
  assert.equal(companyKorpschefNameMatches(company, "Veluwse Objectbeveillging BV"), true);
  assert.equal(companyKorpschefNameMatches(company, "Andere Beveiliging B.V."), false);
  assert.equal(korpschefDatesMatch("2001-01-10T00:00:00.000Z", "2001-01-10"), true);
  assert.equal(korpschefDatesMatch("2001-01-10", "2002-01-10"), false);

  console.log("Korpschef pass verification checks passed.");
} finally {
  await vite.close();
}
