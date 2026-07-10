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
  durationOptionsForContractTemplate,
  groupContractTemplateVersions,
  nextContractTemplateVersion,
  paginateContractTemplateBlocks,
} from "../src/lib/contractTemplateEditor.js";

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
assert.equal((editorBlocks.find(block => block.title === "Indiensttreding en duur")?.content_html.match(/<p>/g) || []).length, 3);
const roundTripBody = contractTemplateBodyFromBlocks(editorBlocks);
assert.deepEqual(getUnknownContractTemplatePlaceholders(roundTripBody), []);
assert.deepEqual(getMissingStandardTemplatePlaceholders(roundTripBody), []);
const firstArticleIndex = editorBlocks.findIndex(block => block.kind === "article");
const reorderedBlocks = [...editorBlocks];
[reorderedBlocks[firstArticleIndex], reorderedBlocks[firstArticleIndex + 1]] = [reorderedBlocks[firstArticleIndex + 1], reorderedBlocks[firstArticleIndex]];
const reorderedBody = contractTemplateBodyFromBlocks(reorderedBlocks);
assert.match(reorderedBody, /Artikel 1 - Toepasselijke cao\n\n1\.1/);
const previewPages = paginateContractTemplateBlocks(editorBlocks);
assert.ok(previewPages.length > 1);
assert.equal(new Set(previewPages.flat().map(item => item.id)).size, previewPages.flat().length);

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
  { ...templateFamily, id: "v2", version: 2 },
];
assert.equal(groupContractTemplateVersions(familyVersions).length, 1);
assert.equal(groupContractTemplateVersions(familyVersions)[0].versions[0].id, "v2");
assert.equal(nextContractTemplateVersion(familyVersions, familyKey), 3);

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
