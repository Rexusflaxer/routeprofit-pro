# Alarmsysteemmerken

Deze map bevat lokale logo-assets voor de merkkeuze in de interne installatie-wizard. De logo's dienen uitsluitend om het merk van een bestaand alarmsysteem herkenbaar te identificeren. Zij betekenen geen partnerschap, certificering of aanbeveling door de merkhouder.

## Technische vorm

- Elk bestand heet `<slug>.png` en correspondeert met dezelfde `slug` in `manifest.json`.
- De eindbestanden zijn 320 × 96 pixels, 8-bit RGBA en hebben een daadwerkelijk transparante buitenruimte.
- De beeldverhouding, kleuren en vorm van het aangeleverde merkbeeld zijn behouden. Wordmarks zijn niet nagetekend of opnieuw gezet.
- Vectoren zijn rechtstreeks gerasterd. Bestaande rasterlogo's zijn proportioneel geschaald. Bij de officiële Vanderbilt-pers-JPEG is alleen de egale witte matte verwijderd.
- `dark_tile: true` betekent dat het officiële logo overwegend wit is en daarom op een donkere, neutrale tegel moet worden getoond.
- `sha256` borgt de lokale assetversie. Wijzig een PNG niet zonder ook de checksum en herkomstregistratie bij te werken.

## Herkomst

De voorkeursvolgorde is: officiële merkwebsite, officiële pers- of brandbron, of een exact logo dat door de officiële website wordt geladen. Alleen voor ABUS en Eaton is Wikimedia Commons gebruikt; hun bestandspagina's verwijzen aantoonbaar naar de oorspronkelijke officiële merkbron. Vanderbilt komt uit de officiële Cision-perspublicatie van Vanderbilt.

Alle assets zijn opgehaald op 2026-08-04. `manifest.json` registreert per merk de gebruikte bron, checksum, tegelvariant en gebruiksnotitie. De app gebruikt de lokale bestanden en hotlinkt niet naar deze externe bronnen.

## Merkgebruik

Deze repository verleent geen licentie op de merknamen of logo's. Gebruik blijft onderworpen aan de voorwaarden van iedere merkhouder.

- Gebruik de afbeeldingen alleen identificerend, ongewijzigd en zonder een commerciële relatie te suggereren.
- Vraag voor externe publicatie zo nodig toestemming aan de merkhouder. Dit is in het bijzonder relevant voor Dahua Technology, Eaton, Hikvision, Pyronix en Radionix.
- ABUS vraagt bij externe publicatie om de voorgeschreven auteursrechtvermelding.
- JABLOTRON vraagt gebruikers de eigen marketingrichtlijnen te volgen en bij twijfel contact op te nemen.
- TELENOT vraagt bij beeldpublicatie om `© TELENOT ELECTRONIC GMBH` of `© TELENOT`.
- `Alphatronics` en `Vanderbilt` zijn uitsluitend opgenomen voor historische installed-base-herkenning. Nieuwe UNii-records worden als `UNii` opgeslagen; actuele SPC-systemen vallen onder `acre Security`.

Controleer vóór publiek of promotioneel gebruik altijd opnieuw de actuele merkrichtlijnen. Deze assets zijn bedoeld voor de afgeschermde LOQ-bedrijfsapplicatie.
