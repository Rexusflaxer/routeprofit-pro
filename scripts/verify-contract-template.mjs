import assert from "node:assert/strict";
import {
  PB_ARTICLE_14_INTERNSHIP_REQUIRED_PLACEHOLDERS,
  PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE as internshipPreset,
  PB_BBL_EMPLOYMENT_REQUIRED_PLACEHOLDERS,
  PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE as bblPreset,
  PB_FULLTIME_STANDARD_TEMPLATE as preset,
  PB_MIN_MAX_REQUIRED_PLACEHOLDERS,
  PB_MIN_MAX_STANDARD_TEMPLATE as minMaxPreset,
  PB_PARTTIME_GROWTH_REQUIRED_PLACEHOLDERS,
  PB_PARTTIME_GROWTH_STANDARD_TEMPLATE as growthParttimePreset,
  PB_PARTTIME_REQUIRED_PLACEHOLDERS,
  PB_PARTTIME_STANDARD_TEMPLATE as parttimePreset,
  PB_ZERO_HOURS_REQUIRED_PLACEHOLDERS,
  PB_ZERO_HOURS_STANDARD_TEMPLATE as zeroHoursPreset,
  getStandardContractTemplatePreset,
} from "../src/lib/contractTemplateCatalog.js";
import {
  buildContractTemplateValues,
  getMissingStandardTemplatePlaceholders,
  getUnknownContractTemplatePlaceholders,
  getUnresolvedContractTemplatePlaceholders,
  renderContractTemplateBody,
  validateStandardContractTemplateContext,
} from "../src/lib/contractTemplateRenderer.js";
import {
  addressPartsFromSuggestion,
  formatAddress,
  normalizeAddressParts,
} from "../src/lib/addressFormatting.js";
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
import {
  DEFAULT_CONTRACT_PDF_MARGINS,
  PDF_POINTS_PER_MM,
  normalizeContractPdfMargins,
} from "../src/lib/contractPdfLetterhead.js";

const company = {
  display_name: "Voorbeeld Objectbeveiliging B.V.",
  legal_name: "Voorbeeld Objectbeveiliging B.V.",
  trade_name: "Voorbeeld Beveiliging",
  street_name: "Hoofdstraat",
  house_number: "1",
  postal_code: "1234 AB",
  city: "Utrecht",
  country: "Nederland",
  kvk_number: "12345678",
  email: "privacy@voorbeeld.nl",
};

const personnel = {
  legal_first_names: "Jan Martino",
  first_name: "Jan",
  call_name: "Jan",
  full_name: "Jan Jansen",
  last_name: "Jansen",
  date_of_birth: "1990-01-02",
  place_of_birth: "Utrecht",
  street_name: "Dorpsweg",
  house_number: "2",
  postal_code: "2345 CD",
  city: "Zeist",
  country: "Nederland",
  wpbr_status: "approved",
  wpbr_authority: "korpschef",
  wpbr_permission_number: "WPBR-MW-2026-001",
  wpbr_permission_valid_from: "2025-12-01",
  wpbr_permission_valid_until: "2027-12-01",
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
  hourly_rate_snapshot: "17.37",
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

const pollutedCompanyAddress = {
  street_name: "Ir. R.R. van der Zeelaan 1, 8191JH Wapenveld",
  house_number: "1",
  postal_code: "8191JH",
  city: "Wapenveld",
  country: "Nederland",
};
assert.deepEqual(normalizeAddressParts(pollutedCompanyAddress), {
  street_name: "Ir. R.R. van der Zeelaan",
  house_number: "1",
  house_number_addition: "",
  postal_code: "8191JH",
  city: "Wapenveld",
  country: "Nederland",
});
assert.equal(
  formatAddress(pollutedCompanyAddress),
  "Ir. R.R. van der Zeelaan 1, 8191JH Wapenveld, Nederland",
);
assert.deepEqual(
  addressPartsFromSuggestion({ address: "Ir. R.R. van der Zeelaan 1, 8191JH Wapenveld" }),
  normalizeAddressParts(pollutedCompanyAddress),
);
assert.equal(formatAddress({
  street_name: "Vicarielaan 32, 8181KA Heerde",
  house_number: "32",
  postal_code: "8181KA",
  city: "8181KA Heerde",
  country: "Nederland",
}), "Vicarielaan 32, 8181KA Heerde, Nederland");
assert.equal(formatAddress({
  street_name: "Plein 1944",
  house_number: "12",
  postal_code: "6511AA",
  city: "Nijmegen",
  country: "Nederland",
}), "Plein 1944 12, 6511AA Nijmegen, Nederland");
const pollutedAddressValues = buildContractTemplateValues({
  personnel: {
    ...personnel,
    street_name: "Dorpsweg 2, 2345CD Zeist",
    city: "2345CD Zeist",
  },
  company: { ...company, ...pollutedCompanyAddress },
  form: baseForm,
});
assert.equal(pollutedAddressValues.bedrijf_adres_volledig, "Ir. R.R. van der Zeelaan 1, 8191JH Wapenveld, Nederland");
assert.equal(pollutedAddressValues.medewerker_adres_volledig, "Dorpsweg 2, 2345CD Zeist, Nederland");
assert.equal(pollutedAddressValues.medewerker_postcode, "2345CD");
assert.equal(pollutedAddressValues.medewerker_plaats, "Zeist");

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
})?.id, parttimePreset.id);
for (const contractModel of ["parttime", "parttime_employment", "parttime_fixed", "parttime_indefinite"]) {
  assert.equal(getStandardContractTemplatePreset({
    template_type: "employment_contract",
    cao_key: "cao_particuliere_beveiliging",
    contract_model: contractModel,
  })?.id, parttimePreset.id);
}
for (const contractModel of ["parttime_growth", "parttime_growth_employment"]) {
  assert.equal(getStandardContractTemplatePreset({
    template_type: "employment_contract",
    cao_key: "cao_particuliere_beveiliging",
    contract_model: contractModel,
  })?.id, growthParttimePreset.id);
}
for (const contractModel of ["min_max", "min_max_employment", "min_max_fixed", "min_max_indefinite"]) {
  assert.equal(getStandardContractTemplatePreset({
    template_type: "employment_contract",
    cao_key: "cao_particuliere_beveiliging",
    contract_model: contractModel,
  })?.id, minMaxPreset.id);
}
for (const contractModel of ["zero_hours", "zero_hours_employment", "call_employment", "call_fixed", "call_indefinite", "call_agreement"]) {
  assert.equal(getStandardContractTemplatePreset({
    template_type: "employment_contract",
    cao_key: "cao_particuliere_beveiliging",
    contract_model: contractModel,
  })?.id, zeroHoursPreset.id);
}
for (const contractModel of ["internship", "internship_fixed", "article_14_internship"]) {
  assert.equal(getStandardContractTemplatePreset({
    template_type: "employment_contract",
    cao_key: "cao_particuliere_beveiliging",
    contract_model: contractModel,
  })?.id, internshipPreset.id);
}
for (const contractModel of ["bbl", "bbl_employment", "bbl_fixed"]) {
  assert.equal(getStandardContractTemplatePreset({
    template_type: "employment_contract",
    cao_key: "cao_particuliere_beveiliging",
    contract_model: contractModel,
  })?.id, bblPreset.id);
}
assert.equal(getStandardContractTemplatePreset({
  template_type: "employment_contract",
  cao_key: "cao_particuliere_beveiliging",
  contract_model: "bbl_indefinite",
}), null);
assert.equal(getStandardContractTemplatePreset({
  template_type: "employment_contract",
  cao_key: "cao_particuliere_beveiliging",
  contract_model: "parttime_employment",
  employment_model_scope: "fulltime",
})?.id, parttimePreset.id);

