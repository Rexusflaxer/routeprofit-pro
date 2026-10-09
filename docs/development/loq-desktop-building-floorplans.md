# Overdracht: LOQ desktop app en plattegronden per gebouw

Dit bestand bewaart de oorspronkelijke gebouwgerichte voorbereiding én de desktopimplementatie van 9 oktober 2026. De huidige implementatiestatus hieronder gaat vóór de historische ontwerptekst verderop. Bestaande lokale wijzigingen zijn behouden; er is niets gecommit of gepusht. De actuele workspace-instructies blijven van toepassing.

## Desktopimplementatie — 9 oktober 2026

De macOS-app is lokaal geïmplementeerd en verpakt als versie 0.1.1 voor Apple Silicon en Intel, met macOS 13 als minimum. De distributies staan in `desktop/release/` en zijn expliciet gemarkeerd als **UNSIGNED-development**. Er is geen Developer ID Application-certificaat of bruikbare notarization-configuratie aangetroffen. Een Apple Development-certificaat is hiervoor onvoldoende. Live Base44-deployment en een geauthenticeerde proef op twee fysieke Macs zijn nog niet uitgevoerd; daarvoor is de ontwikkelaarsaanmelding gevraagd. Lokaal slagen de desktop- en webbuild, gerichte controles en verpakte runtimecontroles. Dit is geen claim van live acceptatie.

### Onderdelen en gebruik

- `desktop/main.mjs`, `preload.cjs`, `security.mjs`: lokaal gebundeld Electron-venster, browseraanmelding, beperkte API-koppeling, beschermd sessie-/herstelbestand, native import, PDF en bewerkbare JSON-kopie. Het tekenvenster ontvangt geen toegangstoken. HEIC wordt lokaal naar PNG van maximaal 2600 pixels omgezet.
- `desktop/renderer/App.jsx`, `draftController.js`: objecten, uitsluitend servergebouwen, cloudconcepten, automatische seriële opslag, versleutelde herstelkopieën en expliciete conflicten. Onbekende save/publicatie-uitkomsten houden hun oorspronkelijke verzoek en sleutel; die worden eerst opgelost voordat latere wijzigingen worden opgeslagen. Herstelgeschiedenis is apart te openen en te exporteren.
- `src/features/floorplans/`: gedeeld meterschema, SVG-editor, meerdere verdiepingen, muur-/ruimte-/deur-/raambewerking, voorzieningen, installatiekoppeling, routes, undo/redo, import, lokale muurvoorstellen en afdrukken. Papieruitsnede, logo, ophanglocaties, NL/EN/DE-legenda en eigen tweede instructietekst zijn beschikbaar.
- `PublishedDesktopFloorPlan.jsx`: volledige gepubliceerde gebouwtekening met verdieping- en profielkeuze plus private publicatie-PDF met afdrukvoorbeeld en download. Legacy objectbrede iOS-plannen behouden hun aparte route.

Ontwikkelen: `npm run desktop:dev`. Controle: `npm run desktop:typecheck`. Lokale productie-uitvoer: `npm run desktop:build`. Verpakken: `npm run desktop:package:unsigned`. De normale `desktop:package` vereist Developer ID en notarization-gegevens en stopt expliciet wanneer die ontbreken. `desktop:smoke:package` start beide verpakte architecturen zonder ontwikkelserver en test de echte PDF.js-/OpenCV-workers onder de productiebeveiliging. Intel is lokaal via Rosetta gecontroleerd; dit vervangt geen proef op een tweede fysieke Mac.

### Afstemming op de LOQ-webstijl — versie 0.1.1

De desktoprenderer importeert rechtstreeks `src/index.css` en gebruikt de bestaande webcomponenten voor knoppen, invoer, paginakoppen en accountmenu. De echte lichte/donkere logoassets uit `public/` worden via `LOQBrand` lokaal gebundeld. Het Mac-appicoon wordt uit hetzelfde originele beeldmerk gegenereerd. De eerdere groene vormgeving en getypte logo-imitatie zijn vervangen door de neutrale LOQ-opmaak met blauwe accenten.

