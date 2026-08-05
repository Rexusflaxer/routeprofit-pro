const AJAX_BRAND_VALUES = new Set(["ajax", "ajax systems"]);

export const AJAX_MANUAL_VERSION = "2026.08.1";
export const AJAX_MANUAL_REVIEWED_ON = "2026-08-04";

const AJAX_MANUAL_FAMILIES = {
  numeric: { manualKey: "ajax:numeric-keypad:nl", title: "Ajax numeriek bedienpaneel" },
  "numeric-reader": { manualKey: "ajax:numeric-reader-keypad:nl", title: "Ajax numeriek bedienpaneel met lezer" },
  touchscreen: { manualKey: "ajax:touchscreen-keypad:nl", title: "Ajax touchscreen-bedienpaneel" },
  outdoor: { manualKey: "ajax:outdoor-keypad:nl", title: "Ajax outdoor-bedienpaneel" },
  app: { manualKey: "ajax:app-control:nl", title: "Ajax-appbediening zonder vast paneel" },
};

const ajaxControlDevice = ({ value, label, description, family, sourceUrl, protocol, availability = "Actueel" }) => ({
  value,
  label,
  description,
  family,
  sourceUrl,
  protocol,
  availability,
  manualKey: AJAX_MANUAL_FAMILIES[family].manualKey,
  manualVersion: AJAX_MANUAL_VERSION,
});

/**
 * Bedienpanelen zijn geen vrije tekst: deze sleutel bepaalt welke gecontroleerde,
 * versievaste LOQ-handleiding aan de installatie wordt gekoppeld.
 */
export const AJAX_CONTROL_DEVICE_OPTIONS = [
  ajaxControlDevice({
    value: "keypad-jeweller",
    label: "KeyPad Jeweller",
    description: "Numeriek draadloos bedienpaneel met in-, uit- en nachttoets.",
    family: "numeric",
    protocol: "Jeweller",
    availability: "Geïnstalleerde basis",
    sourceUrl: "https://support.ajax.systems/en/manuals/keypad/",
  }),
  ajaxControlDevice({
    value: "keypad-plus-jeweller",
    label: "KeyPad Plus Jeweller",
    description: "Numeriek draadloos paneel met Tag- en Pass-lezer.",
    family: "numeric-reader",
    protocol: "Jeweller",
    sourceUrl: "https://support.ajax.systems/en/manuals/keypad-plus/",
  }),
  ajaxControlDevice({
    value: "keypad-touchscreen-jeweller",
    label: "KeyPad TouchScreen Jeweller",
    description: "Draadloos touchscreen met groepen, codes, Tag, Pass en smartphone.",
    family: "touchscreen",
    protocol: "Jeweller / Wings",
    sourceUrl: "https://support.ajax.systems/en/manuals/keypad-touchscreen/",
  }),
  ajaxControlDevice({
    value: "superior-keypad-fibra",
    label: "Superior KeyPad Fibra",
    description: "Bedraad numeriek Superior-paneel voor bediening met codes.",
    family: "numeric",
    protocol: "Fibra",
    sourceUrl: "https://support.ajax.systems/en/manuals/superior-keypad-fibra/",
  }),
  ajaxControlDevice({
    value: "superior-keypad-plus-jeweller",
    label: "Superior KeyPad Plus Jeweller",
    description: "Draadloos Superior-paneel met numerieke toetsen en toegangslezer.",
    family: "numeric-reader",
    protocol: "Jeweller",
    sourceUrl: "https://support.ajax.systems/en/manuals/superior-keypad-plus-jeweller/",
  }),
  ajaxControlDevice({
    value: "superior-keypad-touchscreen-fibra",
    label: "Superior KeyPad TouchScreen Fibra",
    description: "Bedraad Superior-touchscreen met groepen en meerdere authenticatiemethoden.",
    family: "touchscreen",
    protocol: "Fibra",
    sourceUrl: "https://support.ajax.systems/en/manuals/superior-keypad-touchscreen-fibra/",
  }),
  ajaxControlDevice({
    value: "keypad-outdoor-jeweller",
    label: "KeyPad Outdoor Jeweller",
    description: "Draadloos buitenpaneel met mechanische toetsen, OK-toets en lezer.",
    family: "outdoor",
    protocol: "Jeweller",
    sourceUrl: "https://support.ajax.systems/en/manuals/keypad-outdoor-jeweller/",
  }),
  ajaxControlDevice({
    value: "superior-keypad-outdoor-fibra",
    label: "Superior KeyPad Outdoor Fibra",
    description: "Bedraad Grade 3-buitenpaneel met primaire en secundaire bedienmodus.",
    family: "outdoor",
    protocol: "Fibra",
    sourceUrl: "https://support.ajax.systems/en/manuals/superior-keypad-outdoor-fibra/",
  }),
  ajaxControlDevice({
    value: "superior-keypad-plus-g3-jeweller",
    label: "Superior KeyPad Plus G3 Jeweller",
    description: "Draadloos Grade 3-paneel met numerieke toetsen en toegangslezer.",
    family: "numeric-reader",
    protocol: "Jeweller",
    sourceUrl: "https://support.ajax.systems/en/manuals/superior-keypad-plus-g3-jeweller/",
  }),
  ajaxControlDevice({
    value: "superior-keypad-touchscreen-g3-jeweller",
    label: "Superior KeyPad TouchScreen G3 Jeweller",
    description: "Draadloos Grade 3-touchscreen voor beveiligingsgroepen en automatisering.",
    family: "touchscreen",
    protocol: "Jeweller / Wings",
    sourceUrl: "https://support.ajax.systems/en/manuals/superior-keypad-touchscreen-g3-jeweller/",
  }),
  ajaxControlDevice({
    value: "ajax-app-only",
    label: "Geen vast bedienpaneel",
    description: "Bediening verloopt uitsluitend via een bevoegde Ajax-app.",
    family: "app",
    protocol: "Ajax-app",
    sourceUrl: "https://support.ajax.systems/en/how-to-configure-a-space/",
  }),
];