const editorBlocks = contractTemplateBlocksFromBody(preset.body);
assert.ok(preset.body.startsWith("ARBEIDSOVEREENKOMST\nFulltime dienstverband - CAO Particuliere Beveiliging"));
assert.equal((preset.body.match(/Fulltime dienstverband - CAO Particuliere Beveiliging/g) || []).length, 1);
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
const parttimeEditorBlocks = contractTemplateBlocksFromBody(parttimePreset.body);
assert.equal(parttimeEditorBlocks.filter(block => block.kind === "article").length, 17);
assert.match(parttimePreset.body, /Parttime dienstverband - CAO Particuliere Beveiliging/);
assert.match(parttimePreset.body, /Artikel 5 - Arbeidsduur, vast parttimemodel, rooster en werktijden/);
assert.deepEqual(getUnknownContractTemplatePlaceholders(parttimePreset.body), []);
assert.deepEqual(getMissingStandardTemplatePlaceholders(parttimePreset.body, PB_PARTTIME_REQUIRED_PLACEHOLDERS), []);
const growthParttimeEditorBlocks = contractTemplateBlocksFromBody(growthParttimePreset.body);
assert.equal(growthParttimeEditorBlocks.filter(block => block.kind === "article").length, 17);
assert.match(growthParttimePreset.body, /Parttime groeimodel - CAO Particuliere Beveiliging/);
assert.match(growthParttimePreset.body, /Artikel 5 - Arbeidsduur, groeimodel, rooster en werktijden/);
assert.deepEqual(getUnknownContractTemplatePlaceholders(growthParttimePreset.body), []);
assert.deepEqual(getMissingStandardTemplatePlaceholders(growthParttimePreset.body, PB_PARTTIME_GROWTH_REQUIRED_PLACEHOLDERS), []);
const minMaxEditorBlocks = contractTemplateBlocksFromBody(minMaxPreset.body);
assert.equal(minMaxEditorBlocks.filter(block => block.kind === "article").length, 17);
assert.match(minMaxPreset.body, /Min-maxcontract - CAO Particuliere Beveiliging/);
assert.match(minMaxPreset.body, /Artikel 5 - Arbeidsduur, min-maxmodel en oproepen/);
assert.deepEqual(getUnknownContractTemplatePlaceholders(minMaxPreset.body), []);
assert.deepEqual(getMissingStandardTemplatePlaceholders(minMaxPreset.body, PB_MIN_MAX_REQUIRED_PLACEHOLDERS), []);
const zeroHoursEditorBlocks = contractTemplateBlocksFromBody(zeroHoursPreset.body);
assert.equal(zeroHoursEditorBlocks.filter(block => block.kind === "article").length, 17);
assert.match(zeroHoursPreset.body, /Nulurencontract - CAO Particuliere Beveiliging/);
assert.match(zeroHoursPreset.body, /Artikel 5 - Nulurenovereenkomst, beschikbaarheid en oproepen/);
assert.deepEqual(getUnknownContractTemplatePlaceholders(zeroHoursPreset.body), []);
assert.deepEqual(getMissingStandardTemplatePlaceholders(zeroHoursPreset.body, PB_ZERO_HOURS_REQUIRED_PLACEHOLDERS), []);
const internshipEditorBlocks = contractTemplateBlocksFromBody(internshipPreset.body);
assert.equal(internshipEditorBlocks.filter(block => block.kind === "article").length, 17);
assert.match(internshipPreset.body, /STAGEOVEREENKOMST/);
assert.match(internshipPreset.body, /geen arbeidsovereenkomst/i);
assert.deepEqual(getUnknownContractTemplatePlaceholders(internshipPreset.body), []);
assert.deepEqual(getMissingStandardTemplatePlaceholders(internshipPreset.body, PB_ARTICLE_14_INTERNSHIP_REQUIRED_PLACEHOLDERS), []);
const bblEditorBlocks = contractTemplateBlocksFromBody(bblPreset.body);
assert.equal(bblEditorBlocks.filter(block => block.kind === "article").length, 17);
assert.match(bblPreset.body, /Leerarbeidsovereenkomst \(BBL\)/);
assert.equal(bblPreset.supports_fixed_term_only, true);
assert.deepEqual(getUnknownContractTemplatePlaceholders(bblPreset.body), []);
assert.deepEqual(getMissingStandardTemplatePlaceholders(bblPreset.body, PB_BBL_EMPLOYMENT_REQUIRED_PLACEHOLDERS), []);
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
assert.equal(previewPages.flat()[0]?.block_kind, "preamble");
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
assert.deepEqual(normalizeContractPdfMargins({}), DEFAULT_CONTRACT_PDF_MARGINS);
assert.deepEqual(normalizeContractPdfMargins({
  document_settings: {
    margins_mm: { top: 12, right: 18, bottom: 23, left: 16 },
  },
}), { top: 12, right: 18, bottom: 23, left: 16 });
assert.deepEqual(normalizeContractPdfMargins({
  metadata: { margins_mm: { top: -5, right: 110, bottom: 20, left: 14 } },
}), { top: 0, right: 90, bottom: 20, left: 14 });
assert.equal(PDF_POINTS_PER_MM, 72 / 25.4);

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
assert.deepEqual(internshipDurations.map(option => option.value), ["pok_end_date", "free"]);
assert.match(internshipDurations.find(option => option.value === "pok_end_date")?.description || "", /BOL/);
const bblDurations = durationOptionsForContractTemplate({
  template_type: "employment_contract",
  cao_key: "cao_particuliere_beveiliging",
  contract_model: "bbl_employment",
});
assert.ok(!bblDurations.some(option => option.value === "indefinite"));
assert.deepEqual(bblDurations.map(option => option.value), ["pok_end_date", "free"]);
assert.ok(bblDurations.every(option => option.description.includes("bepaalde tijd")));

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