- Compacte navigatie, objecttabel met zoeken/paginering, gebouwkaarten, uniforme aanmelding en herstelmeldingen. Een mislukte objectquery heeft een afzonderlijke foutstatus en herstelknop.
- Automatisch/licht/donker volgt dezelfde `theme`-voorkeur als de webapp. De desktop gebruikt hiervoor geen inline script; de bestaande productie-CSP blijft gehandhaafd.
- Tekenstappen, eigenschappen, import en publicatie volgen dezelfde kleuren, typografie en bediening. Papier en veiligheidskleuren blijven herkenbaar. Op compacte schermen worden voorzieningen als leesbare rijen getoond.
- Een document/verdieping past bij openen automatisch in het tekenvlak. Eigen zoom en verschuiving blijven behouden tijdens bewerkingen. Vensters ondersteunen focusbegrenzing, Escape en terugkeer van toetsenbordfocus.
- Navigatie naar Objecten archiveert een nog niet gekozen lokale herstelkopie vóór de actuele controller wordt bewaard. Een gerichte test dekt dit gegevensbehoud.

Visueel gecontroleerd met uitsluitend fictieve lokale gegevens: aanmelding, objecten, gebouwen, editor, voorzieningen, eigenschappen, import, afdrukinstellingen en publicatiecontrole; licht/donker, 1080×760 en 1440×940. Bewijsbeelden staan in `desktop/release/Voorbeelden/LOQ-0.1.1-licht-editor.jpg` en `LOQ-0.1.1-donker-MacBook.jpg`. De fixtures (`desktop/qa/`, `shell-qa.html`) zijn geen onderdeel van de verpakte app. De webbron is als stijlbasis onderzocht; dit is geen visuele/geauthenticeerde live-Backoffice-acceptatie.

Verificatie voor deze wijziging: 391 gerichte tests in 20 bestanden, daarna één aanvullende viewporttest (alle vier toegankelijkheids-/viewporttests geslaagd); in totaal 392 verschillende gerichte tests. Desktop-typecheck, gerichte JSX-lint, webbuild en desktopbuild slagen. Bestaande buildwaarschuwingen over verouderde browserdata, gedeelde CSS-selectors en grote bundels blijven zichtbaar. Geen volledige repositorytestclaim. De distributie blijft een ongetekende ontwikkelversie; live publicatie en distributieondertekening blijven open zoals hierboven beschreven. De verpakte 0.1.1-app start voor Apple Silicon en Intel zonder ontwikkelserver; beide lokale logoassets, webthemakleuren, afgeschermde renderer en PDF.js-/OpenCV-workers zijn opnieuw gecontroleerd (rapport: `desktop/.qa/packaging-smoke.json`). Oudere 0.1.0-installatiebestanden blijven behouden; manifest en checksums verwijzen naar 0.1.1.

### Definitieve API-afspraken

`customerPlatformApi` blijft dezelfde bestaande beheerdersrechten hanteren. `get_object_building_floor_plan_workspace`, `save_object_building_floor_plan_draft`, `publish_object_building_floor_plan`, `upload_object_building_floor_plan_asset` en `read_object_building_floor_plan_asset` zijn geïmplementeerd. Iedere actie controleert klant, object en exact de opgeslagen gebouwkey. De body gebruikt `customer_id`, `object_id`, `building_selection_key`; mutaties daarnaast `expected_map_version`, `expected_version` en `idempotency_key`. Save ontvangt `data.document`; publiceren gebruikt het opgeslagen concept, `expected_current_floor_plan_id` en optioneel `data.pdf_file_id`/`preview_2d_file_id`.

