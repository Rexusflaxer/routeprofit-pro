const DUTCH_POSTAL_CODE_PATTERN = /\b([1-9]\d{3}\s?[A-Z]{2})\b/i;

function compact(value) {
  if (value === false || value === null || value === undefined) return "";
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function firstValue(...values) {
  return values.map(compact).find(Boolean) || "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCountry(value) {
  const country = compact(value);
  if (/^(nl|nld|the netherlands|netherlands)$/i.test(country)) return "Nederland";
  return country;
}

export function normalizePostalCode(value) {
  const source = compact(value).toUpperCase();
  const match = source.match(DUTCH_POSTAL_CODE_PATTERN);
  return match ? match[1].replace(/\s+/g, "") : source;
}

function stripPostalCodeFromCity(value, postalCode) {
  let city = compact(value);
  const normalizedPostalCode = normalizePostalCode(postalCode);
  if (!city) return "";

  const postalPattern = normalizedPostalCode
    ? escapeRegExp(normalizedPostalCode).replace(/(\d{4})([A-Z]{2})/, "$1\\s*$2")
    : "[1-9]\\d{3}\\s*[A-Z]{2}";
  const leadingPostalCode = new RegExp(`^(?:${postalPattern})[\\s,;-]*`, "i");

  while (leadingPostalCode.test(city)) {
    city = city.replace(leadingPostalCode, "").trim();
  }
  return city;
}

function splitStreetLine(value) {
  const streetLine = compact(value).replace(/[;,]+$/, "").trim();
  if (!streetLine) return { street_name: "", house_number: "", house_number_addition: "" };

  const match = streetLine.match(/^(.*\S)\s+(\d+)(?:\s*[-/]?\s*([A-Za-z][A-Za-z0-9-]*|\d+))?$/);
  if (!match) return { street_name: streetLine, house_number: "", house_number_addition: "" };

  return {
    street_name: compact(match[1]),
    house_number: compact(match[2]),
    house_number_addition: compact(match[3]),
  };
}

export function parseAddressLabel(value) {
  const label = compact(value);
  if (!label) {
    return {
      street_name: "",
      house_number: "",
      house_number_addition: "",
      postal_code: "",
      city: "",
      country: "",
    };
  }

  const postalMatch = DUTCH_POSTAL_CODE_PATTERN.exec(label);
  const beforePostalCode = postalMatch
    ? label.slice(0, postalMatch.index).replace(/[\s,;-]+$/, "")
    : label;
  const afterPostalCode = postalMatch
    ? label.slice(postalMatch.index + postalMatch[0].length).replace(/^[\s,;-]+/, "")
    : "";
  const beforeParts = beforePostalCode.split(",").map(compact).filter(Boolean);
  const afterParts = afterPostalCode.split(",").map(compact).filter(Boolean);
  const street = splitStreetLine(beforeParts[0] || beforePostalCode);

  return {
    ...street,
    postal_code: normalizePostalCode(postalMatch?.[1]),
    city: firstValue(afterParts[0], !postalMatch && beforeParts[1]),
    country: normalizeCountry(firstValue(afterParts[1], !postalMatch && beforeParts[2])),
  };
}

function stripKnownHouseNumber(value, houseNumber, addition) {
  const street = compact(value);
  const number = compact(houseNumber);
  if (!street || !number) return street;

  const suffix = compact([number, addition].filter(Boolean).join(" "));
  const compactSuffix = compact(`${number}${compact(addition)}`);
  for (const candidate of [suffix, compactSuffix]) {
    if (!candidate) continue;
    const pattern = new RegExp(`[\\s,]+${escapeRegExp(candidate)}$`, "i");
    if (pattern.test(street)) return street.replace(pattern, "").trim();
  }
  return street;
}

export function normalizeAddressParts(value = {}) {
  const rawStreet = firstValue(value.street_name, value.streetName, value.street);
  const fullAddress = firstValue(value.full_address, value.fullAddress, value.address, value.label);
  const rawHouseNumber = firstValue(value.house_number, value.houseNumber);
  const rawAddition = firstValue(value.house_number_addition, value.houseNumberAddition);
  const rawPostalCode = firstValue(value.postal_code, value.postalCode, value.postcode);
  const rawCity = firstValue(value.city, value.municipality, value.place);
  const rawCountry = firstValue(value.country);
  const compositeStreet = DUTCH_POSTAL_CODE_PATTERN.test(rawStreet) || rawStreet.includes(",");
  const parsed = parseAddressLabel(fullAddress || (compositeStreet ? rawStreet : ""));

  const houseNumber = firstValue(rawHouseNumber, parsed.house_number);
  const addition = firstValue(rawAddition, parsed.house_number_addition);
  const postalCode = normalizePostalCode(firstValue(rawPostalCode, parsed.postal_code));
  const country = normalizeCountry(firstValue(rawCountry, parsed.country, "Nederland"));
  const city = stripPostalCodeFromCity(firstValue(rawCity, parsed.city), postalCode)
    .replace(new RegExp(`(?:[\\s,]+${escapeRegExp(country)})$`, "i"), "")
    .trim();
  const streetSource = compositeStreet && parsed.street_name
    ? parsed.street_name
    : firstValue(rawStreet, parsed.street_name);
  const streetName = stripKnownHouseNumber(streetSource, houseNumber, addition);

  return {
    street_name: streetName,
    house_number: houseNumber,
    house_number_addition: addition,
    postal_code: postalCode,
    city,
    country,
  };
}

export function addressPartsFromSuggestion(suggestion = {}, fallback = {}) {
  const label = firstValue(suggestion.label, suggestion.address, suggestion.full_address, suggestion.fullAddress);
  const parsed = parseAddressLabel(label);

  return normalizeAddressParts({
    ...fallback,
    street_name: firstValue(suggestion.street_name, suggestion.streetName, suggestion.street, parsed.street_name),
    house_number: firstValue(suggestion.house_number, suggestion.houseNumber, parsed.house_number),
    house_number_addition: firstValue(
      suggestion.house_number_addition,
      suggestion.houseNumberAddition,
      parsed.house_number_addition,
    ),
    postal_code: firstValue(suggestion.postal_code, suggestion.postalCode, suggestion.postcode, parsed.postal_code),
    city: firstValue(suggestion.city, suggestion.municipality, suggestion.place, parsed.city),
    country: firstValue(suggestion.country, parsed.country, fallback.country, "Nederland"),
    full_address: label,
  });
}

export function formatAddress(value = {}, { omitDefaultCountry = false } = {}) {
  const address = normalizeAddressParts(value);
  const houseNumber = compact([address.house_number, address.house_number_addition].filter(Boolean).join(" "));
  const streetLine = compact([address.street_name, houseNumber].filter(Boolean).join(" "));
  const cityLine = compact([address.postal_code, address.city].filter(Boolean).join(" "));
  const country = omitDefaultCountry && address.country === "Nederland" ? "" : address.country;
  return [streetLine, cityLine, country].filter(Boolean).join(", ");
}

export function addressSuggestionLabel(suggestion = {}) {
  return firstValue(
    suggestion.label,
    suggestion.address,
    suggestion.full_address,
    suggestion.fullAddress,
    formatAddress(addressPartsFromSuggestion(suggestion), { omitDefaultCountry: true }),
  );
}
