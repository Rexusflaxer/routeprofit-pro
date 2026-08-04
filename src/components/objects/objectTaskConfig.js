export const OBJECT_TASK_TYPES = [
  { value: "object_security", label: "Objectbeveiliging", mode: "continuous", description: "Aaneengesloten aanwezigheid op het object." },
  { value: "fire_closing_round", label: "Brand- & sluitronde", mode: "time_window", description: "Ronde binnen een toegestaan tijdvenster." },
  { value: "external_closing_round", label: "Externe sluitronde", mode: "time_window", description: "Controle en afsluiting van de buitenzijde." },
  { value: "external_control_round", label: "Externe controleronde", mode: "time_window", description: "Controle van terrein en buitenzijde." },
  { value: "opening_round", label: "Openingsronde", mode: "time_window", description: "Openen en controleren vóór ingebruikname." },
  { value: "mobile_control_round", label: "Mobiele controleronde", mode: "time_window", description: "Mobiele ronde binnen een tijdvenster." },
  { value: "reception", label: "Receptiedienst", mode: "continuous", description: "Aaneengesloten receptiebezetting." },
  { value: "closing_assistance", label: "Sluitbegeleiding", mode: "time_window", description: "Begeleiding bij het afsluiten van de locatie." },
  { value: "access_control", label: "Toegangscontrole", mode: "continuous", description: "Aaneengesloten controle van bezoekers en toegang." },
  { value: "fire_watch", label: "Brandwacht", mode: "continuous", description: "Aaneengesloten brandveiligheidstoezicht." },
  { value: "concierge", label: "Portier / concierge", mode: "continuous", description: "Aaneengesloten ontvangst- en toezichtstaak." },
  { value: "other", label: "Andere taak", mode: null, description: "Leg zelf de taak en uitvoeringswijze vast." },
];
export const WEEKDAYS = [{ value: 1, label: "Ma" }, { value: 2, label: "Di" }, { value: 3, label: "Wo" }, { value: 4, label: "Do" }, { value: 5, label: "Vr" }, { value: 6, label: "Za" }, { value: 7, label: "Zo" }];
export const taskTypeLabel = task => task?.custom_task_type || OBJECT_TASK_TYPES.find(item => item.value === task?.task_type)?.label || "Taak";
export const taskDuration = (start, end) => { const [sh, sm] = start.split(":").map(Number), [eh, em] = end.split(":").map(Number); let value = eh * 60 + em - (sh * 60 + sm); if (value <= 0) value += 1440; return value; };
export const recurrenceLabel = task => task.recurrence_type === "one_time" ? task.specific_date : task.recurrence_type === "date_range" ? `${task.valid_from} t/m ${task.valid_until}` : "Doorlopend";