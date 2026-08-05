export const SECURITY_PLAN_TASK_TYPES = [
  { key: "object_security", label: "Objectbeveiliging", description: "Vaste beveiligingspost, toezicht en objectgebonden werkzaamheden." },
  { key: "reception", label: "Receptie", description: "Bezoekers, leveranciers, toegang en receptiewerkzaamheden." },
  { key: "fire_closing_round", label: "Brand- & sluitronde", description: "Brandveilig controleren, afsluiten en waar nodig inschakelen." },
  { key: "external_closing_round", label: "Externe sluitronde", description: "Afsluiten en controleren van terrein en buitenzijde." },
  { key: "external_control_round", label: "Externe controleronde", description: "Periodieke controle van terrein, gevels en buitenruimtes." },
  { key: "opening_round", label: "Openingsronde", description: "Veilig openen, uitschakelen en gereedmaken van het object." },
  { key: "mobile_control_round", label: "Mobiele controleronde", description: "Een objectronde als onderdeel van mobiele surveillance." },
  { key: "closing_assistance", label: "Sluitbegeleiding", description: "Begeleiden van personeel en veilig afsluiten van een locatie." },
  { key: "access_control", label: "Toegangscontrole", description: "Controleren en registreren van personen, voertuigen en goederen." },
  { key: "fire_watch", label: "Brandwacht", description: "Brandveilig toezicht, preventie en opvolging op locatie." },
  { key: "concierge", label: "Portier & hospitality", description: "Toegang, ontvangst en servicegerichte beveiligingswerkzaamheden." },
  { key: "other", label: "Anders", description: "Leg een eigen type beveiligingstaak vast." },
];

const CONTINUOUS_SECURITY_PLAN_TASK_TYPES = new Set([
  "object_security",
  "reception",
  "access_control",
  "fire_watch",
  "closing_assistance",
  "concierge",
]);

export function securityPlanExecutionModeForTaskType(taskType) {
  return CONTINUOUS_SECURITY_PLAN_TASK_TYPES.has(taskType) ? "continuous_post" : "round";
}

// Tijdelijke export voor oude imports buiten Beveiligingsplan V2.
export const SECURITY_PLAN_CATEGORIES = SECURITY_PLAN_TASK_TYPES.map(type => ({
  ...type,
  durationRequired: [
    "fire_closing_round",
    "external_closing_round",
    "external_control_round",
    "opening_round",
    "mobile_control_round",
  ].includes(type.key),
  supportsScope: type.key === "fire_closing_round",
}));

export const SECURITY_PLAN_EXECUTION_MODES = [
  { key: "round", label: "Ronde", description: "Een afgebakende route of controle met een verwachte uitvoeringsduur." },
  { key: "continuous_post", label: "Doorlopende post", description: "De werktijd volgt later uit het taakrooster, bijvoorbeeld receptie." },
  { key: "on_request", label: "Op aanvraag", description: "Wordt alleen ingezet wanneer de situatie daarom vraagt." },
  { key: "other", label: "Andere uitvoeringsvorm", description: "Voor een werkwijze die niet binnen de standaardvormen past." },
];

export const SECURITY_PLAN_DURATION_MODES = [
  { key: "fixed", label: "Vaste geplande duur", description: "Gebruik een vaste verwachtte tijd voor deze planvariant." },
  { key: "schedule_defined", label: "Door rooster bepaald", description: "Begin- en eindtijd worden later in Taken vastgelegd." },
  { key: "none", label: "Geen vaste duur", description: "De uitvoering heeft vooraf geen geplande tijdsduur." },
];

export const SECURITY_PLAN_SECTION_POLICIES = [
  { key: "not_applicable", label: "Geen sectiekeuze", description: "Deze taakvariant is niet aan objectsecties gekoppeld." },
  { key: "fixed", label: "Vaste secties", description: "Alle geselecteerde secties horen altijd bij deze variant." },
  { key: "default_with_controlled_override", label: "Standaard met toegestane afwijking", description: "Een standaardset mag later alleen binnen de toegestane secties worden aangepast." },
];