const normalize = value => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("nl-NL");

export const isAjaxAlarmInstallation = installation => installation?.installation_type === "alarm_system"
  && AJAX_BRAND_VALUES.has(normalize(installation?.brand));

export const findAjaxControlDevice = value => AJAX_CONTROL_DEVICE_OPTIONS.find(option => option.value === value) || null;

export const ajaxControlDevicePayload = value => {
  const option = findAjaxControlDevice(value);
  if (!option) return null;
  return {
    control_device_key: option.value,
    control_device_name: option.label,
    manual_key: option.manualKey,
    manual_version: option.manualVersion,
  };
};

const commonBypassProcedure = {
  key: "one-time-deactivation",
  title: "Zone of melder tijdelijk overbruggen",
  summary: "Ajax noemt dit eenmalige deactivering. Dit gebeurt in de Ajax-app en wordt na de eerstvolgende uitschakeling automatisch opgeheven.",
  warning: "Alleen uitvoeren met toestemming en het recht om apparaatinstellingen te wijzigen. Een volledig gedeactiveerde melder stuurt tijdelijk geen alarmen of storingen door.",
  steps: [
    "Controleer dat het systeem is uitgeschakeld en leg de operationele reden vast.",
    "Open in de Ajax-app Apparaten en kies de betreffende melder of zone.",
    "Open Instellingen en kies Eenmalige deactivering.",
    "Kies Volledig of Alleen deksel, controleer de scope en sla op.",
    "Schakel pas daarna het object of de afgesproken sectie in en controleer de status.",
    "Na de eerstvolgende uitschakeling vervalt deze overbrugging. Controleer zo nodig of de melder weer actief is.",
  ],
  sourceUrl: "https://support.ajax.systems/en/one-arming-device-deactivation/",
};

