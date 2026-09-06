# Base44-opdracht: kaartbediening, complete lokale percelen en gebouwnamen

## Doel

Pas alleen Objectkaart → Kaart & terrein en de bijbehorende kaartconfiguratie aan. Behoud de bestaande object-/klant-/BV-scope, versiecontrole, idempotency, locatiebeoordeling en mobiele geometriecontracten. Raak planning, CAO en andere modules niet aan. Implementeer de wijziging uit deze lokale patch of neem onderstaande specificatie over.

## Relevante onderdelen

- `src/components/objects/ObjectMapTab.jsx`: formulier, lijst, namen, terreinacties, historie en paginering.
- `src/components/objects/ObjectMapCanvas.jsx`: native Mapbox-highlights, kaartcamera, perceelkleuren, klikken en grensbewerkpunten.
- `src/components/objects/objectMapBoundaryEditor.js`: behoud van oorspronkelijke contouren, invoegen/verplaatsen/verwijderen en lokale validatie.
- `src/components/objects/objectMapParcelTransport.js` en `objectMapWorkflow.js`: begrensde openbare PDOK-herstelroute en API-contract.
- `base44/functions/customerPlatformApi/entry.ts`: `list_object_parcel_candidates`, `get_object_map_configuration`, `update_object_map_configuration`, hash/revisie, veilige audit en herstel.
- `SurveillanceObject` en `ObjectMapGeometryRevision`: optioneel `building_labels`-object, standaard `{}`.

## Exact gedrag

1. Zoek BRK-percelen standaard/maximaal binnen 1.000 meter van de bevestigde objectlocatie, zowel server-side als in de bestaande browserherstelroute. Laat de BAG-zoekstraal ongewijzigd. Haal vervolgpagina's automatisch op, maximaal twintig per automatische laadronde. Toon daarna zo nodig een expliciete vervolgknop. Stop cursorlussen met een herkenbare melding; toon gedeeltelijke dekking niet als volledig.
2. Verwijder de knoppen Zelf tekenen en Perceel kiezen. In Terrein voegt een klik op een bronperceel dit direct toe. Een klik binnen het actuele groene terrein verwijdert dat deel. Maximaal 25 terreindelen; oude opgeslagen terreinen blijven behouden. In Grens aanpassen is perceelselectie tijdelijk uitgeschakeld. Klaar met aanpassen herstelt het klikken.
3. Geef uitsluitend de actuele terreinselectie groene vulling. Bronpercelen hebben neutrale, op luchtfoto leesbare lijnen zonder vulling. Een eerder gekozen bronperceel mag na verkleining niet buiten de actuele grens groen blijven. Klikken buiten de verkleinde grens maar binnen het oorspronkelijke bronperceel herstelt dat volledige bronperceel.
4. Toon bij Grens aanpassen niet automatisch alle hoekpunten. Bewaar de volledige oorspronkelijke geometrie. Klik op een grenslijn om een bewerkpunt in te voegen, of klik dicht bij een bestaand hoekpunt om dat punt zichtbaar/bewerkbaar te maken. Versleep alleen zulke punten. Rechtermuisknop opent een menu met Punt verwijderen. Houd ringen gesloten, minstens drie hoekpunten en blokkeer zelfdoorsnijding/ongeldige gaten. Geen automatische contourvereenvoudiging. Bewerk grote percelen zonder iedere muisbeweging alle segmentparen opnieuw te vergelijken. Undo/redo en de bestaande niet-opgeslagen navigatiewaarschuwing blijven werken.
5. Behoud één kaartinstantie bij wisselen tussen Gebouwen en Terrein. Voeg links/rechts draaien en twee 3D-kijkhoekknoppen toe. Ondersteun rechts-slepen/Ctrl-slepen en bestaande zoom/pan-gebaren. Tijdens luchtfoto/grensbewerking blijft de camera tijdelijk vlak; daarna herstelt de kijkhoek. Behoud lokale kaartgrenzen en geen wereldkopieën. Voeg geen Bovenaanzicht- of Mobiele kaart-knop opnieuw toe.
6. Aanwijzen of toetsenbordfocus van een gebouwrij benadrukt het juiste native gebouw. Als die koppeling niet betrouwbaar beschikbaar is, benadruk alleen de opgeslagen eigen contour of het eigen selectiepunt; geen nabijheidsfallback.
7. Voeg per gebouw een naamactie toe. Leegmaken herstelt de standaardnaam. Verwerk namen in dezelfde hoofdactie Opslaan en toepassen. Deselecteren verwijdert een naam, ongedaan maken herstelt beide. Geen extra automatische externe opslag tijdens typen.

## Namencontract

