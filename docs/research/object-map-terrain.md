# Kaart & terrein: eigen gebouwselecties en perceelstartpunten

Implementatie en broncontrole: 6 september 2026.

## Gebouwen

De gebruiker klikt echte Mapbox Standard-gebouwen aan. BAG-matches blijven server-gevalideerde BAG-contouren met stabiele bron-ID's. De knoppen voor zelf tekenen/bewerken van gebouwcontouren zijn verwijderd; eerder opgeslagen contouren blijven behouden en verwijderbaar.

Zonder eenduidige BAG-match bewaren we geen Mapbox-geometrie, centroid, hoogte, begrenzingsvak of tijdelijk feature-ID. We bewaren een eigen gebruikersannotatie:

```json
{
  "id": "eigen-loq-uuid",
  "source": "user_selected",
  "provider": "mapbox",
  "bag_status": "unlinked",
  "longitude": 4.48,
  "latitude": 51.92
}
```

Dit is de letterlijk aangeklikte locatie, niet een berekend punt uit Mapbox-geometrie. De UI noemt dit **Zonder BAG-koppeling**, niet **geen BAG-gebouw**: ontbrekende of ambigue matching bewijst niet dat BAG het gebouw niet bevat. Bij perspectiefverschil schakelt de kaart naar bovenaanzicht en vraagt een tweede klik. Een punt moet strikt in één unieke zichtbare gebouwcontour liggen; randen, gaten en ambigue overlap worden niet stilzwijgend gekoppeld. Dubbele identieke kaarttiles tellen als één gebouw. Na kaartverversing worden contouren opnieuw opgevraagd en vergeleken, zonder nabijheidsfallback. Gewijzigde brongeometrie kan een nieuwe gebruikerscontrole nodig maken.

`SurveillanceObject.building_selection_points` staat los van `building_polygon_geojson`. Automatisch bepalen wist expliciete selecties; een lege handmatige selectie blijft bewust leeg. De server normaliseert herkomst, ID, coördinaten, duplicaten, afstand en payloadgrootte. Het gezamenlijke maximum voor contouren en punten is 100. Punten lopen mee in configuratiehash, revisiehistorie, versiecontrole, idempotent herstel en mobiele synchronisatie. Audit/recovery bevat alleen veilige samenvattingen, geen punten of GeoJSON. Ongeldige selecties gaan naar `needs_review` en worden mobiel niet getoond.

Overlapcontrole kan punten tegen BAG/legacy-contouren of identieke punten controleren. Twee verschillende punten in hetzelfde Mapbox-gebouw zijn server-side niet aantoonbaar zonder de niet-opgeslagen Mapbox-contour. De UI benoemt daarom de beperkte automatische overlapcontrole. Mobiel delen meerdere exact gekoppelde objecten hetzelfde gebouw via de bestaande status-/prioriteit-/object-ID-volgorde.

### Gebouwnamen en aanwijzen

Een rij in de lijst markeert bij aanwijzen of toetsenbordfocus het bijbehorende native gebouw. Als native matching niet beschikbaar is, wordt uitsluitend de opgeslagen eigen BAG/legacy-contour of het eigen selectiepunt benadrukt; er wordt geen nabijgelegen gebouw gegokt. Iedere rij heeft een naamactie. Leegmaken herstelt de standaardnaam. Namen horen bij stabiele selectiesleutels: `bag:<source_feature_id>`, `point:<id>` of `manual:<local_id>`. `building_labels` wordt samen met de hoofdactie opgeslagen, meegenomen in hash/revisie/idempotent herstel en private historie. Maximaal 100 namen van elk 100 tekens; de server normaliseert tekst en weigert sleutels buiten de unieke selectie. Oudere clients zonder dit veld behouden namen van nog geselecteerde gebouwen. Deselecteren verwijdert de naam; ongedaan maken herstelt beide. Logs/recovery bevatten alleen het aantal naamwijzigingen, niet de namen.

### Dubbele selectie en verdwijnende kleur van native gebouwonderdelen