export const SECURITY_PLAN_ACTION_TYPES = [
  { key: "instruction", label: "Instructie" },
  { key: "inspect", label: "Controleren" },
  { key: "open", label: "Openen" },
  { key: "close", label: "Sluiten" },
  { key: "arm", label: "Alarm inschakelen" },
  { key: "disarm", label: "Alarm uitschakelen" },
  { key: "register", label: "Registreren" },
  { key: "handover", label: "Overdracht" },
  { key: "checkpoint", label: "Controlepunt vastleggen" },
  { key: "other", label: "Andere handeling" },
];

export const SECURITY_PLAN_MARKER_TYPES = [
  { key: "checkpoint", label: "Controlepunt" },
  { key: "instruction", label: "Instructiepunt" },
  { key: "start", label: "Startpunt" },
  { key: "end", label: "Eindpunt" },
  { key: "other", label: "Ander punt" },
];

export const SECURITY_PLAN_STATUS = {
  draft: { label: "Concept", className: "border-amber-300/70 bg-amber-500/10 text-amber-800 dark:text-amber-200" },
  published: { label: "Gepubliceerd", className: "border-emerald-300/70 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" },
  superseded: { label: "Vervangen", className: "border-slate-300/70 bg-slate-500/10 text-slate-700 dark:text-slate-200" },
  archived: { label: "Gearchiveerd", className: "border-border bg-muted/50 text-muted-foreground" },
};

export function getSecurityPlanTaskType(key) {
  return SECURITY_PLAN_TASK_TYPES.find(type => type.key === key) || null;
}

export function getSecurityPlanCategory(key) {
  return getSecurityPlanTaskType(key);
}

export function securityPlanTaskTypeLabel(planOrKey, customTaskType = "") {
  const key = typeof planOrKey === "string" ? planOrKey : planOrKey?.task_type || planOrKey?.category;
  const custom = typeof planOrKey === "object" ? planOrKey?.custom_task_type : customTaskType;
  if (key === "other") return String(custom || "Anders").trim() || "Anders";
  return getSecurityPlanTaskType(key)?.label || String(custom || key || "Onbekend type");
}

export function securityPlanExecutionModeLabel(value) {
  return SECURITY_PLAN_EXECUTION_MODES.find(mode => mode.key === value)?.label || "Niet ingesteld";
}

export function securityPlanDurationLabel(plan, revision = null) {
  const source = revision || plan?.draft_revision || plan?.current_revision || plan?.published_revision || plan || {};
  if (source.duration_mode === "fixed") {
    const minutes = Number(source.duration_minutes || 0);
    return minutes > 0 ? `${minutes} min.` : "Duur ontbreekt";
  }
  if (source.duration_mode === "schedule_defined") return "Door rooster bepaald";
  if (source.duration_mode === "none") return "Geen vaste duur";
  return "Nog niet ingesteld";
}

export function securityPlanStatus(value) {
  return SECURITY_PLAN_STATUS[value] || { label: value || "Onbekend", className: "border-border bg-muted/50 text-muted-foreground" };
}

export function createSecurityPlanClientId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyInstructionBlock(sequence = 1) {
  return {
    id: createSecurityPlanClientId("block"),
    sequence,
    title: sequence === 1 ? "Uitvoering" : `Hoofdstuk ${sequence}`,
    description: "",
    steps: [],
  };
}

export function normalizeInstructionBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((block, blockIndex) => ({
    id: block?.id || createSecurityPlanClientId("block"),
    sequence: blockIndex + 1,
    title: String(block?.title || `Hoofdstuk ${blockIndex + 1}`),
    description: String(block?.description || ""),
    steps: (Array.isArray(block?.steps) ? block.steps : []).map((step, stepIndex) => ({
      id: step?.id || createSecurityPlanClientId("step"),
      sequence: stepIndex + 1,
      title: String(step?.title || `Stap ${stepIndex + 1}`),
      instruction: String(step?.instruction || ""),
      action_type: step?.action_type || "instruction",
      section_id: step?.section_id || null,
      installation_id: step?.installation_id || null,
      floorplan_marker_id: step?.floorplan_marker_id || null,
      required: step?.required !== false,
    })),
  }));
}

