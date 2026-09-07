# Base44-opdracht: gebouwselectie herstellen en terrein onder gebouwen

## Doel en scope

Pas alleen de webweergave van Objectkaart → **Kaart & terrein** aan. Een opgeslagen gebouw zonder BAG-koppeling moet ook na heropenen, zoomen en kaartverversing blauw worden. De groene terreinvulling en grens horen op het maaiveld, onder de 3D-gebouwen. Laat het tabeloverzicht, de bewerkflow en alle opgeslagen gegevens intact.

## Oorzaak en implementatie

In `src/components/objects/ObjectMapCanvas.jsx` dedupliceert de Mapbox Standard-viewportvraag gebouw-ID's. Bij een gebouw over een kaarttegelgrens kan daardoor alleen de andere vleugel terugkomen. Een klik bevat het juiste onderdeel wel; na heropenen ontbreekt juist dat onderdeel. Dit is lokaal met het kruisvormige gebouw naast de vijver in Wapenveld gereproduceerd: de selectie was opgeslagen, maar de geretourneerde geometrie omvatte het eigen aanklikpunt niet.

- Gebruik voor `syncStandardBuildingStates` en de native klikhandler dezelfde `queryStandardBuildingGroups`-route. Haal de zichtbare Standard-gebouwen op en groepeer zoals bestaand. Voor een nog niet gekoppeld, zichtbaar en geldig opgeslagen aanklikpunt: vraag ook de Standard-feature op de geprojecteerde schermpositie op. Neem uitsluitend onderdelen mee die het oorspronkelijke grondpunt strikt bevatten en herbereken daarna de groepen. Behoud de oorspronkelijke viewportresultaten, zodat echte overlap niet verdwijnt. Geen dichtstbijzijnde-gebouwfallback en geen samenvoeging op alleen nabijheid of overlap.
- De aanvullende vraag herstelt het ontbrekende tijdelijke onderdeel. Identieke native identiteit en exacte equivalente contouren volgen de bestaande groeperingsregels. Onbekende of echt dubbelzinnige punten blijven veilig ongekoppeld. Sla Mapbox-geometrie en tijdelijke feature-ID's nooit op.
- Scheid bewezen geometrische associaties van succesvol toegepaste kleurstatus. Onthoud `select`/`highlight` pas nadat de kleurwijziging slaagt. Een tijdelijke fout kan op een volgend kaartmoment opnieuw worden geprobeerd. Herhaal geslaagde, identieke wijzigingen niet: dat zou een render-/idle-lus veroorzaken. Wis beide caches bij nieuwe stijl en opruimen van de kaart.
- Plaats `loq-object-map-terrain-fill` en `loq-object-map-terrain-line` normaal in Mapbox Standard-slot `middle`: boven de wegen en onder de 3D-gebouwen. Bij de platte luchtfoto of grensbewerking gaan alleen deze lagen naar het onbenoemde slot, boven de bestaande luchtfoto. Bij terugkeer naar 3D weer naar `middle`. Wissel uitsluitend als het slot werkelijk verandert. Geen kaart-herbouw, verplaatsing van de camera of geometriewijziging nodig.

Pseudocode: `viewport + strikt_omvattende_puntresultaten → bestaande_native_groepen → unieke_associatie → succesvolle_kleurstatus`. De puntvraag is alleen een tijdelijke kaartvraag, geen nieuwe API-actie.

## Gegevenscontract en iOS

Geen backend-, entiteits-, migratie- of native iOS-wijzigingen. `building_selection_points`, `building_labels`, BAG-contouren, terrein, revisies, scope, idempotency, versiecontrole en veilige logs blijven ongewijzigd. Opnieuw selecteren of opslaan mag niet nodig zijn om bestaande geldige punten te tonen. Alleen-lezen bekijken blijft zonder writes; de mobiele synchronisatie blijft het bestaande contract gebruiken.

## Acceptatie en uitrol

1. Sla een no-BAG-gebouw bij een tegelgrens op; sluit de kaart en open **Weergeven op kaart**. Het hele native gebouw is blauw, de naam blijft aan het juiste gebouw gekoppeld. Herhaal na zoomen en dag/nachtwisseling.
2. Controleer lijstaanwijzing en terugkeer naar blauw, deselectie, tijdelijke kleur-/tegelproblemen, echte overlap en een nabijgelegen maar niet omvattend gebouw. Er mag geen onbedoeld gebouw worden geselecteerd.
3. Toon terrein samen met geselecteerde én niet-geselecteerde gebouwen: alleen de grond is groen. Daken en gevels houden hun eigen kleur. Controleer ook de groene grens in een schuine 3D-weergave.
4. Wissel naar Terrein → Luchtfoto en grensbewerking: terrein en bewerkpunten blijven zichtbaar. Terug naar Kaart herstelt de laag onder gebouwen. Bestaande perceelklik, grensslepen en alleen-lezenbeveiliging blijven werken.
5. Voer de gerichte kaart-, geometrie-, workflow- en contracttests uit, plus eslint en webbuild. Controleer echte 3D-occlusie aanvullend in een browser; een nagebootste kaart in unit-tests bewijst dat niet.

Stage uitsluitend deze fix en tests/documentatie. Laat ongerelateerde planning, iOS en pnpm-bestanden buiten de commit. Publiceer de gesynchroniseerde webupdate in Base44 en controleer daarna het echte objectpad: een GitHub-push alleen bewijst geen live publicatie.

Primaire referenties: [Mapbox Standard slots](https://docs.mapbox.com/map-styles/reference/standard/#slots) en [Mapbox queryRenderedFeatures](https://docs.mapbox.com/mapbox-gl-js/api/map/#map#queryrenderedfeatures). De lokale reproductie en geïnstalleerde SDK bevestigen de tegeldeel-deduplicatie; de slotkeuze volgt de Standard-documentatie.
