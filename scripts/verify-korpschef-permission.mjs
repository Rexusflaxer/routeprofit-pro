import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  logLevel: "silent",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const {
    parseDutchPermissionDate,
    parseWpbrPermissionOcrText,
  } = await vite.ssrLoadModule("/src/lib/wpbrPermissionOcr.js");
  const {
    companyKorpschefNameMatches,
    korpschefDatesMatch,
    korpschefValuesMatch,
  } = await vite.ssrLoadModule("/src/lib/korpschefRules.js");

  const pageOne = `
    Politie
    BESLUIT AAN
    Organisatienaam: Veluwse Objectbeveiliging B.V.
    Vestigingsadres: Ir. R.R. van der Zeelaan 1
    8191 JH Wapenveld
    TEN BEHOEVE VAN
    Naam en voornamen: Rorije, Jan
    Geboorteplaats en geboortedatum: Oldebroek, 4 januari 1986
    Adres: Voorbeeldstraat 12
    8091 AA Wezep
    Ik heb besloten betrokkene per 2 september 2025 toestemming te verlenen.
    De toestemming vervalt op 2 september 2026.
    Politie-eenheid: Oost-Nederland
    Datum beschikking: 28 augustus 2025
    Nummer beschikking: 20252256207
  `;
  const pageTwo = `
    Team Korpscheftaken Apeldoorn
    Behandeld door: A.E. Batura
    Ons kenmerk: 485944
    Datum: 28 augustus 2025
    Onderwerp: Toestemming en legitimatiebewijs PBO
    Datum aanvraag: 25-08-2025
    De toestemming wordt verleend onder de volgende voorwaarde.
    De bevraging op strafrechtelijke gegevens is nog niet volledig afgerond.
    De toestemming kan alsnog worden ingetrokken.
  `;

  const parsed = parseWpbrPermissionOcrText({ pageTexts: [pageOne, pageTwo] });
  assert.equal(parsed.document_detected, true);
  assert.equal(parsed.organization_name, "Veluwse Objectbeveiliging B.V.");
  assert.equal(parsed.organization_address, "Ir. R.R. van der Zeelaan 1, 8191 JH Wapenveld");
  assert.equal(parsed.last_name, "Rorije");
  assert.equal(parsed.given_names, "Jan");
  assert.equal(parsed.birth_place, "Oldebroek");
  assert.equal(parsed.birth_date, "1986-01-04");
  assert.equal(parsed.holder_address, "Voorbeeldstraat 12, 8091 AA Wezep");
  assert.equal(parsed.decision_number, "20252256207");
  assert.equal(parsed.decision_date, "2025-08-28");
  assert.equal(parsed.valid_from, "2025-09-02");
  assert.equal(parsed.valid_until, "2026-09-02");
  assert.equal(parsed.correspondence_reference, "485944");
  assert.equal(parsed.police_unit, "Oost-Nederland");
  assert.equal(parsed.subject, "Toestemming en legitimatiebewijs PBO");
  assert.equal(parsed.application_date, "2025-08-25");
  assert.equal(parsed.conditional_permission, true);
  assert.equal(parsed.condition_type, "pending_criminal_records_check");
  assert.equal(parsed.upload_quality.status, "ok");

  assert.equal(parseDutchPermissionDate("4 januari 1986"), "1986-01-04");
  assert.equal(parseDutchPermissionDate("28-08-2025"), "2025-08-28");
  assert.equal(parseDutchPermissionDate("31 februari 2025"), "");

  const company = {
    legal_name: "Veluwse Objectbeveiliging B.V.",
    trade_name: "Veluwse Beveiliging",
  };
  assert.equal(companyKorpschefNameMatches(company, parsed.organization_name), true);
  assert.equal(korpschefValuesMatch("Rorije", parsed.last_name), true);
  assert.equal(korpschefValuesMatch("Jan", parsed.given_names), true);
  assert.equal(korpschefDatesMatch("1986-01-04", parsed.birth_date), true);

  console.log("Korpschef permission verification checks passed.");
} finally {
  await vite.close();
}
