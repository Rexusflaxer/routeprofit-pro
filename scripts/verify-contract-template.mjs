import assert from "node:assert/strict";
import {
  PB_FULLTIME_STANDARD_TEMPLATE as preset,
  getStandardContractTemplatePreset,
} from "../src/lib/contractTemplateCatalog.js";
import {
  getMissingStandardTemplatePlaceholders,
  getUnknownContractTemplatePlaceholders,
  getUnresolvedContractTemplatePlaceholders,
  renderContractTemplateBody,
  validateStandardContractTemplateContext,
} from "../src/lib/contractTemplateRenderer.js";
import {
  contractTemplateBodyFromBlocks,
  contractTemplateBlocksFromBody,
  contractTemplateFamilyKey,
  centeredScrollOffset,
  durationOptionsForContractTemplate,
  groupContractTemplateVersions,
  nextContractArticleSectionNumber,
  nextContractTemplateVersion,
  normalizeContractTemplateBlocks,
  paginateContractTemplateBlocks,
  paginateContractTemplateUnitsByHeight,
  resequenceContractTemplateVersions,
} from "../src/lib/contractTemplateEditor.js";
import {
  DEFAULT_PAGE_NUMBER_SETTINGS,
  formatPageNumber,
  normalizeLetterheadPreviewRenderScale,
  normalizePageNumberSettings,
  pageNumberFontSizeMm,
  pageNumberHorizontalAlignment,
  pageNumberPositionPercentages,
} from "../src/lib/letterheadDocumentSettings.js";

const company = {
  legal_name: "Voorbeeld Beveiliging B.V.",
  street_name: "Hoofdstraat",
  house_number: "1",
  postal_code: "1234 AB",
  city: "Utrecht",
  country: "Nederland",
  kvk_number: "12345678",
  email: "privacy@voorbeeld.nl",
};

const personnel = {
  legal_first_names: "Jan",
  first_name: "Jan",
  last_name: "Jansen",
  date_of_birth: "1990-01-02",
  place_of_birth: "Utrecht",
  street_name: "Dorpsweg",
  house_number: "2",
  postal_code: "2345 CD",
  city: "Zeist",
  country: "Nederland",
  wpbr_status: "approved",
};

const baseForm = {
  cao_key: "cao_particuliere_beveiliging",
  employment_contract_model: "fulltime",
  contract_start_date: "2026-01-01",
  contract_end_date: "2026-12-31",
  duration_type: "fixed",
  contract_form: "bepaalde_tijd",
  probation_agreed: "true",
  probation_context: "first_contract",
  contract_hours_per_week: "36",
  contract_hours_per_pay_period: "144",
  salary_payment_frequency: "four_weeks",
  cao_function_level: "a",
  cao_scale: "3",
  cao_period: "1",
  hourly_rate_snapshot: "18.50",
  work_location: "Utrecht",
  work_area: "Nederland",
  employer_representative_name: "P. Directeur",
  employer_representative_function: "directeur",
  signing_place: "Utrecht",
  signing_date: "2025-12-15",
};

const template = {
  ...preset,
  metadata: { standard_template_id: preset.id },
  employment_model_scope: "fulltime",
};

for (const contractModel of ["fulltime_employment", "fulltime", "fulltime_fixed", "fulltime_indefinite"]) {
  assert.equal(getStandardContractTemplatePreset({
    template_type: "employment_contract",
    cao_key: "cao_particuliere_beveiliging",
    contract_model: contractModel,
  })?.id, preset.id);
}
assert.equal(getStandardContractTemplatePreset({
  template_type: "employment_contract",
  cao_key: "cao_particuliere_beveiliging",
  contract_model: "parttime_employment",
}), null);

