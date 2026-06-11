function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePostalCode(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function getCompanyLocationLabel(location) {
  const address = [
    location?.street_name,
    location?.house_number,
    location?.city,
  ].filter(Boolean).join(" ");

  if (location?.name && address) return `${location.name} - ${address}`;
  return location?.name || address || "Vestiging";
}

export function getCompanyLocationAddressLabel(location) {
  return [
    location?.street_name,
    location?.house_number,
    location?.postal_code,
    location?.city,
  ].filter(Boolean).join(" ") || getCompanyLocationLabel(location);
}

export function hasCompanyLocationAssignment(assignments = [], companyId, locationId) {
  return Boolean(companyId && locationId && (assignments || []).some(assignment =>
    assignment.company_id === companyId && assignment.location_id === locationId
  ));
}

function isLegacyCompanyAddressLocation(location, company) {
  if (!location || !company) return false;

  const locationStreet = normalizeText(location.street_name);
  const companyStreet = normalizeText(company.street_name);
  const locationHouseNumber = normalizeText(location.house_number);
  const companyHouseNumber = normalizeText(company.house_number);
  const locationPostalCode = normalizePostalCode(location.postal_code);
  const companyPostalCode = normalizePostalCode(company.postal_code);
  const locationCity = normalizeText(location.city);
  const companyCity = normalizeText(company.city);

  if (!locationStreet || !companyStreet || locationStreet !== companyStreet) return false;
  if (!locationHouseNumber || !companyHouseNumber || locationHouseNumber !== companyHouseNumber) return false;
  if (locationPostalCode && companyPostalCode && locationPostalCode !== companyPostalCode) return false;
  if (locationCity && companyCity && locationCity !== companyCity) return false;

  return true;
}

export function getCompanyProfileLocations({ companyId, company, locations = [], assignments = [] }) {
  const activeLocations = (locations || []).filter(location => location.is_active !== false);
  if (!companyId) return activeLocations;

  const assignedToCompanyLocationIds = new Set(
    (assignments || [])
      .filter(assignment => assignment.company_id === companyId)
      .map(assignment => assignment.location_id)
      .filter(Boolean)
  );
  const assignedLocationIds = new Set(
    (assignments || [])
      .map(assignment => assignment.location_id)
      .filter(Boolean)
  );

  return activeLocations.filter(location =>
    assignedToCompanyLocationIds.has(location.id) ||
    (!assignedLocationIds.has(location.id) && isLegacyCompanyAddressLocation(location, company))
  );
}
