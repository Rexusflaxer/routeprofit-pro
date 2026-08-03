export const NAVIGATION_RESULTS = [
  ["Dashboard", "/"], ["Planning", "/Planning"], ["Personeel", "/Personnel"], ["LOQ Teamhub", "/Teamhub"],
  ["Klanten", "/Customers"], ["Offertes & contracten", "/Commercial"], ["Facturatie", "/Billing"], ["Objecten", "/Objects"],
  ["Collectieven", "/Collectief"], ["Routes", "/Routes"], ["Uitvoering", "/Uitvoering"], ["Diensten", "/RouteExecutions"],
  ["Rapportages", "/ReportTemplates"], ["Voertuigen", "/Vehicles"], ["Kosten", "/CostSettings"], ["Instellingen", "/Settings"],
].map(([title, href]) => ({ category: "Navigatie", title, subtitle: "Ga naar onderdeel", href }));

const objectHref = (record, tab = "warning-addresses") => `/Objects?id=${encodeURIComponent(record.object_id || record.id)}&tab=${tab}`;
export const SEARCH_SOURCES = [
  { entity: "Customer", category: "Klanten", title: r => r.trade_name || r.name || r.legal_name, subtitle: r => r.customer_number || r.city, href: r => `/CustomerDetail?id=${r.id}` },
  { entity: "SurveillanceObject", category: "Objecten", title: r => r.name, subtitle: r => r.object_code || r.address, href: r => objectHref(r) },
  { entity: "Personnel", category: "Personeel", title: r => r.name, subtitle: r => r.personnel_number || r.function_type, href: r => `/PersonnelDetail?id=${r.id}` },
  { entity: "Company", category: "Bedrijven", title: r => r.trade_name || r.name || r.legal_name, subtitle: r => r.kvk_number || r.city, href: r => `/CompanyDetail?id=${r.id}` },
  { entity: "Route", category: "Routes", title: r => r.name, subtitle: r => r.status, href: r => `/Routes?id=${r.id}` },
  { entity: "Vehicle", category: "Voertuigen", title: r => r.name || r.license_plate, subtitle: r => r.license_plate || [r.brand, r.model].filter(Boolean).join(" "), href: () => "/Vehicles" },
  { entity: "Collectief", category: "Collectieven", title: r => r.name, subtitle: r => r.description, href: () => "/Collectief" },
  { entity: "Task", category: "Taken", title: r => r.task_type, subtitle: r => r.time_window_start && `${r.time_window_start} – ${r.time_window_end || ""}`, href: r => objectHref(r) },
  { entity: "PlanningShift", category: "Planning", title: r => r.service_name_snapshot || "Dienst", subtitle: r => [r.service_date, r.start_time].filter(Boolean).join(" · "), href: () => "/Planning" },
  { entity: "RouteExecution", category: "Uitvoering", title: r => r.route_name, subtitle: r => r.service_date || r.status, href: r => `/RouteExecutionDetails?id=${r.id}` },
  { entity: "ReportTemplate", category: "Rapportages", title: r => r.name || r.title, subtitle: r => r.report_type || r.status, href: () => "/ReportTemplates" },
  { entity: "CustomerContract", category: "Contracten", title: r => r.title || r.contract_number, subtitle: r => r.contract_number || r.status, href: () => "/Commercial" },
  { entity: "CustomerQuote", category: "Offertes", title: r => r.title || r.quote_number, subtitle: r => r.quote_number || r.status, href: () => "/Commercial" },
  { entity: "SalesInvoice", category: "Facturen", title: r => r.invoice_number || "Factuur", subtitle: r => r.status, href: () => "/Billing" },
  { entity: "ObjectInstallation", category: "Installaties", title: r => r.name, subtitle: r => r.custom_type || r.installation_type, href: r => objectHref(r, "installations") },
  { entity: "ObjectKeySet", category: "Sleutels", title: r => r.display_label || r.key_number, subtitle: r => r.key_number, href: r => objectHref(r, "keys") },
  { entity: "ManagedFile", category: "Documenten", title: r => r.display_name || r.display_filename || r.original_filename, subtitle: r => r.document_label || r.category, href: r => r.object_id ? objectHref(r, "documents") : "/Companies" },
];