// De inhoud van deze eerste release blijft onder zijn eigen versiesleutel staan.
// Een volgende inhoudelijke revisie wordt als een nieuwe release toegevoegd in
// AJAX_MANUAL_RELEASE_DEFINITIONS; bestaande installaties blijven zo exact
// dezelfde instructie terugvinden.
const AJAX_MANUAL_CONTENT_2026_08_1 = {
  numeric: {
    schematic: "numeric",
    intro: "Dit paneel gebruikt een numerieke code gevolgd door de toets voor Inschakelen, Uitschakelen of Nachtmodus. De precieze rechten en toegewezen groepen worden in Ajax ingesteld.",
    procedures: [
      {
        key: "arm-all",
        title: "Volledig inschakelen",
        sequence: ["Schakelcode", "Inschakelen"],
        steps: ["Activeer het aanraakvlak.", "Voer de bevoegde schakelcode in.", "Druk op Inschakelen.", "Controleer de bevestiging en verlaat het object binnen de ingestelde uitlooptijd."],
      },
      {
        key: "disarm-all",
        title: "Volledig uitschakelen",
        sequence: ["Schakelcode", "Uitschakelen"],
        steps: ["Activeer het paneel.", "Voer de bevoegde schakelcode in.", "Druk op Uitschakelen.", "Controleer dat de uitschakelstatus is bevestigd voordat de beveiligde ruimte wordt betreden."],
      },
      {
        key: "night-mode",
        title: "Nachtmodus",
        sequence: ["Schakelcode", "Nachtmodus"],
        steps: ["Controleer welke melders binnen de Nachtmodus vallen.", "Activeer het paneel en voer de schakelcode in.", "Druk op Nachtmodus en controleer de statusindicatie."],
      },
      {
        key: "groups",
        title: "Een sectie of groep bedienen",
        sequence: ["Schakelcode", "*", "Sectie-ID", "Actie"],
        steps: ["Activeer het paneel.", "Voer de bevoegde code, * en het Ajax-groepsnummer in.", "Kies Inschakelen, Uitschakelen of Nachtmodus.", "Controleer dat uitsluitend de bedoelde groep van status is veranderd."],
        note: "Bij een persoonlijk Ajax-profiel kan vóór de code ook de gebruikers-ID en * nodig zijn. Een aan één groep toegewezen paneel kan de sectiekeuze overslaan.",
      },
    ],
  },
  "numeric-reader": {
    schematic: "numeric-reader",
    intro: "Dit paneel kan met een code en, wanneer de beheerder dit heeft toegestaan, met Ajax Pass of Tag worden bediend. Een extra bevestigingscode kan verplicht zijn.",
    procedures: [
      {
        key: "arm-all",
        title: "Volledig inschakelen",
        sequence: ["Code of Pass/Tag", "Inschakelen"],
        steps: ["Activeer het paneel met een handbeweging.", "Voer de bevoegde code in of bied Pass/Tag aan bij de lezer.", "Voer een aanvullende bevestigingscode in wanneer het paneel daarom vraagt.", "Druk op Inschakelen en controleer de bevestiging."],
      },
      {
        key: "disarm-all",
        title: "Volledig uitschakelen",
        sequence: ["Code of Pass/Tag", "Uitschakelen"],
        steps: ["Activeer het paneel.", "Authenticeer met de afgesproken code, Pass of Tag.", "Druk op Uitschakelen en controleer de status vóór betreding."],
      },
      {
        key: "night-mode",
        title: "Nachtmodus",
        sequence: ["Code of Pass/Tag", "Nachtmodus"],
        steps: ["Controleer vooraf de Nachtmodus-scope.", "Activeer en authenticeer op het paneel.", "Druk op Nachtmodus en controleer de bevestiging."],
      },
      {
        key: "groups",
        title: "Een sectie of groep bedienen",
        sequence: ["Code", "*", "Sectie-ID", "Actie"],
        steps: ["Activeer het paneel.", "Gebruik de bevoegde code met * en het groepsnummer, of kies via de geconfigureerde functietoets een groep.", "Kies de gewenste beveiligingsmodus.", "Controleer de resulterende groepsstatus."],
        note: "Welke route beschikbaar is, hangt af van rechten en paneelinstellingen. Gebruik nooit een andere groep omdat de bedoelde groep niet zichtbaar is.",
      },
    ],
  },
  touchscreen: {
    schematic: "touchscreen",
    intro: "Het touchscreen toont alleen groepen en acties waarvoor de geauthenticeerde gebruiker rechten heeft. De volgorde van actie en authenticatie hangt af van de instelling Voorautorisatie.",
    procedures: [
      {
        key: "arm-all",
        title: "Volledig inschakelen",
        steps: ["Activeer het scherm door te naderen of een hand voor de sensor te houden.", "Authenticeer eerst wanneer Voorautorisatie actief is.", "Open Bediening en kies Inschakelen.", "Authenticeer na de keuze wanneer Voorautorisatie uit staat en controleer de bevestiging."],
      },
      {
        key: "disarm-all",
        title: "Volledig uitschakelen",
        steps: ["Activeer het touchscreen.", "Open Bediening en kies Uitschakelen; authenticeer vóór of na deze keuze volgens de schermprompt.", "Controleer de objectstatus voordat de ruimte wordt betreden."],
      },
      {
        key: "night-mode",
        title: "Nachtmodus",
        steps: ["Activeer en authenticeer volgens de schermprompt.", "Open Bediening en kies Nachtmodus.", "Controleer dat de afgesproken Nachtmodus-scope is geactiveerd."],
      },
      {
        key: "groups",
        title: "Een sectie of groep bedienen",
        steps: ["Activeer het scherm en authenticeer.", "Open Bediening; kies de zichtbare groep of groepen.", "Kies Inschakelen of Uitschakelen.", "Controleer de kleur en status van elke gekozen groep."],
        note: "Ontbreekt een groep, dan heeft deze gebruiker of dit gedeelde paneel daar geen recht op. Laat rechten door een bevoegde beheerder controleren.",
      },
    ],
  },
  outdoor: {
    schematic: "outdoor",
    intro: "Outdoor-panelen gebruiken mechanische toetsen en een OK-toets. De primaire en secundaire modus zijn per object configureerbaar; de gekozen functie is daarom altijd leidend boven een algemene toetsaanname.",
    procedures: [
      {
        key: "arm-all",
        title: "Inschakelen via de toegewezen modus",
        steps: ["Activeer het paneel en controleer welke functie als primaire modus is ingesteld.", "Authenticeer met de bevoegde code, Pass, Tag of smartphone.", "Bevestig met OK wanneer het paneel dit vraagt.", "Controleer de statusindicatie en uitlooptijd."],
      },
      {
        key: "disarm-all",
        title: "Uitschakelen via de toegewezen modus",
        steps: ["Activeer het paneel.", "Authenticeer met het afgesproken middel.", "Kies of bevestig de toegewezen uitschakelfunctie met OK.", "Controleer de uitschakelstatus vóór betreding."],
      },
      {
        key: "secondary-mode",
        title: "Secundaire functie of sectie",
        steps: ["Houd OK ingedrukt om naar de secundaire modus te wisselen.", "Controleer de indicatie voordat je een code of toegangsdrager gebruikt.", "Voer de afgesproken actie uit en bevestig met OK.", "Controleer welke groep of automatiseringsactie daadwerkelijk is uitgevoerd."],
        note: "De secundaire modus kan per installatie iets anders doen. Gebruik deze alleen wanneer de objectspecifieke instructie de ingestelde functie benoemt.",
      },
    ],
  },
  app: {
    schematic: "app",
    intro: "Deze installatie heeft geen vast bedienpaneel. Alleen een bevoegde gebruiker bedient de beveiligingsmodus via de Ajax-app; apprechten bepalen welke objecten, groepen en instellingen zichtbaar zijn.",
    procedures: [
      {
        key: "arm-all",
        title: "Volledig in- of uitschakelen",
        steps: ["Open de Ajax-app en kies de juiste Space of hub.", "Controleer naam, adres en actuele beveiligingsstatus.", "Kies Inschakelen of Uitschakelen en bevestig wanneer de app daarom vraagt.", "Controleer de gebeurtenisbevestiging voordat je vertrekt of binnengaat."],
      },
      {
        key: "night-mode",
        title: "Nachtmodus",
        steps: ["Kies de juiste Space.", "Controleer welke melders aan Nachtmodus zijn toegewezen.", "Activeer Nachtmodus en controleer de nieuwe status."],
      },
      {
        key: "groups",
        title: "Een sectie of groep bedienen",
        steps: ["Open de groepsweergave van de juiste Space.", "Kies uitsluitend de afgesproken groep.", "Wijzig de beveiligingsstatus en controleer de bevestiging in de gebeurtenisfeed."],
      },
    ],
  },
};