Eén CAS-index op `SurveillanceObject` verwijst per gebouw naar onveranderlijke werkdocument-snapshots en publicatierevisies. Een nieuwe publicatie wordt pas actief nadat alle inhoud bestaat en de indexwissel slaagt. De kaartversie is een afzonderlijke voorwaarde en wordt niet door conceptopslag gewijzigd. De response heeft `workspace` en `configuration_version`; publiceren verhoogt ook de workspaceversie. Dubbele verzoeken geven dezelfde bevestiging. Geënsceneerde, niet geactiveerde records worden niet als publicatie getoond.

Het desktopdocument heeft `schemaVersion:1`, geometrie in meters, vaste document-/verdieping-/onderdeel-ID's en gescheiden onderlegger-, logo- en afdrukverwijzingen. Grenzen: 4 MiB, 30 verdiepingen, 40.000 onderdelen/punten totaal; per verdieping 5.000 muren, 4.000 openingen, 2.000 ruimten, 5.000 symbolen en 1.000 routes. De code in `documentGuards.ts` en `buildingFloorPlans.ts` is de gezaghebbende volledige validatie.

Imports en logo's zijn private versleutelde ManagedFiles binnen object/gebouwscope. Publiceren genereert één PDF met alle verdiepingen en ophanglocaties, uploadt die privé en bindt hem aan de exacte opgeslagen conceptversie en volgende revisie. Het publicatiebestand kan dus niet bij een ondertussen gewijzigde tekening horen. Er wordt geen BV-eigendom uit een ambigu object afgeleid: de bestaande beheerders-/objectscope blijft bepalend en de file heeft geen verzonnen company_id. De gebouwgetter retourneert `desktop_document` en `pdf_file_id`, naast de bestaande compatibiliteitsvelden. Raw URL's en sleutels gaan niet in het tekenbestand.

`desktopAuth` gebruikt een aan de aanmeldpoging gebonden challenge, state en een kort geldige eenmalige code. De aanmeldpagina toont het bestaande account. De bearer staat alleen versleuteld in een afgeschermde servergrant en na uitwisseling in het beschermde hoofdproces. De functie gebruikt `LOQ_DESKTOP_AUTH_KEY_B64`, of domeingescheiden de bestaande `MANAGED_FILE_MASTER_KEY_B64`. Geen secrets in broncode, opdrachtenhistorie of documentatie plaatsen.

### Getoetst en nog open

- Gerichte tests dekken documentgeometrie, muurherkenning, importbewerking, geschiedenis, print, auth, rechten, CAS, conflicten, retries, assets, gebouwviewer en bestaande kaart-/iOS-scheiding. De eindresultaten staan in de taak; dit is geen volledige repositorytestclaim.
- Echte verpakte runtime: beide architecturen starten zonder ontwikkelserver; tokens/Node zijn afgeschermd in het tekenvenster; PDF.js en OpenCV draaien lokaal onder de productie-CSP.
- `desktop/qa/check-recognition-runtime.mjs`: vector-PDF, raster-PDF, scan, schuine muren, intacte deuronderbreking en perspectiefcorrectie. Rapport/fixtures staan in `desktop/qa/fixtures/`.
- De aangeleverde HEIC-foto is lokaal omgezet, rechtgezet, uitgesneden, van muurvoorstellen voorzien en als één herstelbare import getest. Voor die proef is een fictieve schaal gebruikt: er is geen werkelijke gebouwmaat uit de foto afgeleid. Tekst, symbolen en slechte bronkwaliteit kunnen onjuiste voorstellen opleveren; gebruikercontrole blijft noodzakelijk.
- `desktop/qa/check-print-scale.mjs`: in een echte Electron-PDF meet een 10-metervoorbeeld bij 1:100 **99,9983 mm** (tolerantie 0,05 mm). A4/A3, gemengde oriëntaties en meerdere ophanglocaties zijn gecontroleerd.
- Productiedistributie blijft afhankelijk van Developer ID, notarization en de benodigde door de gebruiker geaccepteerde Apple-toolvoorwaarden. Beveiligingswaarschuwingen worden niet omzeild.
- Nog te verifiëren na deployment: dezelfde LOQ-account op twee Macs, echte online save/reopen, conflicten tussen die Macs, browsercallback, private bestandsrechten en de gepubliceerde gebouwviewer. Benodigde publicatie: entities `DesktopLoginGrant`, `ObjectBuildingFloorPlanWorkspace`, uitbreidingen `ObjectFloorPlan`/`SurveillanceObject`, functies `desktopAuth` en `customerPlatformApi`, de voorbereide legacy-scheiding in `mobileApi`, en de webfrontend inclusief `/DesktopSignIn`. Publiceer alleen de benodigde scope; geen ongerelateerde lokale wijzigingen meenemen.
- Een procesonderbreking tussen fysieke private upload en ManagedFile-registratie kan een ongekoppeld versleuteld opslagbestand achterlaten. Registratie-/requestherstel is gebouwd; veilige automatische verwijdering van zulke ongekoppelde blobs is nog niet beschikbaar. Historische publicatiebestanden worden niet automatisch verwijderd.
- Pictogrammen zijn originele LOQ-vectorillustraties met gebundelde bronvermelding/licenties voor gebruikte componenten. Er is geen ISO-certificering of inhoudelijke brandveiligheidsgoedkeuring geclaimd. De juridische/norminhoudelijke beoordeling van een definitief ontruimingsplan blijft afzonderlijk.