De melding van 6 september 2026, 20:31, leidde tot drie reproduceerbare regressies: verschillende geometrische delen van dezelfde native identiteit konden de blauwe kleur afhankelijk van de verwerkingsvolgorde uitschakelen; een klik in een ander deel kon een nieuw eigen selectiepunt aanmaken; overlappende volledige/geknipte delen werden onterecht als verschillende gebouwen beoordeeld. Dit bewijst een fout in de kaartselectie, niet dat het klantobject dubbel in de database staat.

De backoffice groepeert die delen nu tijdelijk op native identiteit binnen dezelfde import, featureset en namespace. Selectie en kleur worden voor de volledige groep bepaald, ongeacht de volgorde van de delen. Een eerdere BAG- of puntselectie wordt herkend voordat een nieuw punt kan worden toegevoegd. Identieke volledige voetafdrukken kunnen dubbele tiles vertegenwoordigen; alleen overlap of nabijheid is nooit genoeg om andere native identiteiten samen te voegen. De tijdelijke samengestelde geometrie en Mapbox-identiteit verlaten de kaart niet. Het opgeslagen API-contract blijft ongewijzigd.

Meerdere bestaande selecties in hetzelfde gebouw worden niet automatisch gewist of samengevoegd: dat zou namen of legitiem afzonderlijke BAG-panden kunnen verliezen. De gebruiker krijgt een melding en kan de ongewenste selectie gericht uit de lijst verwijderen. Na een stijlherlaad wordt de tijdelijke koppeling opnieuw uit de opgeslagen BAG-contouren/eigen punten opgebouwd. Het betreft een backoffice-reparatie; de native iOS-matcher groepeert puntkoppelingen nog op exacte voetafdrukken. Dezelfde native-identiteitsgroepering bij mobiele puntmarkering en aantikken vraagt een afzonderlijke iOS-aanpassing en build; een webpush wijzigt die code niet.

Verificatie van deze reparatie: 312/312 tests in tien gerichte bestanden, eslint en webbuild geslaagd (de bekende lokale Base44-omgevingswaarschuwing blijft). In de lokale browser met echte Mapbox/PDOK-data is het gemelde gebouw naast de vijver geselecteerd: het hele gebouw kleurde blauw met één lijstregel. Klikken op de andere vleugel verwijderde diezelfde selectie; opnieuw kiezen via de ronde zuidzijde en uitzoomen behield één blauwe selectie. De proef schreef geen productiedata. Tests dekken daarnaast bestaande dubbele records, stijlherladen en ongewijzigde hover-/feature-state die geen nieuwe renderlus mag starten.

## Kaartthema, bediening en labels (6 september 2026)

De werkkaart volgt standaard het opgeloste applicatiethema. Het kaartlichtmenu biedt **App volgen**, **Dag** en **Nacht**, zonder het algemene thema of het objectformulier te wijzigen. Mapbox Standard krijgt `lightPreset` bij constructie en als configuratiewijziging na laden; de stijl wordt niet vervangen. Daardoor blijven dezelfde kaart, camera, selecties en grensbewerkpunten intact. De keuze geldt voor de geopende kaart en wordt niet als objectdata bewaard. Eigen lijnen, vlakken en bewerkpunten gebruiken emissive-strength voor leesbaarheid in de nacht; luchtfotopixels worden niet getint.

Alle camera-acties staan in één uniform paneel rechtsonder boven de bronvermelding. De losse bovenste draaiknoppen en standaard Mapbox NavigationControl vervallen. Kubussen met richtingspijlen onderscheiden de camerabediening van Ongedaan/Opnieuw; de echte formulierhistorie blijft ongewijzigd. Noord boven verandert alleen de richting, niet de kijkhoek. Tijdens luchtfoto/grensbewerking blijven kantelknoppen uitgeschakeld.