const parttimeTemplate = {
  ...parttimePreset,
  metadata: { standard_template_id: parttimePreset.id },
  employment_model_scope: "parttime_fixed",
};

function evaluateParttime(form) {
  const body = renderContractTemplateBody(parttimePreset.body, { personnel, form, company });
  return {
    body,
    unresolved: getUnresolvedContractTemplatePlaceholders(body),
    ...validateStandardContractTemplateContext({ personnel, form, company, template: parttimeTemplate }),
  };
}

const growthParttimeTemplate = {
  ...growthParttimePreset,
  metadata: { standard_template_id: growthParttimePreset.id },
  employment_model_scope: "parttime_growth",
};

function evaluateGrowthParttime(form) {
  const body = renderContractTemplateBody(growthParttimePreset.body, { personnel, form, company });
  return {
    body,
    unresolved: getUnresolvedContractTemplatePlaceholders(body),
    ...validateStandardContractTemplateContext({ personnel, form, company, template: growthParttimeTemplate }),
  };
}

const minMaxTemplate = {
  ...minMaxPreset,
  metadata: { standard_template_id: minMaxPreset.id },
  employment_model_scope: "min_max",
};

function evaluateMinMax(form) {
  const body = renderContractTemplateBody(minMaxPreset.body, { personnel, form, company });
  return {
    body,
    unresolved: getUnresolvedContractTemplatePlaceholders(body),
    ...validateStandardContractTemplateContext({ personnel, form, company, template: minMaxTemplate }),
  };
}

const zeroHoursTemplate = {
  ...zeroHoursPreset,
  metadata: { standard_template_id: zeroHoursPreset.id },
  employment_model_scope: "zero_hours",
};

function evaluateZeroHours(form) {
  const body = renderContractTemplateBody(zeroHoursPreset.body, { personnel, form, company });
  return {
    body,
    unresolved: getUnresolvedContractTemplatePlaceholders(body),
    ...validateStandardContractTemplateContext({ personnel, form, company, template: zeroHoursTemplate }),
  };
}

const internshipTemplate = {
  ...internshipPreset,
  metadata: { standard_template_id: internshipPreset.id },
  employment_model_scope: "internship",
  legal_document_type: "internship_agreement",
  learning_route_scope: "article_14_internship",
};

function evaluateInternship(form) {
  const body = renderContractTemplateBody(internshipPreset.body, { personnel, form, company });
  return {
    body,
    unresolved: getUnresolvedContractTemplatePlaceholders(body),
    ...validateStandardContractTemplateContext({ personnel, form, company, template: internshipTemplate }),
  };
}

const bblTemplate = {
  ...bblPreset,
  metadata: { standard_template_id: bblPreset.id },
  employment_model_scope: "bbl",
  legal_document_type: "employment_agreement",
  learning_route_scope: "bbl",
};

