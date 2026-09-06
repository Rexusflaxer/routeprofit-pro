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

## Terrein

- **Perceel kiezen** neemt één of meer PDOK BRK-percelen als bewerkbaar startpunt over.
- **Zelf tekenen** blijft voor het operationele terrein beschikbaar.
- **Grens aanpassen** versleept hoekpunten. Ongedaan/opnieuw blijft beschikbaar.
- Klik op het eerste punt of Enter om af te sluiten; Backspace verwijdert het laatste punt en Escape annuleert. Sneltoetsen zijn beperkt tot de gefocuste kaart.
- **Kaart / Luchtfoto** wisselt zonder een nieuwe kaartinstantie, verlies van camerastand of conceptpunten. Terrein staat recht van boven. De luchtfoto ligt boven de Mapbox-ondergrond en onder de LOQ-terreinlagen, zodat native gebouwen het beeld niet bedekken.

De luchtfoto komt uit de PDOK actuele orthofotolaag. Een kadastraal perceel bewijst geen eigendom, toegang of bewakingsopdracht; de gebruiker moet de operationele grens controleren. Geïmporteerd terrein blijft `source: user_drawn` met optionele `derived_from: pdok_brk` en `derived_from_id`. Deze herkomst is geen claim dat de bewerkte grens nog exact kadastraal is.

`customerPlatformApi.list_object_parcel_candidates` gebruikt dezelfde klant-/objectscope en gecontroleerde locatie als BAG-kandidaten. De server haalt maximaal 100 resultaten per pagina op binnen de toegestane straal, begrenst responstijd/grootte, saneert bronvelden en accepteert alleen vervolgcursors voor exact dezelfde PDOK-query. Bij bronuitval blijven opgeslagen selecties en terreinen intact.

Terrein wordt alleen meegestuurd voor relevante routetaken. Automatische terreinactivering wordt niet geïmplementeerd.

## Verificatie en uitrol

Gerichte webtests dekken punten, percelen, bronuitval, scopes, revisies, herstel, privacy van logs, tekenen en kaartwisseling. De lokale browsercontrole gebruikt echte Mapbox-gebouwen en PDOK-luchtfoto/percelen, met uitsluitend lokale opslag voor het testobject. Dit is geen productieproef.

Publiceer zowel `customerPlatformApi` als `mobileApi` en de entiteitswijzigingen samen met de webupdate in Base44. Een oude backend kent de nieuwe perceelactie/puntopslag nog niet. Een nieuwe native iOS-build is nodig voor puntselecties; de Swift-wijzigingen staan in de aparte lokale Xcode-workspace, niet in deze Git-repository. Nieuwe geometrievelden worden standaard leeg gehouden voor bestaande objecten.

## Primaire bronnen en ontwerpkeuze

- [Mapbox Standard configuratie en featuresets](https://docs.mapbox.com/map-styles/reference/standard/)
- [Native gebouwen selecteren en highlighten](https://docs.mapbox.com/mapbox-gl-js/example/highlight-buildings-standard/)
- [Mapbox Product Terms](https://www.mapbox.com/legal/product-terms)
- [Mapbox Streets: tijdelijke feature-ID's](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/#ids)
- [PDOK BRK-percelencollectie](https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel?f=html)
- [PDOK Kadastrale kaart](https://www.pdok.nl/introductie/-/article/kadastrale-kaart)
- [PDOK luchtfoto RGB Open](https://www.pdok.nl/introductie/-/article/pdok-luchtfoto-rgb-open-)

Architectuurkeuze op basis van deze bronnen: behandel Mapbox-features als tijdelijke weergavegegevens, bewaar uitsluitend eigen klikannotaties voor ongekoppelde gebouwen en gebruik open PDOK-bronnen voor persistente contouren en terreinwerk. Dit voorkomt dat de feature afhankelijk wordt van opslag van Mapbox-content of stabiele Mapbox-feature-ID's; het is geen algemene juridische beoordeling van andere toepassingen.