Eigen gebouwnamen verschijnen als veilige tekstlabels bij de opgeslagen selectie. BAG/legacy-labels gebruiken een binnenpunt van de eigen contour (geen buitenliggende centroid bij concave vormen of binnenplaatsen); ongelinkte gebouwen gebruiken het eigen selectiepunt. Zonder naam verschijnt bij aanwijzen een herkenbare fallbacknaam. Labels blokkeren geen kaartklikken. Lijsthover en toetsenbordfocus bewegen na 180 ms naar het gekozen gebouw, met behoud van richting en kijkhoek. Snelle hoverwisselingen annuleren de vorige aanvraag; hernoemen of een gewone render mag niet opnieuw vliegen. Grensbewerking schakelt dit tijdelijk uit. Namen, selectiecontracten en mobiele synchronisatie blijven ongewijzigd; er is geen native iOS-update voor deze webweergave.

Verificatie: 352/352 tests in twaalf gerichte bestanden, gewijzigde runtimebestanden zonder eslint-fouten en webbuild geslaagd. De bekende lokale Base44-app-/proxyomgevingswaarschuwing blijft, geen live API-proef. Tests omvatten ook Mapbox-markerpositioneringsklassen, veilige tekst, annuleren van camera-animaties en opruimen zodra een kaart verwijderd/vervangen is. Echte onverwachte labelfouten geven een niet-blokkerende melding; normale lifecycle-annulering niet. De uitvoerbare afgebakende Base44-opdracht staat in `docs/base44/object-map-appearance-update.md`.

Een verse lokale browserproef met echte Mapbox/PDOK-gegevens bevestigde: applicatie donker → nachtkaart; kaartkeuze Dag → dagkaart terwijl de app donker bleef, met hetzelfde canvas en dezelfde camera. BAG-pand 0246100000012576 kreeg lokaal de naam Receptie, zichtbaar als correct gepositioneerd kaartlabel. Na wegschuiven bracht aanwijzen van de lijstregel de camera naar dit gebouw (zoom 17 → 18, richting −12° en kijkhoek 42° behouden). Terug naar App volgen herstelde de nachtkaart zonder verandering van camerastand, gebouwselectie of label. Er is geen productieobject bijgewerkt; push is geen Base44-publicatie.

## Terrein

- Klikken op een PDOK BRK-perceel voegt dit direct toe; klikken op het actuele groene terrein verwijdert dat deel. Er is geen aparte **Perceel kiezen**-knop. **Zelf tekenen** is verwijderd. Bestaande terreinen blijven behouden, bewerkbaar en verwijderbaar.
- **Grens aanpassen** blokkeert perceelselectie totdat de gebruiker **Klaar met aanpassen** kiest. De volledige oorspronkelijke contour blijft intact, zonder automatisch zichtbare bewerkpunten. Klik op een grenssegment om daar een punt in te voegen; klikken vlak bij een bestaand hoekpunt maakt dat punt bewerkbaar. Alleen deze aangewezen punten worden getoond. Versleep een punt om de grens te wijzigen. Rechtermuisknop op een punt opent **Punt verwijderen**; een ring behoudt minimaal drie hoekpunten. Ongeldige, zelfdoorsnijdende grenzen worden niet toegepast. Ongedaan/opnieuw werkt voor selectie, grensbewerkingen en namen.
- Alleen de huidige terreincontour krijgt groene vulling. Bronpercelen zijn neutrale lijnen zonder vulling, ook na grensaanpassing. Een klik op een bronperceel buiten een verkleinde actuele grens herstelt het volledige bronperceel; een klik binnen de actuele grens verwijdert die selectie.
- **Gebouwen / Terrein** gebruikt dezelfde kaartinstantie, positie, zoom en kijkhoek. Terrein opent niet automatisch als luchtfoto. **Luchtfoto** is optioneel; een gekozen terreinweergave blijft onthouden bij terugkeren. De aparte knop **Bovenaanzicht** is verwijderd. Grensbewerking en luchtfoto schakelen tijdelijk naar een vlakke camera voor nauwkeurige grondcoördinaten. Daarna herstelt de eerdere kijkhoek, zonder locatie- of zoomreset. De luchtfoto ligt boven de Mapbox-ondergrond en onder de LOQ-terreinlagen, zodat native gebouwen het beeld niet bedekken.
- Vier kaartknoppen draaien links/rechts en vergroten/verkleinen de 3D-kijkhoek. Rechtermuisknop-slepen draait horizontaal en kantelt verticaal; Ctrl-slepen is eveneens beschikbaar. Kantelen is alleen tijdens vlakke grensbewerking/luchtfoto geblokkeerd. De lokale navigatiegrenzen blijven gelden.
- De dubbele knop **Passend tonen** naast Opslaan is verwijderd; de kaartinterne knop blijft beschikbaar. De schakelaar **Mobiele kaart** is verwijderd. Iedere expliciete opslag past de configuratie ook mobiel toe bij de volgende synchronisatie. Eerder verborgen objecten blijven bij openen ongewijzigd, maar kunnen met Opslaan worden geactiveerd. De servercontrole op gedeelde gebouwen, versieconflicten en ongeldige locaties blijft intact.
- **Lokale kaartgrens** beperkt uitzoomen en verschuiven tot circa 1 km rondom de bevestigde objectlocatie. Bestaande of afgesloten terrein-/gebouwcontouren en selectiepunten binnen de serverlimiet van 5 km kunnen dit gebied met 150 m marge vergroten. Onvoltooide tekeningen en kandidaatfeeds verruimen de navigatiegrens niet. De kaart gebruikt expliciet Mercator met `maxBounds`, zodat ook de minimale zoom aan de schermgrootte wordt aangepast; wereldkopieën staan uit. Dit is belangrijk: in de standaard Globe-projectie begrenst Mapbox alleen het kaartmiddelpunt, niet het volledige beeld. De browsercontrole ving dit verschil ondanks geslaagde componenttests. Een onbevestigd adres toont alleen een begrensd Nederland-overzicht, zonder teken- of selectieacties. Dit beperkt het bekijken/laden van verre tegels, maar is geen meting of garantie van CPU-winst.