## Historische voorbereiding (vóór deze desktopimplementatie)

De volgende secties bewaren de oorspronkelijke overdracht. Formuleringen zoals 'nog te bouwen' beschrijven die eerdere fase; gebruik de huidige API-afspraken hierboven en de actuele implementatie voor vervolgwerk.

## Voorbereid in Backoffice

De Objectpagina → **Terrein en gebouwen** kan vanuit de opgeslagen gebouwinventaris en de alleen-lezenkaart een gebouwplattegrond openen. De geauthenticeerde actie `customerPlatformApi/get_object_building_floor_plan` zoekt exact één actuele gepubliceerde `ObjectFloorPlan` voor het geselecteerde gebouw. Ontbreekt deze, dan verschijnt: **Voeg een plattegrond toe via de LOQ desktop app.**

`ObjectFloorPlan.building_selection_key` is een optionele nullable string. Bestaande records zonder key blijven objectbreed. De sleutel identificeert het opgeslagen gebouw binnen het object; een naamwijziging verandert de sleutel niet.

| Sleutel | Herkomst | Voorwaarde |
| --- | --- | --- |
| `bag:<feature-id>` | Opgeslagen geselecteerde BAG-contour | Exacte geselecteerde bron-ID in geldige opgeslagen handmatige configuratie |
| `point:<id>` | Eigen gebouwselectie zonder BAG-koppeling | Exact opgeslagen eigen selectiepunt-ID |
| `manual:<local-id>` | Eerder ingetekende contour | Eigen stabiel opgeslagen ID, exact één contour |

Automatische gebouwindicaties en niet-opgeslagen selecties zijn geen toegestane koppeling. `manual:legacy-<index>` van een contour zonder stabiel ID is een tijdelijke inventarissleutel en is uitgesloten. Bewaar geen Mapbox-feature-ID/geometrie als desktopkoppeling en leid geen gebouwidentiteit af uit naam, afstand of adres.