const editorBlocks = contractTemplateBlocksFromBody(preset.body);
assert.equal(editorBlocks.filter(block => block.kind === "article").length, 17);
assert.equal(editorBlocks[0].kind, "preamble");
assert.equal(editorBlocks.at(-1).kind, "closing");
const firstArticleBlock = editorBlocks.find(block => block.title === "Indiensttreding en duur");
assert.equal((firstArticleBlock?.content_html.match(/<p>/g) || []).length, 3);
assert.match(firstArticleBlock?.content_html || "", />x\.1\s/);
assert.doesNotMatch(firstArticleBlock?.content_html || "", />1\.1\s/);
assert.equal(nextContractArticleSectionNumber(firstArticleBlock?.content_html), 4);
const roundTripBody = contractTemplateBodyFromBlocks(editorBlocks);
assert.deepEqual(getUnknownContractTemplatePlaceholders(roundTripBody), []);
assert.deepEqual(getMissingStandardTemplatePlaceholders(roundTripBody), []);
assert.match(roundTripBody, /Artikel 1 - Indiensttreding en duur\n\n1\.1/);
const firstArticleIndex = editorBlocks.findIndex(block => block.kind === "article");
const reorderedBlocks = [...editorBlocks];
[reorderedBlocks[firstArticleIndex], reorderedBlocks[firstArticleIndex + 1]] = [reorderedBlocks[firstArticleIndex + 1], reorderedBlocks[firstArticleIndex]];
const reorderedBody = contractTemplateBodyFromBlocks(reorderedBlocks);
assert.match(reorderedBody, /Artikel 1 - Toepasselijke cao\n\n1\.1/);
assert.doesNotMatch(reorderedBody, /Artikel 1 - Toepasselijke cao\n\n2\.1/);
const migratedLegacyBlock = normalizeContractTemplateBlocks([{
  id: "legacy-article-six",
  kind: "article",
  title: "Oud genummerd artikel",
  article_number: 6,
  content_html: "<p>6.1 Eerste lid</p><p>6.2 Tweede lid</p>",
}]);
assert.equal(migratedLegacyBlock[0].article_number, 1);
assert.match(migratedLegacyBlock[0].content_html, /x\.1 Eerste lid/);
assert.match(migratedLegacyBlock[0].content_html, /x\.2 Tweede lid/);
assert.match(contractTemplateBodyFromBlocks(migratedLegacyBlock), /Artikel 1 - Oud genummerd artikel\n\n1\.1 Eerste lid\n\n1\.2 Tweede lid/);
assert.doesNotMatch(contractTemplateBodyFromBlocks(migratedLegacyBlock), /6\.[12]/);
const legacyMovedToArticleFive = normalizeContractTemplateBlocks([
  ...editorBlocks.filter(block => block.kind === "article").slice(0, 4),
  {
    id: "legacy-article-six-moved-to-five",
    kind: "article",
    title: "Verplaatst artikel",
    article_number: 6,
    content_html: "<p>6.1 Eerste lid</p><p>6.2 Tweede lid</p>",
  },
]);
const legacyMovedBody = contractTemplateBodyFromBlocks(legacyMovedToArticleFive);
assert.match(legacyMovedBody, /Artikel 5 - Verplaatst artikel\n\n5\.1 Eerste lid\n\n5\.2 Tweede lid/);
assert.doesNotMatch(legacyMovedBody, /6\.[12]/);
const previewPages = paginateContractTemplateBlocks(editorBlocks);
assert.ok(previewPages.length > 1);
assert.equal(new Set(previewPages.flat().map(item => item.id)).size, previewPages.flat().length);
const measuredPreviewUnits = [
  { id: "article-1", estimated_units: 1 },
  { id: "article-2", estimated_units: 1 },
  { id: "article-3", estimated_units: 1 },
];
const measuredPreviewPages = paginateContractTemplateUnitsByHeight(measuredPreviewUnits, {
  heights: { "article-1": 35, "article-2": 35, "article-3": 35 },
  pageHeight: 80,
  firstPageReservedHeight: 10,
  safetyGap: 5,
});
assert.deepEqual(
  measuredPreviewPages.map(page => page.map(item => item.id)),
  [["article-1"], ["article-2", "article-3"]],
);
assert.deepEqual(measuredPreviewPages.flat().map(item => item.id), measuredPreviewUnits.map(item => item.id));
assert.equal(centeredScrollOffset({
  currentOffset: 100,
  targetStart: 700,
  containerStart: 200,
  targetSize: 100,
  viewportSize: 400,
  scrollSize: 2000,
}), 450);
assert.equal(centeredScrollOffset({
  currentOffset: 0,
  targetStart: 20,
  containerStart: 100,
  targetSize: 40,
  viewportSize: 400,
  scrollSize: 2000,
}), 0);
assert.equal(centeredScrollOffset({
  currentOffset: 1500,
  targetStart: 900,
  containerStart: 100,
  targetSize: 100,
  viewportSize: 400,
  scrollSize: 1800,
}), 1400);

