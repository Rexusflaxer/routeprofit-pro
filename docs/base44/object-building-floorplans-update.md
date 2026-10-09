# Base44-publicatie: LOQ Desktop en gebouwplattegronden

## Actuele opdracht — 9 oktober 2026

Herstel de ontbrekende live `/DesktopSignIn`-pagina door de volledige voorbereide desktopkoppeling uit deze GitHub-versie naar de bestaande LOQ-app (`698e307ed3aa4cab3729bbf1`) te synchroniseren en publiceren. De functionele implementatie en contracten staan in [de actuele desktopoverdracht](../development/loq-desktop-building-floorplans.md). De historische voorbereidingsopdracht verderop is geen beperking van deze actuele release.

Neem samen mee:

- Frontend: `src/App.jsx` met de expliciete route buiten Layout, `src/pages/DesktopSignIn.jsx`, `src/components/brand/`, bestaande logoassets en de uitsluiting van loginparameters in `src/lib/NavigationTracker.jsx`.
- Aanmelding: `base44/functions/desktopAuth/entry.ts` plus `protocol.ts`, entity `DesktopLoginGrant` met afgeschermde rechten. Behoud challenge/state, kort geldige eenmalige code en `loq-desktop://auth-callback`; geef nooit een toegangstoken aan het tekenvenster of in een redirect-URL.
- Gebouwdocumenten: entity `ObjectBuildingFloorPlanWorkspace`, de voorbereide aanvullingen op `ObjectFloorPlan` en `SurveillanceObject`, `customerPlatformApi/entry.ts` met `buildingFloorPlans.ts` en bestaande modules. Behoud opgeslagen selectiekeys, bestaande autorisatie, versiecontrole, idempotentie en private ManagedFiles.
- Gebouwviewer: de voorbereide objectkaart- en plattegrondcomponenten, waaronder `PublishedDesktopFloorPlan.jsx`. Laat bestaande objectbrede iOS-plannen apart functioneren met de voorbereide `mobileApi`-scheiding; geen native iOS-contract breken.

Controleer uitsluitend aanwezigheid van de benodigde serversecret, zonder waarden te tonen. Aanmelding gebruikt `LOQ_DESKTOP_AUTH_KEY_B64` of domeingescheiden de bestaande `MANAGED_FILE_MASTER_KEY_B64`; private bestanden vereisen de bestaande ManagedFile-master. Geen bestaande encryptiesleutel roteren.

Deze bestaande app is met GitHub gesynchroniseerd: publiceer na de gerichte push naar `main` via de Base44-Publish-flow. Controleer eerst dat de nieuwe pagina, drie functies en vier schemawijzigingen daadwerkelijk zijn gesynchroniseerd. Voer geen brede CLI-deploy of `entities push` vanuit een onvolledige map uit; dat kan andere serverresources vervangen of verwijderen. Als een named-function-deploy nodig blijkt, publiceer uitsluitend `desktopAuth`, `customerPlatformApi` en `mobileApi`, zonder `--force`.

Acceptatie: de live `/DesktopSignIn` toont de LOQ-aanmeldpagina, een ongeldige/verlopen poging geeft een herstelmelding, een geldige admin-aanmelding keert veilig terug naar de geïnstalleerde app, objecten/gebouwen openen en een concept kan online worden opgeslagen/heropend. Controleer de volledige gepubliceerde gebouwtekening, private bestandsrechten en compatibiliteit van de bestaande iOS-objectplannen. Een geslaagde frontendbuild of GitHub-push is geen bewijs dat deze live acceptatie al is voltooid.

---

## Historische opdracht: alleen gebouwviewer voorbereiden

De tekst hieronder beschrijft de eerdere voorbereidingsfase. Gebruik voor de desktoprelease de actuele opdracht hierboven.

### Oorspronkelijk doel: gebouw openen en gekoppelde plattegrond bekijken

## Doel en afbakening

Bereid de Objectpagina → **Terrein en gebouwen** voor op plattegronden uit de toekomstige **LOQ desktop app**. Ieder geldig opgeslagen, handmatig geselecteerd gebouw krijgt een actie om de eigen actuele gepubliceerde plattegrond te openen. Als deze ontbreekt, toon exact: **Voeg een plattegrond toe via de LOQ desktop app.**