De autoritatieve keuzelijst is **`get_object_map_configuration.configuration.building_floor_plan_selection_keys`**. Gebruik uitsluitend die serverkeys in de web- en desktopclient. De server geeft alleen de doorsnede van unieke ruwe opgeslagen keys en veilig genormaliseerde keys bij een ruwe expliciete `building_selection_mode: "manual"`; ongeldige, automatische of alleen met normalisatiefallback identificeerbare configuraties leveren `[]`. Reconstrueer deze lijst nooit uit contouren, selectiepunten, tabelrijen of de weergegeven selectiemodus: de bestaande normalisatie kan synthetische legacy IDs toevoegen en een modus afleiden. Ontbreekt het nieuwe veld bij een object, dan zijn er geen toegestane gebouwkeuzes totdat de passende backend is gepubliceerd en opnieuw geladen. Collectiefdossiers bieden deze objectgebonden lijst niet en vallen buiten deze gebouwplattegrondflow. De plattegrondleesactie hergebruikt dezelfde servercontrole; de lijst is geen vervanging voor autorisatie bij iedere lees-/schrijfactie.

## Bestaand leescontract

Voorbeeld met de bestaande Backoffice-helper die de functie-envelope afhandelt:

```js
const { configuration } = await invokeCustomerPlatformRead({
  action: "get_object_map_configuration",
  customer_id: "customer-123",
  object_id: "object-456"
});
const selectableKeys = configuration.building_floor_plan_selection_keys || [];
const chosenKey = "bag:pdok-feature-uuid"; // Keuze uit de getoonde opgeslagen gebouwrijen.
if (!selectableKeys.includes(chosenKey)) throw new Error("Dit gebouw is niet beschikbaar.");

const response = await invokeCustomerPlatformRead({
  action: "get_object_building_floor_plan",
  customer_id: "customer-123",
  object_id: "object-456",
  building_selection_key: chosenKey
});
```

Het nieuwe configuratieveld kan bijvoorbeeld `["bag:pdok-feature-uuid", "point:eigen-uuid"]` zijn. De desktopclient moet dezelfde geauthenticeerde acties en envelope afhandelen; hij mag geen eigen sleutelafleiding als compatibiliteitsfallback gebruiken.

Binnen de bestaande API-envelope bevat data:

```json
{
  "customer_id": "customer-123",
  "object_id": "object-456",
  "building_selection_key": "bag:pdok-feature-uuid",
  "floor_plan": {
    "id": "floorplan-789",
    "object_id": "object-456",
    "building_selection_key": "bag:pdok-feature-uuid",
    "revision": 3,
    "title": "Hoofdgebouw",
    "source": "loq_desktop",
    "status": "published",
    "is_current": true,
    "published_at": "2026-10-09T10:00:00Z",
    "preview_2d_file_id": null,
    "preview_2d_download_filename": null,
    "floorplan_2d_json": {
      "id": "drawing-uuid",
      "title": "Begane grond",
      "unit": "m",
      "generatedAt": "2026-10-09T10:00:00Z",
      "bounds": { "minX": 0, "minY": 0, "maxX": 12, "maxY": 8 },
      "rooms": [{
        "id": "room-1",
        "label": "Entree",
        "section": null,
        "polygon": [{"x": 0, "y": 0}, {"x": 12, "y": 0}, {"x": 12, "y": 8}, {"x": 0, "y": 8}]
      }],
      "walls": [{
        "id": "wall-1",
        "start": {"x": 0, "y": 0},
        "end": {"x": 12, "y": 0},
        "height": 2.8,
        "confidence": null
      }],
      "openings": [{
        "id": "door-1",
        "type": "door",
        "center": {"x": 6, "y": 0},
        "start": {"x": 5.5, "y": 0},
        "end": {"x": 6.5, "y": 0},
        "width": 1,
        "height": 2.1
      }],
      "objects": []
    }
  }
}
```

De voorbeelden zijn fictief; `loq_desktop` is een voorgenomen bronlabel. Er bestaat in deze feature geen desktop-publicatieactie die dit record aanmaakt. Bij een ontbrekende actuele publicatie is `floor_plan: null`. Bij meer dan één actuele publicatie voor exact dezelfde key geeft de leesactie `409 building_floor_plan_ambiguous`; bij een niet meer geldige opgeslagen selectie geeft zij `409 building_selection_unavailable`. Geef zulke fouten herkenbaar weer en vraag de configuratie opnieuw op. Een objectbrede legacy plattegrond is geen gebouwfallback.