const legacyPageNumber = normalizePageNumberSettings({});
assert.deepEqual(legacyPageNumber, DEFAULT_PAGE_NUMBER_SETTINGS);
const customPageNumber = normalizePageNumberSettings({
  document_settings: {
    page_number: {
      enabled: true,
      x_mm: 105,
      y_mm: 287,
      font_size_pt: 12,
      format: "page_of_total",
    },
  },
});
assert.deepEqual(customPageNumber, {
  enabled: true,
  x_mm: 105,
  y_mm: 287,
  font_size_pt: 12,
  format: "page_of_total",
});
assert.deepEqual(pageNumberPositionPercentages(customPageNumber), {
  left: 50,
  top: (287 / 297) * 100,
});
assert.equal(formatPageNumber(customPageNumber, 2, 5), "2 / 5");
assert.equal(formatPageNumber({ ...customPageNumber, format: "page_word_of_total" }, 2, 5), "Pagina 2 van 5");
assert.equal(pageNumberFontSizeMm(customPageNumber), 4.2333);
assert.equal(pageNumberHorizontalAlignment({ ...customPageNumber, x_mm: 15 }), "left");
assert.equal(pageNumberHorizontalAlignment(customPageNumber), "center");
assert.equal(pageNumberHorizontalAlignment({ ...customPageNumber, x_mm: 195 }), "right");
assert.equal(normalizeLetterheadPreviewRenderScale(0.8), 1);
assert.equal(normalizeLetterheadPreviewRenderScale(1.8), 1.8);
assert.equal(normalizeLetterheadPreviewRenderScale(8), 3);
assert.deepEqual(normalizePageNumberSettings({
  page_number: { x_mm: -10, y_mm: 400, font_size_pt: 40 },
}), {
  enabled: true,
  x_mm: 3,
  y_mm: 294,
  font_size_pt: 18,
  format: "page",
});

const pbFulltimeDurations = durationOptionsForContractTemplate({
  template_type: "employment_contract",
  cao_key: "cao_particuliere_beveiliging",
  contract_model: "fulltime_employment",
});
assert.ok(pbFulltimeDurations.some(option => option.value === "indefinite"));
assert.ok(pbFulltimeDurations.some(option => option.value === "free"));
const internshipDurations = durationOptionsForContractTemplate({
  template_type: "employment_contract",
  cao_key: "cao_particuliere_beveiliging",
  contract_model: "internship",
});
assert.ok(!internshipDurations.some(option => option.value === "indefinite"));
assert.ok(!internshipDurations.some(option => option.value === "2_years"));

const templateFamily = {
  template_type: "employment_contract",
  cao_key: "cao_particuliere_beveiliging",
  employment_model_scope: "fulltime",
  name: "Standaard fulltime",
};
const familyKey = contractTemplateFamilyKey(templateFamily);
const familyVersions = [
  { ...templateFamily, id: "v1", version: 1 },
  { ...templateFamily, id: "v2", name: "Oude afwijkende referentie", version: 2 },
];
assert.equal(groupContractTemplateVersions(familyVersions).length, 1);
assert.equal(groupContractTemplateVersions(familyVersions)[0].versions[0].id, "v2");
assert.equal(nextContractTemplateVersion(familyVersions, familyKey), 3);
assert.equal(contractTemplateFamilyKey(familyVersions[0]), contractTemplateFamilyKey(familyVersions[1]));
assert.deepEqual(
  resequenceContractTemplateVersions([
    { ...templateFamily, id: "v3", version: 3 },
    { ...templateFamily, id: "v1", version: 1 },
  ]).map(item => ({ id: item.id, version: item.version, source: item.version_source_id })),
  [
    { id: "v1", version: 1, source: null },
    { id: "v3", version: 2, source: "v1" },
  ],
);

