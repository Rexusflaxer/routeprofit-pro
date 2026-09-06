export function safeCoordinateNumber(value, minimum, maximum) {
  if (!["number", "string"].includes(typeof value)) return null;
  if (typeof value === "string" && !value.trim()) return null;

  const coordinate = Number(value);
  return Number.isFinite(coordinate)
    && coordinate >= minimum
    && coordinate <= maximum
    ? coordinate
    : null;
}

export function objectCoordinatePair(object) {
  const latitude = safeCoordinateNumber(object?.latitude, -90, 90);
  const longitude = safeCoordinateNumber(object?.longitude, -180, 180);
  return latitude === null || longitude === null || (latitude === 0 && longitude === 0)
    ? null
    : [longitude, latitude];
}

export function trustedObjectCoordinatePair(object) {
  return ["verified", "manual"].includes(String(object?.geocoding_status || ""))
    ? objectCoordinatePair(object)
    : null;
}