De luchtfoto komt uit de PDOK actuele orthofotolaag. Een kadastraal perceel bewijst geen eigendom, toegang of bewakingsopdracht; de gebruiker moet de operationele grens controleren. Geïmporteerd terrein blijft `source: user_drawn` met optionele `derived_from: pdok_brk` en `derived_from_id`. Deze herkomst is geen claim dat de bewerkte grens nog exact kadastraal is.

`customerPlatformApi.list_object_parcel_candidates` gebruikt dezelfde klant-/objectscope en gecontroleerde locatie als BAG-kandidaten. Alleen voor percelen is de standaard/maximale zoekstraal 1.000 m (BAG blijft ongewijzigd). De server haalt maximaal 100 resultaten per pagina op, begrenst responstijd/grootte, saneert bronvelden en accepteert alleen vervolgcursors voor exact dezelfde PDOK-query. De UI laadt maximaal twintig pagina's automatisch; bij meer resultaten is een expliciete vervolgactie beschikbaar. Cursorlussen stoppen met een melding in plaats van onvolledige dekking stilzwijgend als compleet te tonen. Bij bronuitval blijven opgeslagen selecties en terreinen intact.

### Ontbrekend perceel Heerde C 4979

De oude zoekstraal van 250 m rond het Wapenveld-adres leverde op 6 september 2026 precies 44 percelen zonder vervolgpagina. Het gevraagde zuidelijke perceel viel buiten die query. Bij 500 m werden 213 percelen gevonden inclusief Heerde C 4979; bij 1.000 m 693 percelen over zeven pagina's, zonder overgeslagen geometrieën. Het ontbrekende perceel heeft PDOK-feature-ID `410b827b-e3b6-5bb2-a420-b8ebbf576a5c` en een bronoppervlakte van 24.500 m². De reparatie verruimt zowel server- als browserroute en haalt vervolgpagina's automatisch op. De kaart blijft lokaal begrensd: dit is geen onbeperkte landelijke download.

### Controle melding 503 en herstelgedrag