function evaluate(form) {
  const body = renderContractTemplateBody(preset.body, { personnel, form, company });
  return {
    body,
    unresolved: getUnresolvedContractTemplatePlaceholders(body),
    ...validateStandardContractTemplateContext({ personnel, form, company, template }),
  };
}

function operationalForm(overrides = {}) {
  return {
    ...baseForm,
    function_type: "objectbeveiliger",
    allowed_function_types_text: "objectbeveiliger",
    cao_function_group: "objectbeveiliger_receptionist",
    performs_security_work: "true",
    ...overrides,
  };
}

assert.deepEqual(getUnknownContractTemplatePlaceholders(preset.body), []);
assert.deepEqual(getMissingStandardTemplatePlaceholders(preset.body), []);

const objectSecurity = evaluate(operationalForm());
assert.deepEqual(objectSecurity.issues, []);
assert.deepEqual(objectSecurity.unresolved, []);
assert.match(objectSecurity.body, /144 uur per loonperiode van vier weken/);

const pac = evaluate(operationalForm({
  function_type: "centralist_pac",
  allowed_function_types_text: "centralist_pac",
  cao_function_group: "centralist",
}));
assert.deepEqual(pac.issues, []);
assert.match(pac.body, /Centralist PAC/);

const multipleFunctions = evaluate(operationalForm({
  allowed_function_types_text: "objectbeveiliger, centralist_pac",
}));
assert.equal(multipleFunctions.warnings.length, 1);

const cashValue = evaluate(operationalForm({
  function_type: "geld_waardetransporteur",
  allowed_function_types_text: "geld_waardetransporteur",
  cao_function_group: "geld_waardetransporteur",
  works_cash_value_logistics: "true",
}));
assert.deepEqual(cashValue.issues, []);
assert.match(cashValue.body, /180 vakantie-uren/);

const office = evaluate({
  ...baseForm,
  function_type: "planner",
  allowed_function_types_text: "planner",
  cao_function_group: "non_security_staff",
  cao_function_level: "not_applicable",
  cao_scale: "",
  cao_period: "",
  performs_security_work: "false",
  contract_hours_per_week: "40",
  contract_hours_per_pay_period: "160",
});
assert.deepEqual(office.issues, []);
assert.match(office.body, /20 wettelijke en 4 bovenwettelijke vakantiedagen/);

const sixMonths = evaluate(operationalForm({ contract_end_date: "2026-06-30" }));
assert.ok(sixMonths.issues.some(issue => issue.includes("zes maanden of korter")));
assert.match(sixMonths.body, /geen proeftijd overeen/);

const twoYears = evaluate(operationalForm({ contract_end_date: "2027-12-31" }));
assert.deepEqual(twoYears.issues, []);
assert.match(twoYears.body, /proeftijd van één maand/);

const aspirant = evaluate(operationalForm({
  contract_end_date: "2027-12-31",
  cao_function_level: "aspirant",
  cao_scale: "2",
  security_role_status: "aspirant_beveiliger",
}));
assert.deepEqual(aspirant.issues, []);
assert.match(aspirant.body, /proeftijd van twee maanden/);

const successive = evaluate(operationalForm({ probation_context: "successive_same_work" }));
assert.ok(successive.issues.some(issue => issue.includes("opvolgend contract")));
assert.match(successive.body, /geen nieuwe proeftijd overeen/);

const wrongScale = evaluate(operationalForm({ cao_scale: "4" }));
assert.ok(wrongScale.issues.some(issue => issue.includes("hoort bij salarisschaal 3")));

const expiredVersion = evaluate(operationalForm({
  contract_start_date: "2027-01-01",
  contract_end_date: "2027-12-31",
}));
assert.ok(expiredVersion.issues.some(issue => issue.includes("bijgewerkte CAO-versie")));

console.log("Contracttemplate verificatie geslaagd (11 contractsituaties, 5 presetselecties en editor-/versietests).\n");