De 2D-JSON gebruikt de vorm van de bestaande native `ObjectFloorPlan2D` in `/Users/David/Documents/Surveillance app/VBMobileSurveillanceApp/Models/ObjectFloorPlan.swift`: punten als `{x,y}`, kamerpolygonen, muren met `start/end`, openingen met `center` en optionele `start/end`. De webviewer accepteert alleen `unit: "m"`, geldige polygonen en geldige `start/end`-paren voor de weergegeven muren/openingen. Native Y is positief omhoog; de SVG spiegelt uitsluitend tijdens renderen zodat dezelfde oriëntatie zichtbaar is. Houd brondata en editorcoördinaten in het native stelsel.

De viewer valideert ondersteunde arrays en totale geometriebegroting als geheel. Een ongeldige vorm, ontbrekende endpoints of te grote array mag niet stil worden weggefilterd of afgeknipt tot een gedeeltelijke plattegrond; dan is de JSON-weergave niet beschikbaar. Een veilige ManagedFile-preview blijft afzonderlijk bruikbaar wanneer deze geldig is. De webviewer ondersteunt alleen een begrensde geometrische weergave; de voorbereiding is geen volledig editor-/annotatiecontract en toont niet automatisch alle native metadata, sensoren of objecten. Leg vóór een nieuwe desktopdocumentversie expliciet vast welke velden en limieten de editor leest en schrijft.

Het gebouwantwoord bevat alleen `id`, `object_id`, `building_selection_key`, `revision`, `title`, `source`, `status`, `is_current`, `published_at`, `preview_2d_file_id`, `preview_2d_download_filename` en gesaneerde `floorplan_2d_json`. Ruwe URL's, USDZ, ruwe RoomPlan-data, annotations en sleutelmaterialen horen niet bij dit leesantwoord. Een ManagedFile-ID is een verwijzing; deze verleent op zichzelf geen toegang tot de inhoud.

## Nog te bouwen vóór desktoppublicatie

Maak een geauthenticeerde, expliciet geautoriseerde publicatieroute; schrijf niet rechtstreeks als gewone desktopclient naar de entity. De bestaande `mobileApi/object_floor_plan`-publicatie is objectbreed en is geen gebouwgerichte desktop-API. Ontwerp en implementeer de nieuwe route met onderstaande eigenschappen.