Neem de lokale wijzigingen uit deze feature over en publiceer de benodigde webcomponenten, API-actie en entiteitsuitbreiding samen. Bouw in deze opdracht geen desktop app, tekeneditor, uploadscherm of desktop-publicatie-API. De melding verwijst naar de toekomstige app; zij bewijst niet dat die app al beschikbaar is. GitHub-synchronisatie alleen is geen bewijs van Base44-publicatie.

## Relevante onderdelen

- `src/components/objects/ObjectMapTab.jsx`: context, gebouw openen vanuit opgeslagen overzicht en alleen-lezenkaart.
- `src/components/objects/ObjectMapOverview.jsx`: actie per geldig opgeslagen gebouw; behoud inventarisgegevens en terreinweergave.
- `src/components/objects/ObjectMapCanvas.jsx`: klik op geselecteerd gebouw in de alleen-lezenkaart; bestaande selectie en editorbediening behouden.
- `src/components/objects/objectMapWorkflow.js`: serverlijst `building_floor_plan_selection_keys` behouden bij configuratie inlezen; nooit client-side sleutelrechten afleiden.
- `src/components/objects/objectBuildingFloorPlanWorkflow.js`: uitsluitend toegestane serverkeys gebruiken, begrensde tekengegevens en API-aanroep.
- `src/components/objects/ObjectBuildingFloorPlanDialog.jsx`: geladen, leeg, fout en beschikbare plattegrond weergeven; uitsluitend bekijken.
- `src/components/customers/customerDossierUtils.js`: herken de nieuwe leesactie bij afhandeling van oudere/pinned functieversies.
- `src/lib/managedFiles.js` en de bestaande veilige bestandsviewer: geautoriseerde ManagedFile-preview voorbereiden en tijdelijke blob-URL opruimen.
- `base44/functions/customerPlatformApi/entry.ts`: actie `get_object_building_floor_plan`, bestaande klant/object/BV-autorisatie en beperkt antwoord.
- `base44/entities/ObjectFloorPlan.jsonc`: optioneel nullable `building_selection_key`.
- `base44/functions/mobileApi/entry.ts` en `src/components/objects/ObjectFloorPlanTab.jsx`: houd de bestaande objectbrede plattegrondflow gescheiden van records met een gebouwkoppeling.

De overdracht voor de volgende desktop-chat staat in `docs/development/loq-desktop-building-floorplans.md`.

## Gevraagde werking

1. Open de plattegrond via de gebouwactie in de inventaris en via een klik op het geselecteerde gebouw in **Weergeven op kaart**. De actie mag geen selecties, namen, terrein, kaartrevisie of plattegrond wijzigen.
2. Gebruik uitsluitend keys uit `get_object_map_configuration.configuration.building_floor_plan_selection_keys`. Deze serverlijst bevat unieke, stabiele sleutels in de veilige **expliciet opgeslagen handmatige** selectie: `bag:<pdok-feature-id>`, `point:<eigen-selectiepunt-id>` of `manual:<opgeslagen-local-id>`. De server controleert zowel de ruwe opgeslagen selectie als de veilig genormaliseerde selectie. Reconstrueer rechten niet uit gesaneerde geometrie, weergegeven modus of tabelkeys: normalisatie kan een modus afleiden of synthetische IDs toevoegen. Een ontbrekende lijst betekent geen toegestane gebouwactie. Gebruik geen tijdelijke Mapbox-ID, naam, nabijheid, adres of lijstpositie als koppeling. Een legacy contour zonder eigen stabiel ID krijgt geen gebouwplattegrondactie; `manual:legacy-<index>` is alleen een tabelsleutel.
3. Geef automatische BAG-indicaties, historische contouren in automatische modus en niet-opgeslagen selecties geen plattegrondactie. Sla nieuwe selecties eerst via de bestaande kaartflow op.
4. Vraag alleen de gepubliceerde actuele plattegrond voor exact `(object_id, building_selection_key)` op. Een objectbrede legacy plattegrond zonder sleutel is geen fallback voor een gebouw. Toon bij `floor_plan: null` de voorgeschreven desktopmelding.
5. Toon titel en revisie met de beschikbare 2D-weergave. Gebruik een veilige ManagedFile-preview bij `preview_2d_file_id` en een begrensde alleen-lezentekening voor ondersteunde `floorplan_2d_json`-geometrie. Accepteer voor JSON uitsluitend `unit: "m"`, geldige kamerpolygonen en geldige muur-/openingseindpunten. Behoud de native positieve Y-as naar boven door alleen de SVG-weergave te spiegelen; wijzig de broncoördinaten niet. Ongeldige of te grote ondersteunde arrays blokkeren de JSON-weergave als geheel: knip/filter geen stille gedeeltelijke tekening. Ruwe bestands-URL's zijn geen fallback. Een bestaand record zonder bruikbare weergave krijgt een eigen melding; een API-/bestandsfout mag niet als ontbrekende plattegrond worden gepresenteerd.
6. Maak laden en veilig opnieuw proberen herkenbaar. Wis de vorige gebouwinhoud bij wisselen van gebouw/object en voorkom dat een vertraagd antwoord de verkeerde plattegrond toont. Ruim voorbereide previews op bij wisselen of sluiten.
7. Behoud de bestaande kaarteditor: klikken om te selecteren/deselecteren, namen, terrein, camera, hover en versiecontrole werken zoals voorheen. Gebouwopenen hoort bij de opgeslagen alleen-lezencontext, niet bij een onopgeslagen editorselectie.