const releaseKey = (manualKey, manualVersion) => `${manualKey}@${manualVersion}`;

/**
 * Append-only handleidingreleases. Bij een inhoudelijke wijziging komt er een
 * nieuwe versie naast de oude, zodat bestaande installaties reproduceerbaar blijven.
 */
const AJAX_MANUAL_RELEASE_DEFINITIONS = [
  {
    version: AJAX_MANUAL_VERSION,
    reviewedOn: AJAX_MANUAL_REVIEWED_ON,
    content: AJAX_MANUAL_CONTENT_2026_08_1,
  },
];

export const AJAX_MANUAL_RELEASES = Object.fromEntries(AJAX_MANUAL_RELEASE_DEFINITIONS.flatMap(release => (
  Object.entries(AJAX_MANUAL_FAMILIES).map(([family, metadata]) => {
    const devices = AJAX_CONTROL_DEVICE_OPTIONS.filter(option => option.family === family);
    return [
      releaseKey(metadata.manualKey, release.version),
      {
        key: metadata.manualKey,
        title: metadata.title,
        version: release.version,
        reviewedOn: release.reviewedOn,
        manufacturer: "Ajax Systems",
        supportedControlDevices: devices.map(option => option.label),
        sourceUrls: devices.map(option => option.sourceUrl),
        ...release.content[family],
        bypassProcedure: commonBypassProcedure,
      },
    ];
  })
)));

export function resolveInstallationManual(installation) {
  if (!isAjaxAlarmInstallation(installation)) return null;
  const option = findAjaxControlDevice(installation?.control_device_key);
  if (!option) return null;
  const manualKey = installation?.manual_key;
  const manualVersion = installation?.manual_version;
  // Alleen een bij opslag atomair vastgelegde release mag worden geopend. Een
  // onvolledig legacyrecord krijgt geen stilzwijgende koppeling naar de actuele
  // handleiding, omdat daarmee de historische instructie niet reproduceerbaar is.
  if (!manualKey || !manualVersion) return null;
  // Fail closed: een opgeslagen paneelsleutel mag nooit instructies uit een
  // andere bedieningsfamilie openen, ook niet bij legacy-drift of datacorruptie.
  if (manualKey !== option.manualKey) return null;
  const release = AJAX_MANUAL_RELEASES[releaseKey(manualKey, manualVersion)];
  if (!release) return null;
  return {
    ...release,
    controlDevice: option.label,
    protocol: option.protocol,
    sourceUrl: option.sourceUrl,
  };
}