De gemelde historische referentie `7026b7a0-8492-49d7-96ee-7ee897a6fd73` kon zonder de bijbehorende productie-serverlog niet exact worden herleid. Op 6 september 2026 slaagt de volledige perceelhandler lokaal met een in-memory klant/objectscope en echte PDOK-data voor het eerder getoonde adres in Wapenveld: 44 percelen, 0 overgeslagen geometrieën en geen vervolgpagina. Ook een echte gepagineerde Rotterdam-query en de strikte vervolglinkcontrole slagen. Dit bewijst geen succesvolle productieaanroep van Base44 en geen blijvende oplossing van een niet-gereproduceerde externe storing.

De generieke foutmelding was wel reproduceerbaar: de publieke API maskeerde iedere 5xx als `Klantplatformactie mislukt`. Bekende perceelfoutcodes krijgen nu een veilige, specifieke uitleg. Er zijn maximaal twee serverpogingen voor tijdelijke netwerk-/timeout-/HTTP408/429/5xx-fouten binnen een netwerkbudget van acht seconden. Ongeldige JSON, te grote antwoorden en overige HTTP4xx-fouten worden niet automatisch herhaald. Diagnostiek bevat alleen foutsoort, pogingenaantal en eventuele bronstatus; geen URL met coördinaten. De browser verdubbelt uitgeputte serverpogingen niet, laat bron-/scopefouten herkenbaar en biedt handmatig opnieuw laden. Eerder geladen percelen en opgeslagen terrein blijven beschikbaar. Perceeluitval blokkeert bewerken of opslaan van bestaand terrein niet.

De latere referentie `525dea7c-2c3a-44fe-86a7-e735f8cc6243` meldt opnieuw `pdok_parcel_unavailable`. De exacte OGC-query werkt buiten Base44 met CORS-toestemming voor een browseraanvraag. Zonder productie-log is een specifieke runtime-/netwerkoorzaak niet bewezen; de melding beweert daarom niet langer dat PDOK zelf algemeen buiten dienst is.

Bij uitsluitend een geclassificeerde tijdelijke PDOK-verbindingsfout gebruikt de webapp nu een tweede route: publieke perceelgegevens rechtstreeks bij dezelfde vaste PDOK OGC-bron ophalen. Eerst voert zij een verse `get_object_map_configuration` uit via de bestaande geauthenticeerde klant-/objectscope. Object-ID, klant-ID en de bevestigde opgeslagen locatie moeten kloppen. Scopefouten, onbekende platformfouten en ongeldige brondata activeren deze route niet. Elke vervolgpagina controleert opnieuw de scope en locatie; een verplaatst object vraagt om herladen in plaats van perceelpagina's te vermengen. Vervolgpagina's onthouden de werkende verbinding en wachten niet telkens opnieuw op een falende serverroute.

De directe openbare aanvraag verstuurt geen Base44-credentials, cookies of referrer. Host/pad zijn vast, radius is maximaal 1.000 m, redirects worden geweigerd, een pagina maximaal 100 objecten, responstijd maximaal 8 seconden en streamingpayload maximaal 5 MB. Paginering accepteert uitsluitend dezelfde query met een nieuwe strikt gevalideerde cursor. Bronvelden en GeoJSON worden gesaneerd en begrensd op type, sluiting, zelfdoorsnijding, WGS84, afstand, punten en oppervlakte. Opslaan blijft via de bestaande servervalidatie voor gebruikers-terrein lopen; deze leesroute verleent geen autoriteit aan clientgeometrie. Bij uitval van beide verbindingen blijft bestaand terrein bewerkbaar, met veilige diagnostiek en de oorspronkelijke serverreferentie.

Terrein wordt alleen meegestuurd voor relevante routetaken. Automatische terreinactivering wordt niet geïmplementeerd.

## Verificatie en uitrol

Gerichte webtests dekken punten, percelen, bronuitval, scopes, revisies, herstel, privacy van logs, kaartwisseling, aangepaste bewerkpunten, namen, hover/focus en automatische paginering. De lokale browsercontrole gebruikt echte Mapbox-gebouwen en PDOK-luchtfoto/percelen, met uitsluitend lokale opslag voor het testobject. Dit is geen productieproef.