## Leescontract

Vraag eerst de bestaande geauthenticeerde kaartconfiguratie op. Kies de key uitsluitend uit de door de server geleverde lijst; ontbrekend of leeg is niet selecteerbaar:

```js
const { configuration } = await invokeCustomerPlatformRead({
  action: "get_object_map_configuration",
  customer_id: "customer-123",
  object_id: "object-456"
});
const selectableKeys = configuration.building_floor_plan_selection_keys || [];
// Presenteer alleen opgeslagen gebouwrijen waarvan row.key in selectableKeys staat.
// Gebruik de gekozen row.key voor onderstaande leesactie.
```

De configuratie bevat bijvoorbeeld `"building_floor_plan_selection_keys": ["point:gebouw-uuid"]`. Bij onveilige/automatische configuratie, ontbrekende expliciete handmatige modus of alleen tijdens normalisatie toegekende legacy IDs is deze lijst `[]`. De gebouwleesactie gebruikt dezelfde servercontrole. Het eigen plattegrondleesantwoord blijft ongewijzigd:

```js
base44.functions.invoke("customerPlatformApi", {
  action: "get_object_building_floor_plan",
  customer_id: "customer-123",
  object_id: "object-456",
  building_selection_key: "point:gebouw-uuid"
});
```

Het antwoord heeft de bestaande functie-envelope en als data:

```json
{
  "customer_id": "customer-123",
  "object_id": "object-456",
  "building_selection_key": "point:gebouw-uuid",
  "floor_plan": {
    "id": "floorplan-789",
    "object_id": "object-456",
    "building_selection_key": "point:gebouw-uuid",
    "revision": 1,
    "title": "Hoofdgebouw",
    "source": "loq_desktop",
    "status": "published",
    "is_current": true,
    "published_at": "2026-10-09T10:00:00Z",
    "preview_2d_file_id": "managed-file-2d",
    "preview_2d_download_filename": "hoofdgebouw-revisie-1.png",
    "floorplan_2d_json": null
  }
}
```

Dit is fictieve voorbeelddata; `source` is een voorbeeldlabel, geen al geïmplementeerde desktop-publicatieroute. Zonder actuele publicatie is `floor_plan` `null`. Het gebouwantwoord bevat geen USDZ-/RoomPlan-assets, ruwe download-URL's, sleutelmateriaal of volledige metadata. `floorplan_2d_json` wordt gesaneerd; preview-toegang blijft via de bestaande ManagedFile-autorisatie lopen.

