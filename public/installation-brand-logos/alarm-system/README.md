# Alarmsysteemmerken

Deze map bevat lokale logo-assets voor de merkkeuze in de interne installatie-wizard. De logo's dienen uitsluitend om het merk van een bestaand alarmsysteem herkenbaar te identificeren. Zij betekenen geen partnerschap, certificering of aanbeveling door de merkhouder.

## Technische vorm

- Elke actieve catalogusasset heet `<slug>.png` en correspondeert met dezelfde `slug` in `manifest.json`. Niet-gebruikte historische assets worden nooit door de wizard of het manifest geladen.
- De eindbestanden zijn 320 × 96 pixels, 8-bit RGBA en hebben een daadwerkelijk transparante buitenruimte.
- De beeldverhouding en vorm van het aangeleverde merkbeeld zijn behouden. Kleuren blijven behouden, behalve bij de in het manifest benoemde contrastadaptaties van een witte officiële variant voor de gedeelde witte tegel. Wordmarks zijn niet nagetekend of opnieuw gezet.
- Vectoren zijn rechtstreeks gerasterd. Bestaande rasterlogo's zijn proportioneel geschaald.
- Alle logo's worden op dezelfde witte tegel getoond. Waar een merkeigenaar geen bruikbare licht-achtergrondvariant publiceert, vermeldt het manifest expliciet dat uitsluitend de witte beeldpunten naar een donkere neutrale contrastkleur zijn omgezet.
- `sha256` borgt de lokale assetversie. Wijzig een PNG niet zonder ook de checksum en herkomstregistratie bij te werken.

## Herkomst

De voorkeursvolgorde is: officiële merkwebsite, officiële pers- of brandbron, of een exact logo dat door de officiële website wordt geladen. Alleen voor ABUS en Eaton is Wikimedia Commons gebruikt; hun bestandspagina's verwijzen aantoonbaar naar de oorspronkelijke officiële merkbron.

Alle assets zijn opgehaald op 2026-08-04. `manifest.json` registreert per merk de gebruikte bron, checksum, tegelvariant en gebruiksnotitie. De app gebruikt de lokale bestanden en hotlinkt niet naar deze externe bronnen.

## Merkgebruik

Deze repository verleent geen licentie op de merknamen of logo's. Gebruik blijft onderworpen aan de voorwaarden van iedere merkhouder.

- Gebruik de afbeeldingen alleen identificerend, ongewijzigd en zonder een commerciële relatie te suggereren.
- Vraag voor externe publicatie zo nodig toestemming aan de merkhouder. Dit is in het bijzonder relevant voor Dahua Technology, Eaton, Hikvision, Pyronix en Radionix.
- ABUS vraagt bij externe publicatie om de voorgeschreven auteursrechtvermelding.
- JABLOTRON vraagt gebruikers de eigen marketingrichtlijnen te volgen en bij twijfel contact op te nemen.
- TELENOT vraagt bij beeldpublicatie om `© TELENOT ELECTRONIC GMBH` of `© TELENOT`.
- `Alphatronics` en `Vanderbilt` zijn geen selecteerbare catalogusmerken. Nieuwe UNii-records worden als `UNii` opgeslagen; actuele SPC-systemen vallen onder `acre Security`. Eventuele oude losse assets in deze map zijn uitsluitend migratiehistorie en worden niet geladen.

Controleer vóór publiek of promotioneel gebruik altijd opnieuw de actuele merkrichtlijnen. Deze assets zijn bedoeld voor de afgeschermde LOQ-bedrijfsapplicatie.
