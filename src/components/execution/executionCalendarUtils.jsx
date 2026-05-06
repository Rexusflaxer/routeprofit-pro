const WEEKDAY_NAMES = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];
const MONTH_NAMES = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getRouteWeekday(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function getMonthLabel(date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function getDayLabel(date) {
  return WEEKDAY_NAMES[date.getDay()];
}

export function buildMonthDays(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const days = [];

  for (let date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
    days.push(new Date(date));
  }

  return days;
}

export function getRoutesForDate(routes, date) {
  const weekday = getRouteWeekday(date);
  return routes.filter(route => route.weekdays?.includes(weekday));
}