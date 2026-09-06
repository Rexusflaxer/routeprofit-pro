# Base44-opdracht: kaartthema, uniforme bediening en gebouwnamen op de kaart

## Doel en scope

Pas uitsluitend Objectkaart → Kaart & terrein aan volgens deze webpatch. De kaart volgt standaard het opgeloste applicatiethema (`next-themes.resolvedTheme`). Laat de gebruiker binnen de kaart kiezen voor App volgen, Dag of Nacht. Bundel alle cameraknoppen rechtsonder, maak hun stijl gelijk en voorkom verwarring met de echte formulieracties Ongedaan/Opnieuw. Aanwijzen of toetsenbordfocus van een geselecteerd gebouw in de lijst brengt dat gebouw in beeld. Toon de zelf opgegeven gebouwnaam ook op de kaart.

## Bestanden en gedrag

- `src/components/objects/ObjectMapCanvas.jsx`: geef Mapbox Standard bij constructie de juiste `config.basemap.lightPreset` (`day` of `night`). Pas wijzigingen via `setConfigProperty` toe zonder kaart-/stijlvervanging, camerareset of verlies van selecties, terrein en bewerkpunten. Gebruik de laatste keuze ook wanneer het applicatiethema tijdens laden verandert en na stijl-/importherladen. Schrijf geen ongewijzigde configuratie bij iedere `idle`. Operationele fill-/line-/circle-lagen blijven leesbaar met emissive-strength; de PDOK-luchtfoto behoudt de originele kleuren.
- `src/components/objects/ObjectMapControls.jsx`: één compact uniform paneel rechtsonder boven de kaartattributie, met in-/uitzoomen, passend tonen, noordrichting, links/rechts draaien, twee kijkhoekknoppen en kaartverlichting. Verwijder de losse bovenste cameragroep en standaard Mapbox NavigationControl; er mogen geen dubbele zoomknoppen blijven. Gebruik ruimtelijke richtingssymbolen, geen undo/redo-symbolen. Houd labels, toetsenbordfocus, tooltips en uitgeschakelde kijkhoek tijdens grensbewerking/luchtfoto beschikbaar. App volgen herstelt het actuele applicatiethema; Dag/Nacht wijzigen uitsluitend deze kaart en worden niet als objectwijziging opgeslagen.
- `src/components/objects/ObjectMapTab.jsx`: geef de bestaande `building_labels` door aan het canvas. Behoud de bestaande naamdialoog, opslaan/undo en lijsthover/focus.
- `src/components/objects/useObjectMapBuildingLabels.js`: plaats veilige niet-klikblokkerende naamlabels bij geselecteerde gebouwen met een eigen naam. Gebruik uitsluitend eigen opgeslagen selectiepunten of een punt binnen de BAG/legacy-contour; geen nabijheidsveronderstelling of opgeslagen Mapbox-identiteit. Toon bij aanwijzen ook een herkenbare fallbacknaam als er nog geen eigen naam is. Laat de camera na een korte hoververtraging naar de aangewezen selectie gaan met behoud van richting en kijkhoek. Annuleer snelle tussentijdse hoverwisselingen; voorkom herhaald vliegen bij renders/idle of tijdens grensbewerking. Vernieuw labels bij hernoemen/verwijderen, ruim markers en timers op bij wisselen of sluiten en behandel namen als tekst, nooit als HTML.

## Contracten en mobiele impact

Geen API-, entiteits-, hash-, versie-, scope- of synchronisatiecontract verandert. De bestaande `building_labels` blijft de enige opslag voor namen. De kaartverlichting en camera zijn lokale weergavekeuzes; deze mogen het formulier niet dirty maken of API-writes uitvoeren. Geen nieuwe native iOS-code of automatische terreinactivering. Laat planning, CAO en ongerelateerde pnpm-bestanden buiten de wijziging.

## Acceptatie en uitrol

Test app dag/nacht/systeem, handmatige override en terug naar App volgen, themawijziging vóór laden en stijlherladen, luchtfoto heen/terug, behoud van camera/gebouwselectie/grenspunten, uniforme bediening en één set zoomknoppen. Test hover/focus van BAG-, eigen punt- en legacy-selecties, snelle hoverwisselingen, labelhernoeming/verwijdering, ongeldige coördinaten en tekstveiligheid. Controleer componenttests, eslint en webbuild en doe een lokale browserproef met echte kaartweergave zonder productiedata te wijzigen. Stage alleen deze feature. Push naar de synchronisatiebranch is niet hetzelfde als Base44-publicatie; publiceer de webpatch en controleer vervolgens het echte objectpad voordat je live werking claimt.
