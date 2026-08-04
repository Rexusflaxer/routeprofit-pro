export const SECURITY_PLAN_CATEGORIES = [
  { key: "object_security", label: "Objectbeveiliging", description: "Beveiligingsinzet en werkzaamheden op het object.", durationRequired: false },
  { key: "fire_closing_round", label: "Brand & Sluitronde", description: "Brandveiligheidscontrole en het correct afsluiten van het object.", durationRequired: true, supportsScope: true },
  { key: "external_closing_round", label: "Externe sluitronde", description: "Afsluitende controleronde aan de buitenzijde van het object.", durationRequired: true },
  { key: "external_control_round", label: "Externe controleronde", description: "Periodieke controle van terrein, gevels en buitenruimtes.", durationRequired: true },
  { key: "opening_round", label: "Openingsronde", description: "Werkzaamheden en controles voor het veilig openen van het object.", durationRequired: true },
  { key: "mobile_control_round", label: "Mobiele Controleronde", description: "Controleronde uitgevoerd als onderdeel van mobiele surveillance.", durationRequired: true },
  { key: "reception", label: "Receptiedienst", description: "Receptie-, bezoekers- en toegangsgerelateerde beveiligingswerkzaamheden.", durationRequired: false },
];

export const getSecurityPlanCategory = key => SECURITY_PLAN_CATEGORIES.find(category => category.key === key);