1. **Scope en rechten.** Controleer de aanvrager, klant, object en verantwoordelijke BV volgens de bestaande platformregels, en afzonderlijk het recht om een gebouwplattegrond te publiceren. Hergebruik de serverhelper achter `building_floor_plan_selection_keys` en controleer de exacte unieke key in de actuele expliciet opgeslagen handmatige configuratie; normalisatie of clientkeys zijn geen autorisatie. Neem geen klant/BV-eigendom, `captured_by`, status of publicatiedatum blind uit clientdata over.
2. **Selectieconflicten.** Neem de verwachte kaart/configuratieversie mee. Bij verwijdering, vervangen van een eigen selectiepunt of wijziging van een contour-ID tijdens het tekenen: blokkeer publicatie en laat de gebruiker de actuele selectie controleren. Verplaats bestaande plannen niet automatisch naar een nabijgelegen gebouw. Bewaar historie bij deselectie; de huidige leesactie maakt een vervallen koppeling ontoegankelijk. Een oude key opnieuw activeren vereist een expliciete beleidskeuze.
3. **Documentvalidatie.** Stel een versieerbaar schema voor tekengegevens vast. Valideer totale payloadgrootte, diepte, aantallen, unieke IDs, eindige coördinaten, eenheden, bounds en geldige geometrie. Saniteer labels; accepteer geen uitvoerbare HTML, scripts, externe asset-URL's of secrets in documentvelden. De huidige lees-sanering vervangt geen writevalidatie.
4. **Revisies.** Nummer revisies binnen exact `(object_id, building_selection_key)`. Houd objectbrede legacy revisies in een aparte stroom. Publiceren van gebouw A mag gebouw B of een legacy objectpublicatie niet demoten. Behoud records waar beveiligingsplan/routes al naar `floorplan_id` en `floorplan_revision` verwijzen; herschrijf zulke verwijzingen niet naar de nieuwste publicatie.
5. **Conflictcontrole en atomiciteit.** Voeg `expected_current_floor_plan_id` of gelijkwaardige versiecontrole toe. Garandeer maximaal één actuele gepubliceerde revisie per gebouw met een echte concurrency-/uniciteitsvoorziening. Reserveer de revisie en wissel current-status atomair of met een aantoonbaar herstelbaar protocol. De oude volgorde 'alles demoten, vervolgens create' is onvoldoende bij een fout of twee gelijktijdige publicaties.
6. **Idempotency.** Gebruik een unieke operationele sleutel plus een checksum van de genormaliseerde scope en inhoud. Herhaling van dezelfde operatie retourneert hetzelfde resultaat, zonder dubbele revisie/uploads. Dezelfde sleutel met andere inhoud krijgt een conflict. Leg herstel na een onbekende netwerkuitkomst en het opruimen van verweesde uploads vast.
7. **Bestanden.** Maak 2D-previewbestanden via de bestaande private `ManagedFile`-/encryptieflow. Controleer bij koppelen het bestandseigendom, object, BV, categorie, MIME/type, grootte en toegangsstatus. Neem geen willekeurig ManagedFile-ID of raw URL over. Bind het bestand aan de nieuwe `ObjectFloorPlan`-revisie via descriptor/source-fields; autoriseer unwrap/download apart. Neem object, een veilige stabiele gebouwscope en revisie op in het logische pad: het oude mobiele `objects/<object>/floorplans/revision-<revision>` onderscheidt gebouwen niet en per-gebouw revisienummers kunnen gelijk zijn. Ruim mislukte of vervangen conceptuploads volgens de bestaande lifecycle op. Leg bewaartermijnen vast zonder gepubliceerde historische assets met actieve referenties te verwijderen.
8. **Audit.** Registreer actor, object, key of een passende veilige referentie, plattegrond-ID, revisie en operatie-uitkomst. Log geen tekeninhoud, ruwe bestanden, URL's, decryptiesleutels of gevoelige labels. Hergebruik de bestaande veilige audit-/recoveryconventies.

Een toekomstige request kan deze verantwoordelijkheden uitdrukken als onderstaande **ontwerpschets**, niet als huidige werkende API:

```json
{
  "action": "publish_object_building_floor_plan",
  "customer_id": "customer-123",
  "object_id": "object-456",
  "building_selection_key": "bag:pdok-feature-uuid",
  "expected_map_version": 4,
  "expected_current_floor_plan_id": "floorplan-789",
  "idempotency_key": "nieuwe-operatie-uuid",
  "data": {
    "title": "Hoofdgebouw",
    "floorplan_2d_json": { "...": "gevalideerd-document-volgens-het-vastgestelde-schema" },
    "preview_2d_file_id": "geautoriseerd-private-managed-file-id"
  }
}
```

Kies de definitieve actionnaam, versietypen en envelope na inspectie van de actuele code. Bouw daarna pas een desktopclient die dat contract aanroept. Een entityveld toevoegen of een fixture aanmaken bewijst geen veilige desktop-publicatieflow.

## iOS-compatibiliteit

