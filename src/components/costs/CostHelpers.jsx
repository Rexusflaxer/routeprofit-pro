// Hulpfuncties voor kostensecties

export const uid = () => Math.random().toString(36).slice(2, 9);

export const PERIOD_OPTIONS = [
  { value: "per_month", label: "Per maand" },
  { value: "per_quarter", label: "Per kwartaal" },
  { value: "per_year", label: "Per jaar" },
  { value: "per_2_years", label: "Per 2 jaar" },
  { value: "per_3_years", label: "Per 3 jaar" },
  { value: "per_5_years", label: "Per 5 jaar" },
  { value: "one_time", label: "Eenmalig" },
];

export const FUNCTION_GROUPS = [
  { value: "surveillant", label: "Surveillant" },
  { value: "binnendienst", label: "Binnendienst" },
  { value: "all", label: "Alle medewerkers" },
  { value: "management", label: "Management" },
  { value: "chauffeur", label: "Chauffeur" },
];

// Omzetten naar maandbedrag
export function toMonthlyAmount(amount, period) {
  if (!amount) return 0;
  switch (period) {
    case "per_month": return amount;
    case "per_quarter": return amount / 3;
    case "per_year": return amount / 12;
    case "per_2_years": return amount / 24;
    case "per_3_years": return amount / 36;
    case "per_5_years": return amount / 60;
    case "one_time": return amount / 60; // Spreid 5 jaar
    default: return amount;
  }
}

export function periodLabel(period) {
  return PERIOD_OPTIONS.find(p => p.value === period)?.label || "Per maand";
}