De server controleert eerst de bestaande klant/object/BV-scope en dan de exacte gebouwselectie. Een ontbrekende, onveilige of niet langer geselecteerde sleutel geeft een herkenbare fout; `409 building_selection_unavailable` vraagt om herladen/opnieuw selecteren. Meer dan één actuele gepubliceerde record voor hetzelfde gebouw geeft `409 building_floor_plan_ambiguous`. Kies bij ambiguïteit niet stilzwijgend het hoogste revisienummer.

## iOS en bestaande records

`building_selection_key` is optioneel en mag ontbreken of `null` zijn bij bestaande objectbrede plattegronden; een historisch lege string wordt ook als legacy behandeld. Migreer zulke records niet automatisch naar een gebouw. De bestaande mobiele objectbrede `get`/`publish` en objectplattegrondsamenvattingen gebruiken alleen die ongekoppelde legacy records. De oude objectbrede publicatie wist geen `is_current`-status van gebouwgebonden plattegronden en wijst een aangeleverde gebouwkey expliciet af. De objectbrede webtab houdt dezelfde scheiding.

Deze voorbereidende uitbreiding vereist geen native iOS-scherm of desktop app. Voor later gebouwgericht openen/publiceren in iOS is een afzonderlijke scoped API-/Swift-uitbreiding nodig. Laat bestaande `floorplan_id`/`floorplan_revision`-referenties in beveiligingsplannen en routes intact.

## Acceptatie en verificatie

- Twee opgeslagen gebouwen openen elk hun eigen record; geen vermenging bij hetzelfde label of snelle opeenvolgende klikken.
- BAG-selectie, eigen selectiepunt en stabiele legacy contour werken uitsluitend met een serverkey; automatische indicaties, niet-opgeslagen selecties, afgeleide handmatige modus en positionele/synthetische legacy keys worden niet aangeboden of geaccepteerd. Ontbrekende whitelist geeft geen client-side fallback.
- Een gebouw zonder gepubliceerde actuele record toont **Voeg een plattegrond toe via de LOQ desktop app.** Ook met een bestaande objectbrede plattegrond blijft deze melding correct.
- Concept, archief, andere objecten/klanten/BV's, ongeldige sleutels en meer dan één current publicatie leveren geen onbedoelde plattegrond op.
- ManagedFile-toegang blijft geautoriseerd; alleen de juiste 2D-preview wordt geopend. Geen raw-URL-fallback of bestandsinhoud in audit/recovery.
- Geldige ondersteunde 2D-JSON toont kamers/muren/openingen met dezelfde Y-oriëntatie als native; andere eenheden, ongeldige/lege geometrie en te grote ondersteunde arrays verschijnen als niet beschikbaar, zonder stille gedeeltelijke tekening of vastlopen.
- Alleen-lezen openen veroorzaakt geen writes. Editorselectie, camera, namen, terrein, hover en opgeslagen gebouwmarkering blijven bruikbaar.
- Legacy iOS `get`/`publish`/samenvattingen en de objectbrede webtab mengen geen gebouwrecords en verwijderen geen gebouwpublicatie.
- Voer gerichte component-, workflow-, backendcontract- en mobiele contractregressies uit, plus eslint en webbuild. Controleer na Base44-publicatie met een geauthenticeerd echt object de lege toestand en een bewust aangeleverde geldige gebouwplattegrond. Een lokale fixture bewijst geen live uitrol.

Desktop-publicatie blijft vervolgwerk. Voeg geen ad-hoc clientwrites naar `ObjectFloorPlan` toe om de ontbrekende publicatie-API te omzeilen. Ontwerp die later met dezelfde scope, expliciete schrijfrechten, ManagedFile-validatie, revisies per gebouw, conflictcontrole en idempotent/atomair publiceren volgens de desktopoverdracht.

## Lokale controle op 9 oktober 2026

375 tests in 11 gerichte bestanden slagen; gewijzigde frontendbestanden slagen voor eslint; diffcontrole en Vite-build slagen. De gebouwactie, lege toestand en begrensde volledige 2D-weergave zijn lokaal visueel bekeken met fictieve gegevens. De build waarschuwt dat lokale Base44-app-/proxyvariabelen ontbreken. De code is lokaal aangepast, zonder commit, push of Base44-publicatie; voer de hierboven beschreven geauthenticeerde productiecontrole pas na publicatie uit.