De oorspronkelijke herstelroute is in de browser beproefd met een bewust falende lokale appserver (`pdok_parcel_unavailable`, 503). Bij de uitgebreide controle werden via de echte publieke PDOK-bron automatisch 693 Wapenveld-percelen opgehaald. Wisselen tussen Gebouwen, Terrein en Luchtfoto gebruikt één kaartcanvas. Er blijft precies één kaartinterne knop Passend tonen over, zonder Bovenaanzicht-knop of mobiele-kaartschakelaar. Transporttests omvatten uitval van de directe verbinding, privacy, paginering en geometriegrenzen. Voor deze uitbreiding wijzigen ook de backend en beide kaartentiteiten voor grotere perceeldekking en gebouwnamen. De historische productiefout is niet rechtstreeks geverifieerd.

De vervolgcontrole omvat 301 geslaagde tests over tien gerichte bestanden, eslint zonder fouten en een geslaagde Vite-build. De build meldt ontbrekende lokale Base44-app/proxyomgevingsvariabelen en is geen live API-verificatie. In de lokale browser is het grote zuidelijke perceel op de luchtfoto toegevoegd, verwijderd en opnieuw gekozen. Grensbewerking toonde eerst geen stippen; een grensklik maakte één stip. Een native gebouw zonder BAG-koppeling kreeg de naam Opslagloods, lijstfocus benadrukte het gebouw en lokale opslag behield naam en terrein met revisie 1. Camera-acties veranderden richting en kijkhoek met behoud van positie en één canvas. Slepen, rechtsklikverwijdering, minimumringen en invaliditeitsbewaking zijn daarnaast met component-/geometrietests gecontroleerd. Een regressie met 6.000 punten bewaart alle oorspronkelijke contourpunten en gebruikt lineaire controle van de gewijzigde segmenten tijdens slepen.

Publiceer zowel `customerPlatformApi` als `mobileApi` en de entiteitswijzigingen samen met de webupdate in Base44. Een oude backend kent de nieuwe perceelactie/puntopslag nog niet. Een nieuwe native iOS-build is nodig voor puntselecties; de Swift-wijzigingen staan in de aparte lokale Xcode-workspace, niet in deze Git-repository. Nieuwe geometrievelden worden standaard leeg gehouden voor bestaande objecten.

Voor alleen deze vervolguitbreiding (bediening, perceeldekking en namen) zijn er geen nieuwe Swift-wijzigingen. De bestaande mobiele kaart blijft de selecties gebruiken; naamwijzigingen veranderen hash/revisie en verversen daarmee de cache. Namen in een native UI tonen valt buiten deze wijziging.

## Primaire bronnen en ontwerpkeuze

- [Mapbox Standard configuratie en featuresets](https://docs.mapbox.com/map-styles/reference/standard/)
- [Native gebouwen selecteren en highlighten](https://docs.mapbox.com/mapbox-gl-js/example/highlight-buildings-standard/)
- [Mapbox lokale kaartbegrenzing](https://docs.mapbox.com/mapbox-gl-js/example/restrict-bounds/)
- [Mapbox muis- en aanraakbesturing](https://docs.mapbox.com/mapbox-gl-js/guides/user-interactions/gestures/)
- [Mapbox Product Terms](https://www.mapbox.com/legal/product-terms)
- [Mapbox Streets: tijdelijke feature-ID's](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/#ids)
- [PDOK BRK-percelencollectie](https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel?f=html)
- [PDOK Kadastrale kaart](https://www.pdok.nl/introductie/-/article/kadastrale-kaart)
- [PDOK luchtfoto RGB Open](https://www.pdok.nl/introductie/-/article/pdok-luchtfoto-rgb-open-)

Architectuurkeuze op basis van deze bronnen: behandel Mapbox-features als tijdelijke weergavegegevens, bewaar uitsluitend eigen klikannotaties voor ongekoppelde gebouwen en gebruik open PDOK-bronnen voor persistente contouren en terreinwerk. Dit voorkomt dat de feature afhankelijk wordt van opslag van Mapbox-content of stabiele Mapbox-feature-ID's; het is geen algemene juridische beoordeling van andere toepassingen.