export function normalizeRouteOverlay(value) {
  const route = value && typeof value === "object" ? value : {};
  const path = (Array.isArray(route.path) ? route.path : [])
    .map((point, index) => ({
      x: Math.max(0, Math.min(1, Number(point?.x || 0))),
      y: Math.max(0, Math.min(1, Number(point?.y || 0))),
      sequence: index + 1,
    }));
  const markers = (Array.isArray(route.markers) ? route.markers : [])
    .map((marker, index) => ({
      id: marker?.id || createSecurityPlanClientId("marker"),
      x: Math.max(0, Math.min(1, Number(marker?.x || 0))),
      y: Math.max(0, Math.min(1, Number(marker?.y || 0))),
      sequence: index + 1,
      step_id: marker?.step_id || null,
      section_id: marker?.section_id || null,
      label: String(marker?.label || `Punt ${index + 1}`),
      marker_type: marker?.marker_type || "checkpoint",
    }));
  return {
    schema_version: "loq-route-v1",
    coordinate_space: "normalized",
    start_point: path[0] ? { x: path[0].x, y: path[0].y, label: route.start_point?.label || null } : null,
    end_point: path.length ? { x: path.at(-1).x, y: path.at(-1).y, label: route.end_point?.label || null } : null,
    path,
    markers,
  };
}

export function buildSecurityPlanReadiness({ plan, revision, sections = [], floorplans = [] }) {
  const blocking = [];
  const warnings = [];
  if (!String(plan?.variant_name || "").trim()) blocking.push("Geef de planvariant een herkenbare naam.");
  if (!plan?.task_type) blocking.push("Kies een taaktype.");
  if (plan?.task_type === "other" && !String(plan?.custom_task_type || "").trim()) blocking.push("Vul het eigen taaktype in.");
  if (!plan?.execution_mode) blocking.push("Kies een uitvoeringsvorm.");
  if (revision?.duration_mode === "fixed" && Number(revision?.duration_minutes || 0) <= 0) blocking.push("Vul een geldige geplande duur in.");
  const blocks = normalizeInstructionBlocks(revision?.instruction_blocks);
  if (!blocks.some(block => block.steps.some(step => step.title.trim() && step.instruction.trim()))) blocking.push("Voeg minimaal één concrete instructiestap toe.");
  const sectionIds = new Set(sections.map(section => section.id));
  const selectedSectionIds = [...(revision?.default_section_ids || []), ...(revision?.allowed_section_ids || [])];
  if (selectedSectionIds.some(id => !sectionIds.has(id))) blocking.push("Een geselecteerde objectsectie is niet meer beschikbaar.");
  if (revision?.section_policy === "default_with_controlled_override") {
    const allowed = new Set(revision?.allowed_section_ids || []);
    if ((revision?.default_section_ids || []).some(id => !allowed.has(id))) {
      blocking.push("Iedere standaardsectie moet ook als toegestane sectie zijn geselecteerd.");
    }
  }
  if (revision?.section_policy !== "not_applicable" && !(revision?.default_section_ids || []).length) blocking.push("Selecteer minimaal één standaardsectie voor deze variant.");
  if (revision?.section_policy === "default_with_controlled_override" && !(revision?.allowed_section_ids || []).length) blocking.push("Selecteer minimaal één toegestane sectie voor afwijkingen.");
  if (!floorplans.length) warnings.push("Voor dit object is nog geen plattegrond beschikbaar.");
  else if (!revision?.floorplan_id) warnings.push("Koppel een plattegrond om een route vast te leggen.");
  if (!normalizeRouteOverlay(revision?.route_overlay).path.length) warnings.push("Er is nog geen voorgestelde looproute ingetekend.");
  return { blocking, warnings, publishable: blocking.length === 0 };
}