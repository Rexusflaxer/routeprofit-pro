# Base44-opdracht: tabeloverzicht en alleen-lezen kaart

## Doel

Pas uitsluitend Objectkaart → **Kaart & terrein** aan. Open deze objectkaarttab voortaan met een opgeslagen inventaris, niet meteen met de kaarteditor. Gebruik twee tabs: **Gebouwen** en **Terrein**. Toon herkenbare namen, bron, identificatie en oppervlakte. Rechtsboven staan **Weergeven op kaart** en **Wijzigen**. De eerste opent een alleen-lezen kaart; de tweede de bestaande editor. Na succesvol opslaan keert de gebruiker terug naar het overzicht van hetzelfde onderdeel. Behoud alle bestaande selectie-, perceel-, versie- en overlapregels.

## Bestanden en gewenst gedrag

- `src/components/objects/ObjectMapOverview.jsx`: presenteer uitsluitend de opgeslagen configuratie in de bestaande tabelstijl. Gebruikersnamen komen uit `building_labels`; ontbrekende namen krijgen een herkenbare standaardnaam. Houd BAG-panden, eigen selectiepunten zonder BAG en oude contouren apart. Tel gecombineerde/apart geretourneerde contouren niet dubbel. Toon onbekende oppervlakten als **Onbekend**, niet als nul. Terrein krijgt zijn aanwezige naam of **Terreindeel N**, de perceelherkomst en berekende oppervlakte. Maak duidelijk dat een aangepaste terreinbegrenzing niet noodzakelijk gelijk is aan het bronperceel. Automatische gebouwbepaling is geen opgeslagen handmatige selectie: geef dat expliciet aan en laad geen kandidaten voor de tabel.
- `src/components/objects/ObjectMapTab.jsx`: beheer drie lokale schermtoestanden `overview`, `view` en `edit`. Mount de kaart pas bij bekijken of wijzigen. Laad BAG-kandidaten alleen voor bewerken of de automatische indicatie in een viewer; geen kandidaat-/perceelverzoeken bij een tabeloverzicht of handmatige viewer. Handmatige weergave gebruikt de opgeslagen contouren, niet verse nog niet toegepaste kandidaten. **Terug naar overzicht** vraagt bij een vuil formulier via de bestaande navigatiebewaking om blijven, opslaan of wijzigingen verwerpen. Een mislukte opslag blijft in de editor en behoudt de lokale wijzigingen. Gebruik na succesvolle opslag de teruggegeven versie en gegevens voor de tabel en de volgende bewerksessie. Blokkeer selectie-, naam-, grens- en overige mutaties tijdens een lopende opslag, zodat late responses geen tussentijdse wijzigingen verliezen.
- `src/components/objects/ObjectMapCanvas.jsx`: voeg `viewOnly` toe. Bekijken toont gebouwen en terrein samen, inclusief gebouwnamen, zonder selecteer-/verwijder-/tekenacties. Camerabediening, dag/nacht en luchtfoto blijven beschikbaar. Ook achtergebleven tekenprops, grenspuntmenu's of lopende sleepbewegingen mogen niet muteren zodra de kaart alleen-lezen wordt. Wisselen tussen Gebouwen/Terrein of bekijken→wijzigen gebruikt dezelfde kaart. Terug naar overzicht verwijdert de kaart; opnieuw openen volgt weer het app-thema totdat de gebruiker zelf wisselt.
- `src/components/objects/useObjectMapBuildingLabels.js`: gebruik een compacte donker afgeronde capsule, witte stevige tekst en een klein direct aansluitend neerwaarts driehoekje, zoals in de operationele app. Geen pictogrammen en geen lange steel. Behoud de betrouwbare dakankers, lijsthover/focus, camera-annulering, tekstveiligheid en markeropruiming. Een normale blauwe rand en amber aanwijskleur blijven bij de kaartselectie passen.

## Contracten, beveiliging en mobiele impact

Geen nieuwe API-acties, entiteitsvelden, migraties of native iOS-wijzigingen. De bestaande `get_object_map_configuration`, `list_object_building_candidates`, `list_object_parcel_candidates` en `update_object_map_configuration` blijven de enige gegevensroutes. Scope, idempotency, `expected_version`, overlapbevestiging en veilige logs blijven ongewijzigd. Viewer en tabel mogen nooit writes veroorzaken. Gearchiveerde objecten en onbevestigde locaties blijven niet-bewerkbaar; hun opgeslagen inrichting blijft te bekijken. De mobiele app ontvangt wijzigingen via de bestaande synchronisatie; de nieuwe overzichtsschermen en labelvorm zijn alleen webpresentatie.

## Acceptatie

1. Open de tab: opgeslagen tabel met Gebouwen/Terrein, geen kaartcanvas of BAG-/perceelverzoeken.
2. Controleer BAG-panden, eigen punten, legacy-contouren, eigen namen, bewuste lege selectie, automatische modus, terrein, onbekende oppervlakten en doublures.
3. Open **Weergeven op kaart**: alle opgeslagen inrichting zichtbaar, geen bewerkknoppen of selectiewrites; namen boven het juiste gebouw, ook in de terreinweergave.
4. Open **Wijzigen**, wijzig/benoem een gebouw en sla op: terug naar tabel met de nieuwe naam en revisie. Open opnieuw en sla opnieuw op met de nieuwe versie.
5. Test teruggaan met wijzigingen: blijven bewaart het concept; verwerpen toont opgeslagen gegevens; opslaan keert terug. Echte versieconflicten, overlapbevestiging en bron-/opslagfouten blijven herstelbaar zonder conceptverlies.
6. Houd een opslagverzoek tijdelijk open: de gebruiker kan niet verder selecteren of wijzigen totdat het resultaat bekend is. Een alleen-lezen overgang tijdens een sleep- of puntmenuactie kan evenmin muteren.
7. Controleer app-thema bij heropenen, luchtfoto, camerapositie bij tabwisseling, veilige tekstlabels en het kleine pijltje zonder iconen. Voer gerichte tests, lint, webbuild en een lokale browserproef uit.

Stage uitsluitend deze feature; laat planning, native iOS en ongerelateerde pnpm-bestanden ongemoeid. Push naar GitHub is niet hetzelfde als Base44-publicatie. Publiceer de gesynchroniseerde webupdate in Base44 en controleer het echte objectpad voordat live werking wordt geclaimd.