Oude `ObjectFloorPlan`-records zonder `building_selection_key`, met `null` of met een historische lege string blijven objectbreed. De oude mobiele `get` en objectlijst-samenvattingen blijven uitsluitend die records tonen. De oude mobiele `publish` blijft uitsluitend legacy records demoten en mag gebouwcurrent-status niet wijzigen; nieuwe legacy uploads krijgen expliciet `building_selection_key: null`. Dit endpoint wijst een `building_selection_key` in body/upload af met HTTP 400, zodat een gebouwkoppeling niet stilzwijgend verloren gaat. De objectbrede webtab blijft hetzelfde onderscheid maken.

Deze voorbereiding wijzigt geen native Swift-scherm. Bouw voor toekomstig gebouwgericht iOS-gebruik een afzonderlijk model/API-pad met dezelfde key en rechten; voeg niet stilzwijgend een gebouwplan toe aan het bestaande objectbrede antwoord. Bewaak ook dat native uploads en latere desktopbestanden dezelfde ManagedFile-/encryptie-afspraken gebruiken. Een extra verdieping/selecteerbare revisie/annotatie-editor is een volgende ontwerpbeslissing en vereist een expliciet contract; de huidige gebouwklik toont één actuele gebouwpublicatie.

## Acceptatie voor de desktopvervolgopdracht

- Haal gebouwkeuzes uitsluitend uit `configuration.building_floor_plan_selection_keys`; automatische, dubbele, positionele en synthetische sleutels zijn niet publiceerbaar. Zonder deze lijst verschijnt geen eigen client-side fallback.
- Publiceer twee verschillende gebouwen: beide blijven actueel en openen onafhankelijk in Backoffice.
- Publiceer een tweede revisie voor één gebouw: de oude revisie blijft historisch beschikbaar en bestaande routeverwijzingen blijven intact.
- Twee gelijktijdige publicaties voor hetzelfde gebouw leveren een gecontroleerd conflict of één consistent resultaat, nooit twee currents of geen current door een halve operatie.
- Herhaal een publicatie na een verbroken verbinding: er ontstaat geen dubbele revisie of upload. Hergebruik met andere inhoud faalt herkenbaar.
- Deselecteer/vervang het gebouw terwijl de desktop tekent: publicatie faalt met een selectieconflict; geen automatische nabijheidskoppeling.
- Andere klant/object/BV, onvoldoende recht, onjuist bestandseigendom en te grote/ongeldige geometrie worden server-side afgewezen.
- Maak een private veilige 2D-preview en controleer de Backoffice-beeldweergave/JSON-weergave, inclusief positieve native Y-as omhoog, uitsluitend meter-eenheden, afwijzing van ongeldige/te grote arrays zonder gedeeltelijke tekening, wisselen en sluiten zonder tijdelijke previews te laten hangen.
- Bestaande iOS legacy `get`/`publish` en objectsamenvattingen blijven gescheiden; een objectbrede iOS-publicatie verandert de gebouwpublicatie niet.
- Documenteer gerichte tests en controleer de gepubliceerde Base44-route met een geauthenticeerde proef. Claim geen live werking op basis van alleen een lokale build of GitHub-push.

## Lokale status

De codewijzigingen staan lokaal en zijn niet gecommit, gepusht of gepubliceerd in Base44. De volgende chat kan deze bestanden direct in dezelfde workspace lezen. Behoud de bestaande lokale wijzigingen bij het bijwerken van de mirror.

Eindcontrole op 9 oktober 2026: **375 tests geslaagd in 11 gerichte bestanden**, gewijzigde frontendbestanden zonder eslint-fouten, schone `git diff --check` en geslaagde Vite-build. De lokale build meldt ontbrekende `VITE_BASE44_APP_ID` en `VITE_BASE44_APP_BASE_URL`; dit is geen productie-/API-verificatie. In de browser zijn met fictieve lokale gegevens de gebouwnaamactie, ontbrekende-plattegrondmelding en volledige 2D-weergave visueel gecontroleerd. Kaartklik, scope, verouderde reacties, preview-opruiming en iOS-compatibiliteit zijn met gerichte regressietests gecontroleerd. Geen desktop app of native iOS-build uitgevoerd.
