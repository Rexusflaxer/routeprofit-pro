export const localDateKey = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const overrideForDate = (record, date) => {
  const key = localDateKey(date);
  return (record?.specific_availability_overrides || []).find(item => item.dates?.includes(key)) || null;
};

export const expandDateRange = range => {
  if (!range?.from) return [];
  const end = range.to || range.from;
  const dates = [];
  for (const cursor = new Date(range.from); cursor <= end; cursor.setDate(cursor.getDate() + 1)) dates.push(localDateKey(cursor));
  return dates;
};

export const overrideStatusLabel = status => status === "available" ? "Bereikbaar" : status === "emergency_only" ? "Alleen noodgevallen" : "Niet bereikbaar";