function evaluateBbl(form) {
  const body = renderContractTemplateBody(bblPreset.body, { personnel, form, company });
  return {
    body,
    unresolved: getUnresolvedContractTemplatePlaceholders(body),
    ...validateStandardContractTemplateContext({ personnel, form, company, template: bblTemplate }),
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
assert.match(objectSecurity.body, /Werkgever: Voorbeeld Objectbeveiliging B\.V\./);
assert.match(objectSecurity.body, /Werknemer: Jan Martino Jansen/);
assert.match(objectSecurity.body, /Stichting Bedrijfstakpensioenfonds voor de Particuliere Beveiliging \(Pensioenfonds Particuliere Beveiliging\)/);
assert.match(objectSecurity.body, /salarisschaal 3, periodiek 1/);
assert.match(objectSecurity.body, /€\s*17,37 per uur/);
assert.match(objectSecurity.body, /ontbindende voorwaarde.*artikel 7 Wpbr/);
assert.match(objectSecurity.body, /schriftelijk besluit van de korpschef/);
assert.doesNotMatch(objectSecurity.body, /veroorzaakt geen automatische beëindiging/);
assert.match(objectSecurity.body, /tijdelijke arbeidsovereenkomst eindigt van rechtswege/);
assert.match(objectSecurity.body, /toestemming van UWV.*kantonrechter/);
assert.match(objectSecurity.body, /direct bij werkgever volgens de op dat moment geldende interne meldprocedure/);
assert.doesNotMatch(objectSecurity.body, /privacy@voorbeeld\.nl/);

const legacyUnknownFunction = evaluate(operationalForm({
  function_type: "unknown",
  allowed_function_types_text: "unknown, objectbeveiliger, centralist_pac",
  primary_function_status: "pending_work_history",
  primary_function_source: "provisional_contract_start",
}));
assert.deepEqual(legacyUnknownFunction.issues, []);
assert.match(legacyUnknownFunction.body, /Objectbeveiliger, Centralist PAC/);
assert.doesNotMatch(legacyUnknownFunction.body, /Onbekend/);

const migratedLegacyPrivacyClause = renderContractTemplateBody(
  "12.4 Werknemer meldt verlies, onbevoegde toegang, verkeerde verzending of een mogelijk datalek direct bij {$meldpunt_privacy_datalekken}.",
  { personnel, form: operationalForm(), company },
);
assert.match(migratedLegacyPrivacyClause, /direct bij werkgever volgens de op dat moment geldende interne meldprocedure/);
assert.doesNotMatch(migratedLegacyPrivacyClause, /privacy@voorbeeld\.nl/);

const indefiniteObjectSecurity = evaluate(operationalForm({
  duration_type: "indefinite",
  contract_form: "onbepaalde_tijd",
  contract_end_date: "",
}));
assert.deepEqual(indefiniteObjectSecurity.issues, []);
assert.match(indefiniteObjectSecurity.body, /opzegtermijn van twee loonperioden van in totaal acht weken/);
assert.match(indefiniteObjectSecurity.body, /Werkgever kan de arbeidsovereenkomst alleen beëindigen.*toestemming van UWV.*kantonrechter/);
const indefiniteValues = buildContractTemplateValues({
  personnel,
  company,
  form: operationalForm({
    duration_type: "indefinite",
    contract_form: "onbepaalde_tijd",
    contract_end_date: "",
  }),
});
assert.equal(indefiniteValues.contract_einddatum, "");
assert.equal(indefiniteValues.contract_einddatum_of_onbepaalde_tijd, "onbepaalde tijd");

const legacyWpbrBody = renderContractTemplateBody([
  "10.1 {$contract_wpbr_bepaling}",
  "10.2 Meldplicht.",
  "10.3 Ontbreekt of vervalt een vereiste toestemming, legitimatie of vakbekwaamheid, dan zet werkgever werknemer niet in voor werkzaamheden waarvoor die eis geldt. Partijen beoordelen de gevolgen volgens de wet, de {$cao_naam} en de omstandigheden; deze bepaling veroorzaakt geen automatische beëindiging van de arbeidsovereenkomst.",
].join("\n"), { personnel, form: operationalForm(), company });
assert.match(legacyWpbrBody, /ontbindende voorwaarde/);
assert.doesNotMatch(legacyWpbrBody, /veroorzaakt geen automatische beëindiging/);

const pendingEmployerSignature = evaluate(operationalForm({
  employer_representative_name: "",
  employer_representative_function: "",
  signing_place: "",
  signing_date: "",
}));
assert.deepEqual(pendingEmployerSignature.issues, []);
assert.ok(pendingEmployerSignature.warnings.some(warning => warning.includes("bij ondertekening ingevuld")));
assert.match(pendingEmployerSignature.body, /Aldus overeengekomen en ondertekend te _{8,} op _{4}-_{4}-_{8}/);
assert.match(pendingEmployerSignature.body, /Voor werkgever:\n_{8,}\n_{8,}/);

const pac = evaluate(operationalForm({
  function_type: "centralist_pac",
  allowed_function_types_text: "centralist_pac",
  cao_function_group: "centralist",
}));
assert.deepEqual(pac.issues, []);
assert.match(pac.body, /Centralist PAC/);

const multipleFunctions = evaluate(operationalForm({
  allowed_function_types_text: "objectbeveiliger, centralist_pac",
  primary_function_status: "pending_work_history",
  primary_function_source: "provisional_contract_start",
}));
assert.deepEqual(multipleFunctions.warnings, []);
assert.match(multipleFunctions.body, /structureel gedurende 50% of meer van de arbeidsduur/);
assert.match(multipleFunctions.body, /past werkgever de functie-indeling zo nodig aan overeenkomstig de cao/);
assert.doesNotMatch(multipleFunctions.body, /LOQ bewaakt|geregistreerde diensten|registratie alleen|salarisschaal 3 en periodiek 4 vastgelegd/);
const multipleFunctionsArticleFour = multipleFunctions.body.match(/Artikel 4[\s\S]*?(?=\n\nArtikel 5)/)?.[0] || "";
assert.match(multipleFunctionsArticleFour, /functiegroep Objectbeveiliger \/ receptionist/);
assert.doesNotMatch(multipleFunctionsArticleFour, /LOQ|salarisschaal|periodiek/);
assert.match(multipleFunctions.body, /Artikel 6[\s\S]*?salarisschaal 3, periodiek 1/);

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
assert.match(office.body, /geen operationele CAO-PB-salarisschaal van toepassing/);
assert.match(office.body, /uitsluitend werkzaamheden voor werkgever verrichten indien en zolang werknemer beschikt over de vereiste toestemming van de korpschef/);

const operationalLeader = evaluate(operationalForm({ security_role_status: "leidinggevende" }));
assert.match(operationalLeader.body, /toestemming van de minister van Justitie en Veiligheid/);
assert.match(operationalLeader.body, /beide toestemmingsvereisten naast elkaar gelden/);

const sixMonths = evaluate(operationalForm({ contract_end_date: "2026-06-30" }));
assert.ok(sixMonths.issues.some(issue => issue.includes("zes maanden of korter")));
assert.match(sixMonths.body, /geen proeftijd overeen/);
assert.match(sixMonths.body, /uiterlijk één maand voor de einddatum schriftelijk/);

const shorterThanSixMonths = evaluate(operationalForm({ contract_end_date: "2026-05-31" }));
assert.match(shorterThanSixMonths.body, /geen wettelijke aanzegplicht op grond van artikel 7:668 BW/);
assert.match(shorterThanSixMonths.body, /CAO Particuliere Beveiliging niettemin uiterlijk één maand voor de einddatum schriftelijk/);

const twoYears = evaluate(operationalForm({ contract_end_date: "2027-12-31" }));
assert.deepEqual(twoYears.issues, []);
assert.match(twoYears.body, /proeftijd van één maand/);

const aspirant = evaluate(operationalForm({
  contract_end_date: "2027-12-31",
  cao_function_level: "aspirant",
  cao_scale: "2",
  hourly_rate_snapshot: "17.00",
  security_role_status: "aspirant_beveiliger",
}));
assert.deepEqual(aspirant.issues, []);
assert.match(aspirant.body, /proeftijd van twee maanden/);

const successive = evaluate(operationalForm({ probation_context: "successive_same_work" }));
assert.ok(successive.issues.some(issue => issue.includes("opvolgend contract")));
assert.match(successive.body, /geen nieuwe proeftijd overeen/);

const wrongScale = evaluate(operationalForm({ cao_scale: "4" }));
assert.ok(wrongScale.issues.some(issue => issue.includes("hoort bij salarisschaal 3")));

const wrongOfficialHourlyRate = evaluate(operationalForm({ hourly_rate_snapshot: "18.50" }));
assert.ok(wrongOfficialHourlyRate.issues.some(issue => issue.includes("€ 17,37")));

const missingLegalCompanyName = validateStandardContractTemplateContext({
  personnel,
  form: operationalForm(),
  company: {
    ...company,
    legal_name: "",
    display_name: "Alleen Handelsnaam",
  },
  template,
});
assert.ok(missingLegalCompanyName.issues.some(issue => issue.includes("juridische bedrijfsnaam")));

const incompleteWpbrEvidence = validateStandardContractTemplateContext({
  personnel: {
    ...personnel,
    wpbr_authority: "",
    wpbr_permission_number: "",
    wpbr_permission_valid_from: "",
    wpbr_permission_valid_until: "",
  },
  form: operationalForm(),
  company,
  template,
});
assert.ok(incompleteWpbrEvidence.warnings.some(warning => warning.includes("bewijsnummer of geldigheidsdatums zijn onvolledig")));

const expiredVersion = evaluate(operationalForm({
  contract_start_date: "2027-01-01",
  contract_end_date: "2027-12-31",
}));
assert.ok(expiredVersion.issues.some(issue => issue.includes("bijgewerkte CAO-versie")));

const operationalParttime = evaluateParttime(operationalForm({
  employment_contract_model: "parttime_fixed",
  contract_hours_per_week: "24",
  contract_hours_per_pay_period: "96",
}));
assert.deepEqual(operationalParttime.issues, []);
assert.deepEqual(operationalParttime.unresolved, []);
assert.match(operationalParttime.body, /vaste parttimemodel/);
assert.match(operationalParttime.body, /96 uur per loonperiode/);
assert.match(operationalParttime.body, /133,33 uur per loonperiode/);
assert.match(operationalParttime.body, /1\.667,52 bruto per loonperiode/);
assert.match(operationalParttime.body, /naar rato van de betaalde arbeidstijd/);
assert.doesNotMatch(operationalParttime.body, /9,24%/);

const conflictingParttimeHours = evaluateParttime(operationalForm({
  employment_contract_model: "parttime_fixed",
  contract_hours_per_week: "24",
  contract_hours_per_pay_period: "100",
}));
assert.ok(conflictingParttimeHours.issues.some(issue => issue.includes("spreken elkaar tegen")));

const fulltimeHoursInParttime = evaluateParttime(operationalForm({
  employment_contract_model: "parttime_fixed",
  contract_hours_per_week: "36",
  contract_hours_per_pay_period: "144",
}));
assert.ok(fulltimeHoursInParttime.issues.some(issue => issue.includes("minder dan 144")));

const officeParttimeMissingReference = evaluateParttime({
  ...baseForm,
  employment_contract_model: "parttime_fixed",
  function_type: "planner",
  allowed_function_types_text: "planner",
  cao_function_group: "non_security_staff",
  cao_function_level: "not_applicable",
  cao_scale: "",
  cao_period: "",
  performs_security_work: "false",
  contract_hours_per_week: "24",
  contract_hours_per_pay_period: "96",
});
assert.ok(officeParttimeMissingReference.issues.some(issue => issue.includes("fulltime referentienorm")));

const officeParttime = evaluateParttime({
  ...baseForm,
  employment_contract_model: "parttime_fixed",
  function_type: "planner",
  allowed_function_types_text: "planner",
  cao_function_group: "non_security_staff",
  cao_function_level: "not_applicable",
  cao_scale: "",
  cao_period: "",
  performs_security_work: "false",
  contract_hours_per_week: "24",
  contract_hours_per_pay_period: "96",
  fulltime_reference_hours_per_week: "40",
  fulltime_reference_hours_per_pay_period: "160",
});
assert.deepEqual(officeParttime.issues, []);
assert.match(officeParttime.body, /fulltime referentienorm.*160 uur/);
assert.doesNotMatch(officeParttime.body, /Werknemer werkt fulltime voor 144 uur/);

const wrongParttimeModel = evaluateParttime(operationalForm({
  employment_contract_model: "parttime_growth",
  contract_hours_per_week: "24",
  contract_hours_per_pay_period: "96",
}));
assert.ok(wrongParttimeModel.issues.some(issue => issue.includes("groei-, oproep- of min-maxmodel")));

const operationalGrowthParttime = evaluateGrowthParttime(operationalForm({
  employment_contract_model: "parttime_growth",
  contract_hours_per_week: "24",
  contract_hours_per_pay_period: "96",
}));
assert.deepEqual(operationalGrowthParttime.issues, []);
assert.deepEqual(operationalGrowthParttime.unresolved, []);
assert.match(operationalGrowthParttime.body, /parttime groeimodel/i);
assert.match(operationalGrowthParttime.body, /geen oproepkracht/);
assert.match(operationalGrowthParttime.body, /niet worden verplicht boven 144 uur/);
assert.match(operationalGrowthParttime.body, /tot en met 152 uur zijn meeruren/);
assert.match(operationalGrowthParttime.body, /boven 152 uur zijn overuren/);
assert.match(operationalGrowthParttime.body, /maximaal 24 nieuwe minuren/);
assert.match(operationalGrowthParttime.body, /dertien weken/);
assert.match(operationalGrowthParttime.body, /1\.667,52 bruto per loonperiode/);
assert.doesNotMatch(operationalGrowthParttime.body, /parttimepercentage maal 200/);
assert.doesNotMatch(operationalGrowthParttime.body, /9,24%/);

const growthParttimeAtFulltimeHours = evaluateGrowthParttime(operationalForm({
  employment_contract_model: "parttime_growth",
  contract_hours_per_week: "36",
  contract_hours_per_pay_period: "144",
}));
assert.ok(growthParttimeAtFulltimeHours.issues.some(issue => issue.includes("minder dan 144")));

const officeGrowthParttime = evaluateGrowthParttime({
  ...baseForm,
  employment_contract_model: "parttime_growth",
  function_type: "planner",
  allowed_function_types_text: "planner",
  cao_function_group: "non_security_staff",
  cao_function_level: "not_applicable",
  cao_scale: "",
  cao_period: "",
  performs_security_work: "false",
  contract_hours_per_week: "24",
  contract_hours_per_pay_period: "96",
  fulltime_reference_hours_per_week: "40",
  fulltime_reference_hours_per_pay_period: "160",
});
assert.deepEqual(officeGrowthParttime.issues, []);
assert.match(officeGrowthParttime.body, /fulltime referentienorm.*160 uur/);
assert.match(officeGrowthParttime.body, /operationele fulltime definitie/);
assert.doesNotMatch(officeGrowthParttime.body, /overwerktoeslag/);

const officeGrowthParttimeMissingReference = evaluateGrowthParttime({
  ...baseForm,
  employment_contract_model: "parttime_growth",
  function_type: "planner",
  allowed_function_types_text: "planner",
  cao_function_group: "non_security_staff",
  cao_function_level: "not_applicable",
  cao_scale: "",
  cao_period: "",
  performs_security_work: "false",
  contract_hours_per_week: "24",
  contract_hours_per_pay_period: "96",
});
assert.ok(officeGrowthParttimeMissingReference.issues.some(issue => issue.includes("fulltime referentienorm")));

const cashValueGrowthParttime = evaluateGrowthParttime(operationalForm({
  employment_contract_model: "parttime_growth",
  contract_hours_per_week: "25",
  contract_hours_per_pay_period: "100",
  function_type: "geld_waardetransporteur",
  allowed_function_types_text: "geld_waardetransporteur",
  cao_function_group: "geld_waardetransporteur",
  works_cash_value_logistics: "true",
}));
assert.deepEqual(cashValueGrowthParttime.issues, []);
assert.match(cashValueGrowthParttime.body, /180 vakantie-uren/);

const wrongGrowthParttimeModel = evaluateGrowthParttime(operationalForm({
  employment_contract_model: "parttime_fixed",
  contract_hours_per_week: "24",
  contract_hours_per_pay_period: "96",
}));
assert.ok(wrongGrowthParttimeModel.issues.some(issue => issue.includes("volgens het groeimodel")));

const minMaxForm = operationalForm({
  employment_contract_model: "min_max",
  contract_form: "oproep",
  underlying_contract_form: "bepaalde_tijd",
  contract_hours_per_week: "",
  contract_hours_per_pay_period: "",
  min_hours_per_week: "16",
  max_hours_per_week: "32",
  min_hours_per_pay_period: "64",
  max_hours_per_pay_period: "128",
  call_channel: "employee_app_and_email",
  availability_windows: [
    { weekday: "monday", start_time: "07:00", end_time: "23:00", crosses_midnight: false },
    { weekday: "friday", start_time: "18:00", end_time: "03:00", crosses_midnight: true },
  ],
});
const operationalMinMax = evaluateMinMax(minMaxForm);
assert.deepEqual(operationalMinMax.issues, []);
assert.deepEqual(operationalMinMax.unresolved, []);
assert.match(operationalMinMax.body, /garantie-omvang bedraagt 64 uur/);
assert.match(operationalMinMax.body, /maximale arbeidsomvang 128 uur/);
assert.match(operationalMinMax.body, /maandag van 07:00 tot 23:00/);
assert.match(operationalMinMax.body, /vrijdag van 18:00 tot 03:00 de volgende dag/);
assert.match(operationalMinMax.body, /medewerkersapp en e-mail/);
assert.match(operationalMinMax.body, /ten minste vier kalenderdagen/);
assert.match(operationalMinMax.body, /ten minste drie uur loon/);
assert.match(operationalMinMax.body, /periode van twaalf maanden/);
assert.match(operationalMinMax.body, /1\.111,68 bruto per loonperiode van vier weken over de garantie-uren/);
assert.match(operationalMinMax.body, /9,24%/);
assert.match(operationalMinMax.body, /8% vakantiebijslag/);
assert.match(operationalMinMax.body, /geen verschuivingstoeslag/);
assert.match(operationalMinMax.body, /toeslag van 100%/);

const pacMinMax = evaluateMinMax({
  ...minMaxForm,
  function_type: "centralist_pac",
  allowed_function_types_text: "centralist_pac",
  cao_function_group: "centralist",
});
assert.deepEqual(pacMinMax.issues, []);
assert.match(pacMinMax.body, /Centralist PAC/);

const officeMinMax = evaluateMinMax({
  ...minMaxForm,
  function_type: "planner",
  allowed_function_types_text: "planner",
  cao_function_group: "non_security_staff",
  cao_function_level: "not_applicable",
  cao_scale: "",
  cao_period: "",
  performs_security_work: "false",
});
assert.deepEqual(officeMinMax.issues, []);
assert.doesNotMatch(officeMinMax.body, /fulltime referentienorm/);

const zeroGuaranteeMinMax = evaluateMinMax({ ...minMaxForm, min_hours_per_week: "0", min_hours_per_pay_period: "0" });
assert.ok(zeroGuaranteeMinMax.issues.some(issue => issue.includes("nulurenmodel")));
const equalBandMinMax = evaluateMinMax({ ...minMaxForm, min_hours_per_week: "32", min_hours_per_pay_period: "128" });
assert.ok(equalBandMinMax.issues.some(issue => issue.includes("vaste arbeidsomvang")));
const tooHighMinMax = evaluateMinMax({ ...minMaxForm, max_hours_per_week: "40", max_hours_per_pay_period: "160" });
assert.ok(tooHighMinMax.issues.some(issue => issue.includes("niet hoger zijn dan 144")));
const conflictingMinMax = evaluateMinMax({ ...minMaxForm, min_hours_per_week: "20" });
assert.ok(conflictingMinMax.issues.some(issue => issue.includes("minimumuren per week")));
const missingAvailabilityMinMax = evaluateMinMax({ ...minMaxForm, availability_windows: [] });
assert.ok(missingAvailabilityMinMax.issues.some(issue => issue.includes("beschikbaarheidsvenster")));
const invalidOvernightMinMax = evaluateMinMax({
  ...minMaxForm,
  availability_windows: [{ weekday: "friday", start_time: "18:00", end_time: "03:00", crosses_midnight: false }],
});
assert.ok(invalidOvernightMinMax.issues.some(issue => issue.includes("volgende dag")));
const missingChannelMinMax = evaluateMinMax({ ...minMaxForm, call_channel: "" });
assert.ok(missingChannelMinMax.issues.some(issue => issue.includes("kanaal")));
const wrongMinMaxModel = evaluateMinMax({ ...minMaxForm, employment_contract_model: "call_agreement" });
assert.ok(wrongMinMaxModel.issues.some(issue => issue.includes("alleen geschikt voor een min-maxcontract")));

const zeroHoursForm = operationalForm({
  employment_contract_model: "zero_hours",
  call_agreement_type: "zero_hours",
  contract_form: "oproep",
  underlying_contract_form: "bepaalde_tijd",
  contract_hours_per_week: "",
  contract_hours_per_pay_period: "",
  min_hours_per_week: "",
  max_hours_per_week: "",
  min_hours_per_pay_period: "",
  max_hours_per_pay_period: "",
  call_channel: "employee_app_and_email",
  availability_windows: [
    { weekday: "monday", start_time: "07:00", end_time: "23:00", crosses_midnight: false },
    { weekday: "friday", start_time: "18:00", end_time: "03:00", crosses_midnight: true },
  ],
});
const operationalZeroHours = evaluateZeroHours(zeroHoursForm);
assert.deepEqual(operationalZeroHours.issues, []);
assert.deepEqual(operationalZeroHours.unresolved, []);
assert.match(operationalZeroHours.body, /zonder vaste arbeidsomvang: een nulurencontract/i);
assert.match(operationalZeroHours.body, /geen vaste contracturen, minimumuren, maximumuren of garantie-uren/i);
assert.match(operationalZeroHours.body, /maandag van 07:00 tot 23:00/);
assert.match(operationalZeroHours.body, /vrijdag van 18:00 tot 03:00 de volgende dag/);
assert.match(operationalZeroHours.body, /ten minste vier kalenderdagen/);
assert.match(operationalZeroHours.body, /ten minste drie uur loon/);
assert.match(operationalZeroHours.body, /periode van twaalf maanden/);
assert.match(operationalZeroHours.body, /vier kalenderdagen.*opzegtermijn|opzegtermijn van vier kalenderdagen/);
assert.match(operationalZeroHours.body, /geen gegarandeerd periodeloon/);
assert.match(operationalZeroHours.body, /9,24%/);
assert.match(operationalZeroHours.body, /8% vakantiebijslag/);
assert.doesNotMatch(operationalZeroHours.body, /garantie-omvang bedraagt/);
assert.doesNotMatch(operationalZeroHours.body, /bruto per loonperiode over de garantie-uren/);

const pacZeroHours = evaluateZeroHours({
  ...zeroHoursForm,
  function_type: "centralist_pac",
  allowed_function_types_text: "centralist_pac",
  cao_function_group: "centralist",
});
assert.deepEqual(pacZeroHours.issues, []);
assert.match(pacZeroHours.body, /Centralist PAC/);

const legacyZeroHours = evaluateZeroHours({
  ...zeroHoursForm,
  employment_contract_model: "call_agreement",
  call_agreement_type: "zero_hours",
});
assert.deepEqual(legacyZeroHours.issues, []);

const zeroHoursWithFixedHours = evaluateZeroHours({ ...zeroHoursForm, contract_hours_per_week: "0" });
assert.ok(zeroHoursWithFixedHours.issues.some(issue => issue.includes("geen vaste, minimum-, maximum- of garantie-uren")));
const zeroHoursWithMinHours = evaluateZeroHours({ ...zeroHoursForm, min_hours_per_pay_period: "16" });
assert.ok(zeroHoursWithMinHours.issues.some(issue => issue.includes("geen vaste, minimum-, maximum- of garantie-uren")));
const missingAvailabilityZeroHours = evaluateZeroHours({ ...zeroHoursForm, availability_windows: [] });
assert.ok(missingAvailabilityZeroHours.issues.some(issue => issue.includes("beschikbaarheidsvenster")));
const missingChannelZeroHours = evaluateZeroHours({ ...zeroHoursForm, call_channel: "" });
assert.ok(missingChannelZeroHours.issues.some(issue => issue.includes("kanaal")));
const wrongCallTypeZeroHours = evaluateZeroHours({ ...zeroHoursForm, call_agreement_type: "pre_agreement" });
assert.ok(wrongCallTypeZeroHours.issues.some(issue => issue.includes("oproeptype")));
const wrongZeroHoursModel = evaluateZeroHours({ ...zeroHoursForm, employment_contract_model: "min_max" });
assert.ok(wrongZeroHoursModel.issues.some(issue => issue.includes("alleen geschikt voor een nulurencontract")));

const article14Confirmations = {
  internship_supervision_confirmed: "true",
  internship_relevant_practical_experience_confirmed: "true",
  internship_above_strength_confirmed: "true",
  internship_not_customer_billed_confirmed: "true",
  internship_rostered_confirmed: "true",
  internship_one_to_one_guidance_confirmed: "true",
  internship_uniform_label_confirmed: "true",
  internship_agreement_with_institution_confirmed: "true",
  internship_working_times_documented: "true",
  internship_evaluation_agreement_documented: "true",
  internship_compensation_documented: "true",
};

const bolInternshipForm = operationalForm({
  contract_model: "internship_fixed",
  employment_contract_model: "internship",
  contract_form: "stage",
  duration_type: "fixed",
  duration_option: "pok_end_date",
  probation_agreed: "not_applicable",
  probation_context: "not_applicable",
  contract_hours_per_week: "",
  contract_hours_per_pay_period: "",
  cao_function_level: "not_applicable",
  cao_scale: "",
  cao_period: "",
  hourly_rate_snapshot: "",
  security_role_status: "not_applicable",
  internship_type: "bol",
  internship_institution_name: "Veiligheidsacademie Midden",
  internship_institution_address: "Schoolweg 10, 1234 AB Utrecht",
  internship_institution_representative_name: "M. Opleider",
  internship_institution_representative_function: "BPV-coordinator",
  internship_institution_email: "bpv@veiligheidsacademie.nl",
  internship_education_name: "Mbo Beveiliger niveau 2 (BOL)",
  internship_bpv_reference: "POK-2026-001",
  internship_learning_company_recognition_number: "SBB-123456",
  internship_assignment_description: "Onder begeleiding oefenen met toegangscontrole, rondes en rapportage op het leerobject.",
  internship_learning_objectives: "Veilig controleren, correct rapporteren en procedures aantoonbaar onder begeleiding toepassen.",
  internship_practice_trainer_name: "P. Praktijkopleider",
  internship_institution_supervisor_name: "M. Opleider",
  internship_hours_per_week: "32",
  internship_working_times: "Maandag tot en met donderdag van 08:00 tot 16:30",
  internship_evaluation_details: "Een voortgangsgesprek na vier weken, daarna iedere acht weken en een eindevaluatie.",
  internship_compensation_applies: "true",
  internship_compensation_amount: "350",
  internship_compensation_period: "vier_weken",
  internship_expense_arrangement: "Noodzakelijke reiskosten worden vergoed volgens de stage- en schoolafspraken.",
  internship_insurance_description: "Het stagebedrijf heeft een aansprakelijkheidsverzekering; incidenten worden direct gemeld bij de praktijkopleider en instelling.",
  internship_attachments: "Praktijkovereenkomst, stageplan, SBB-erkenning en geldige Wpbr-documenten.",
  ...article14Confirmations,
});

const validBolInternship = evaluateInternship(bolInternshipForm);
assert.deepEqual(validBolInternship.issues, []);
assert.deepEqual(validBolInternship.unresolved, []);
assert.match(validBolInternship.body, /^STAGEOVEREENKOMST/m);
assert.match(validBolInternship.body, /stagebedrijf, stagiair en instelling/i);
assert.match(validBolInternship.body, /einddatum is afgestemd op de praktijkovereenkomst \(POK\)/i);
assert.match(validBolInternship.body, /350,00 bruto per vier weken/);
assert.doesNotMatch(validBolInternship.body, /vier_weken/);
assert.doesNotMatch(validBolInternship.body, /hierna: werkgever|hierna: werknemer/i);
assert.doesNotMatch(validBolInternship.body, /salarisschaal|pensioenregeling|proeftijd van/i);

const tooLongUwvInternship = evaluateInternship({
  ...bolInternshipForm,
  internship_type: "uwv_trial_placement",
  internship_bpv_reference: "",
  internship_learning_company_recognition_number: "",
  internship_route_reference: "UWV-TOESTEMMING-2026-44",
  duration_option: "free",
  contract_start_date: "2026-01-01",
  contract_end_date: "2026-03-01",
  internship_uwv_employment_intent_confirmed: "true",
});
assert.ok(tooLongUwvInternship.issues.some(issue => issue.includes("maximaal twee maanden")));

const missingUwvEmploymentIntent = evaluateInternship({
  ...bolInternshipForm,
  internship_type: "uwv_trial_placement",
  internship_bpv_reference: "",
  internship_learning_company_recognition_number: "",
  internship_route_reference: "UWV-TOESTEMMING-2026-45",
  duration_option: "free",
  contract_start_date: "2026-01-01",
  contract_end_date: "2026-02-28",
  internship_uwv_employment_intent_confirmed: "false",
});
assert.ok(missingUwvEmploymentIntent.issues.some(issue => issue.includes("schriftelijk de intentie")));

const officeInternship = evaluateInternship({
  ...bolInternshipForm,
  function_type: "planner",
  allowed_function_types_text: "planner",
  cao_function_group: "non_security_staff",
  performs_security_work: "false",
});
assert.ok(officeInternship.issues.some(issue => issue.includes("kantoor- of managementstage")));

const bblForm = operationalForm({
  contract_model: "bbl_fixed",
  employment_contract_model: "bbl",
  contract_form: "bepaalde_tijd",
  duration_type: "fixed",
  duration_option: "pok_end_date",
  contract_hours_per_week: "32",
  contract_hours_per_pay_period: "128",
  salary_payment_frequency: "four_weeks",
  cao_function_level: "aspirant",
  cao_scale: "2",
  cao_period: "0",
  hourly_rate_snapshot: "16.63",
  security_role_status: "aspirant_beveiliger",
  bbl_institution_name: "Veiligheidsacademie Midden",
  bbl_education_name: "Mbo Beveiliger niveau 2 (BBL)",
  bbl_practice_agreement_reference: "POK-BBL-2026-007",
  bbl_learning_company_recognition_number: "SBB-123456",
  bbl_practice_trainer_name: "P. Praktijkopleider",
});

const validBbl = evaluateBbl(bblForm);
assert.deepEqual(validBbl.issues, []);
assert.deepEqual(validBbl.unresolved, []);
assert.match(validBbl.body, /Leerarbeidsovereenkomst \(BBL\)/);
assert.match(validBbl.body, /afzonderlijke praktijkovereenkomst/);
assert.match(validBbl.body, /einddatum is afgestemd op de afzonderlijke praktijkovereenkomst/);
assert.match(validBbl.body, /eerste vier weken.*50%/s);
assert.match(validBbl.body, /vanaf de vijfde week 100%/);

const invalidBblRole = evaluateBbl({ ...bblForm, security_role_status: "qualified_security_officer" });
assert.ok(invalidBblRole.issues.some(issue => issue.includes("aspirant-beveiliger")));
const unsupportedIndefiniteBblPreset = evaluateBbl({
  ...bblForm,
  contract_model: "bbl_indefinite",
  contract_form: "onbepaalde_tijd",
  duration_type: "indefinite",
  contract_end_date: "",
});
assert.ok(unsupportedIndefiniteBblPreset.issues.some(issue => issue.includes("uitsluitend ingericht") && issue.includes("bepaalde tijd")));

console.log("Contracttemplate verificatie geslaagd (stage/BOL, BBL, nuluren, min-max, groeimodel, vaste/fulltime presets en editor-/versietests).\n");
