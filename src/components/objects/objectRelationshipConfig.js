export const OBJECT_RELATIONSHIP_TYPES = [
  { value: "pac", label: "Particuliere Alarmcentrale", description: "Erkende PAC voor alarmontvangst en opvolging." },
  { value: "video_monitoring_center", label: "Videocentrale", description: "Externe centrale voor live view en videoverificatie." },
  { value: "security_installer", label: "Beveiligingsinstallateur", description: "Installateur van inbraak- en beveiligingssystemen." },
  { value: "fire_safety_installer", label: "Brandbeveiligingsinstallateur", description: "Installateur of beheerder van brandmeldsystemen." },
  { value: "camera_installer", label: "Camera-installateur", description: "Installateur of beheerder van camerasystemen." },
  { value: "access_control_installer", label: "Toegangscontrole-installateur", description: "Installateur of beheerder van toegangscontrole." },
  { value: "maintenance_provider", label: "Onderhoudspartij", description: "Externe partij voor technisch onderhoud en storingen." },
  { value: "key_management", label: "Sleutelbeheerorganisatie", description: "Externe organisatie voor sleutelbeheer of uitgifte." },
  { value: "guarding_company", label: "Beveiligingsorganisatie", description: "Andere particuliere beveiligingsorganisatie rond dit object." },
  { value: "other", label: "Andere derde instantie", description: "Een andere externe organisatie, geen algemene hulpdienst." },
];

export const relationshipTypeLabel = relation => relation?.custom_relation_label
  || OBJECT_RELATIONSHIP_TYPES.find(item => item.value === relation?.relation_type)?.label
  || "Derde instantie";