```js
building_labels = {
  'bag:<stabiele_pdok_feature_id>': 'Hoofdgebouw',
  'point:<eigen_selectiepunt_id>': 'Opslagloods',
  'manual:<bestaande_local_id>': 'Bestaande contour'
};
```

De server accepteert alleen sleutels die bij exact één gekozen gebouw horen. Maximaal 100 namen, elk maximaal 100 tekens; normaliseer NFC, controltekens, witruimte en bidirectionele tekstbesturing. Lege waarden verwijderen namen. Automatisch bepalen levert een lege namenlijst. Als een oudere client `building_labels` weglaat, behoud dan namen voor nog geselecteerde gebouwen. Neem namen mee in hash, revisie, `expected_version`, idempotent replay en private revisiehistorie. Andere objectwijzigingen moeten de namen behouden. Algemene logboek-/recoverypayloads bevatten uitsluitend `building_name_changes` als aantal, geen naamtekst of ruwe geometrie.

## Mobiele impact

Geen nieuwe Swift-aanpassing voor deze vervolguitbreiding. De bestaande mobiele synchronisatie behoudt gebouwselecties/terreinen en ontvangt de gewijzigde hash/revisie voor cacheverversing. Namen tonen in de native UI is geen onderdeel van deze opdracht. Automatisch starten van taken binnen een terrein blijft buiten scope. Persisteer geen Mapbox-feature-ID's of Mapbox-geometrie.

## Acceptatie en uitrol

- Wapenveld, Ir. R.R. van der Zeelaan 1: Heerde C 4979 (PDOK-ID `410b827b-e3b6-5bb2-a420-b8ebbf576a5c`, bronoppervlak 24.500 m²) komt terug en is selecteerbaar. De bron gaf op 6 september 2026 44 resultaten bij 250 m en 693 bij 1.000 m; dat aantal kan in de bron veranderen.
- Test automatische vervolgpagina's, cursorlus, bronuitval/behoud, scoping, payload-/geometriegrenzen en archivering.
- Test toevoegen/verwijderen, grens aanpassen, geen automatische stippen, rechtsklikmenu, behoud van alle oorspronkelijke punten, gaten, ongeldige lijnen en undo/redo.
- Test cameraknoppen, kaart-/luchtfotowissel zonder positiereset en lokale navigatiegrenzen.
- Test BAG-, punt- en legacy-gebouwnamen, hover/focus, wissen, bewaren/herladen, oudere clients, conflict/replay en veilige audit.
- Voer gerichte Vitest-tests, eslint en webbuild uit. Publiceer de webwijzigingen, `customerPlatformApi` en de twee entiteitsvelden samen; alleen een GitHub-push bewijst geen Base44-publicatie.
- Verifieer na geauthenticeerde Editor Publish op het echte objectpad dat percelen en namen werken. Een lokale testfixture mag geen productiedata schrijven en bewijst geen live uitrol. Stage uitsluitend deze feature, niet ongerelateerde planningswijzigingen of pnpm-bestanden.

## Vervolgreparatie: één selectie voor meerdere native gebouwonderdelen

Doel: voorkom een extra lijstregel en verdwijnende blauwe markering wanneer op een ander dak-/tiledeel van hetzelfde native Mapbox-gebouw wordt geklikt. Bestanden: `ObjectMapCanvas.jsx` en `ObjectMapCanvas.test.jsx`. Groepeer uitsluitend dezelfde tijdelijke identiteit binnen import/featureset/namespace; bepaal de selectie over alle delen en schrijf per identiteit één consistente kleurstatus. Herken de bestaande BAG- of eigen puntselectie vóór het aanmaken van een nieuw eigen punt. Onderscheid echte overlappende gebouwen en verschillende namespaces; nabijheid is geen bewijs van identiteit. Bewaar bestaande meervoudige selecties en toon lijstinstructies in plaats van ongevraagd data of namen te wissen. Bouw de tijdelijke koppeling na stijlherladen opnieuw op en voorkom ongewijzigde hoverupdates bij iedere idle-gebeurtenis.

Het opslagcontract en de entiteiten wijzigen hierbij niet; Mapbox-identiteit en samengestelde geometrie blijven tijdelijk. Acceptatie: zelfde native ID met afzonderlijke/geknipte/overlappende delen blijft in beide verwerkingsvolgordes blauw, tweede klik op een ander deel schakelt de bestaande selectie uit, BAG-selectie krijgt geen extra los punt, echte ambiguïteit blijft geblokkeerd, lijsthover en stijl-/zoomverversing blijven correct. Test bestaande dubbele selecties zonder automatische verwijdering. Voer gerichte regressies, eslint, webbuild en een veilige lokale browserproef uit. Publiceer de webreparatie via Base44; claim geen mobiele native reparatie of live test op basis van alleen deze push.
