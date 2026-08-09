# Ajax-bedienpanelen en ingebouwde LOQ-handleidingen

Onderzoeksdatum: 4–9 augustus 2026
Scope: ingebouwde handleidingen voor Ajax Systems binnen de objecttabs **Installaties** en **Handboek**

## Besluit

LOQ laat de gebruiker kiezen op basis van **afwijkende bediening**, niet op basis van aansluiting, protocol of productserie. Een draadloze en bedrade uitvoering met dezelfde knoppen, schermflow en gebruikershandeling worden daarom als één keuze getoond. Een afzonderlijke keuze blijft alleen bestaan wanneer een functie de bediening en dus de werkinstructie kan veranderen, zoals een Tag/Pass-lezer, ingebouwde zoemer, touchscreen of afwijkende outdoor-toetsindeling.

| Zichtbare keuze | Bedieningskenmerk | Samengevoegde hardwarevarianten |
| --- | --- | --- |
| KeyPad | Numerieke codebediening met afzonderlijke toetsen voor in, uit en Nachtmodus | KeyPad Jeweller; Superior KeyPad Fibra |
| KeyPad Plus | Dezelfde numerieke bediening, aangevuld met Tag/Pass-lezer | KeyPad Plus Jeweller; Superior KeyPad Plus Jeweller; Superior KeyPad Plus G3 Jeweller |
| KeyPad Combi | Numerieke bediening, Tag/Pass-lezer en ingebouwde zoemer | KeyPad Combi Jeweller |
| KeyPad TouchScreen | Touchscreen, groepsselectie en authenticatie vóór of na de actie | KeyPad TouchScreen Jeweller; Superior KeyPad TouchScreen Fibra; Superior KeyPad TouchScreen G3 Jeweller |
| KeyPad Outdoor | Mechanische toetsen, OK-bevestiging en primaire/secundaire bedieningsmodus | KeyPad Outdoor Jeweller; Superior KeyPad Outdoor Fibra |
| Ajax-app | Geen vast bedienpaneel; bediening via een bevoegd Ajax-account | Niet van toepassing |

Nieuwe installaties slaan de generieke bedieningssleutel en de bijbehorende server-side afgeleide `manual_key`, versie en weergavenaam op. Bestaande installaties met een exacte oudere modelsleutel blijven leesbaar en behouden hun historische modelinformatie. De client kan geen willekeurige handleiding of versie koppelen.

## Visuele keuze

De wizard toont één lokale officiële Ajax-productrender per zichtbare bedieningswijze. Dat zijn vijf transparante PNG's van een zwarte referentie-uitvoering; draadloos, bedraad, Fibra, Jeweller en Grade 3 verschijnen niet als dubbele productkaarten wanneer de bediening gelijk is. De productfoto wordt in de vaste tegel visueel opgeschaald, terwijl het originele transparante bronbestand intact blijft. Kleurvarianten zijn bewust geen afzonderlijke opties: kleur verandert de bediening of handleiding niet. De bron, ophaaldatum en checksum staan in `public/installation-control-devices/ajax/manifest.json`.

`KeyPad Combi` blijft een eigen keuze omdat de ingebouwde zoemer een aanvullende functie is die in de werkinstructie benoemd moet worden. `KeyPad UK Plus` is een regionale VK-uitvoering; hubs, SpaceControl, Button en DoubleButton zijn centrales of afstandsbedieningen en horen daarom niet in deze Nederlandse bedieningsstap.

## Bedieningsinhoud

De LOQ-handleiding is een beknopte operationele werkinstructie en bevat:

- volledig in- en uitschakelen;
- Nachtmodus;
- een afzonderlijke groep of sectie bedienen;
- tijdelijke overbrugging als Ajax **Eenmalige deactivering**;
- controles vóór en na de handeling;
- de originele Ajax-afbeelding met de genummerde bedieningselementen van het paneeltype;
- de originele Ajax-pictogrammen naast de betreffende knop of handeling;
- alleen bij TouchScreen-, app- en overbruggingsflows de toepasselijke originele schermbeelden;
- een directe link naar de officiële handleiding van het werkelijk opgeslagen model.

Eenmalige deactivering is bewust geen verzonnen toetsencombinatie. Volgens Ajax gebeurt dit vanuit een uitgeschakeld systeem via **Apparaten → apparaat → Instellingen → Eenmalige deactivering**. Hiervoor zijn rechten op apparaatinstellingen nodig. Een volledig gedeactiveerde detector geeft tijdelijk geen gebeurtenissen door en de instelling vervalt na de eerstvolgende uitschakeling.

De tekst toont nooit een echte schakel-, reset-, service- of overvalcode. Alleen placeholders zoals `Schakelcode`, `Gebruikers-ID` en `Sectie-ID` worden gebruikt. Bestaande installatiecodes blijven in de afzonderlijke versleutelde credentialopslag en worden niet door de handleiding gelezen. Overvalcodebediening is niet opgenomen: daarvoor blijven de objectspecifieke meldkamer- en calamiteitenafspraken leidend.

## Automatisch objecthandboek

Een actieve Ajax-alarminstallatie met een bekende bedieningsfamilie krijgt deterministisch de volgende beschermde boom:

`Installaties → Alarminstallatie → {installatienaam}`

Onder de installatie maakt LOQ afzonderlijke artikelen voor overzicht, inschakelen, uitschakelen, Nachtmodus, groepen of secties en eenmalige deactivering. KeyPad Combi krijgt daarnaast een artikel over de ingebouwde zoemer. Alleen artikelen die bij het gekoppelde bedienpaneel horen worden aangemaakt. Het openen van het handboek herstelt ontbrekende gegenereerde records; aanmaken, wijzigen en archiveren van een installatie voert dezelfde synchronisatie uit.

De gecontroleerde fabrikantstappen vormen een onveranderlijk kernblok. Een beheerder kan bij ieder gegenereerd artikel wel een objectspecifieke aanvulling maken. Hierdoor blijven bijvoorbeeld meldkamerafspraken en de exacte sectienaam aanpasbaar zonder de gecontroleerde Ajax-instructie te overschrijven. Een nieuwe handboekrelease maakt nieuwe kerninhoud en archiveert de vervangen artikelversie; interne links worden met een stabiele logische sleutel naar de nieuwe versie herleid. De opgeslagen `ObjectInstallation`-snapshot wordt daarbij niet stil gewijzigd: de actuele handboekinhoud wordt afgeleid van de vastgelegde bedieningssleutel. Alleen een expliciete installatiebewerking verandert `manual_key`, `manual_version` of de paneelnaam.

## Professionele artikelen

Zelfgeschreven handboekartikelen gebruiken `blocks_v1` en kunnen bestaan uit tussenkoppen, alinea's, stappen, waarschuwingen, veilige privé-afbeeldingen, toetsvolgordes, interne links en scheidslijnen. De editor toont een live voorbeeld. Interne links kunnen naar een artikel of categorie binnen hetzelfde object wijzen; verwijzingen naar een ander object en willekeurige externe afbeeldingen worden server-side geweigerd.

Afbeeldingen uit eigen objectinstructies worden als privé `ManagedFile` opgeslagen en pas na autorisatie via een tijdelijke URL getoond. Een geannuleerde of vervangen upload wordt opgeruimd. De browser waarschuwt bij navigeren met niet-opgeslagen wijzigingen. Gegenereerde artikelen en categorieën kunnen niet handmatig worden verwijderd; archiveren van de installatie beheert hun levenscyclus.

## Versiebeheer

- `control_device_key` identificeert voor nieuwe installaties de generieke bedieningswijze; oudere exacte modelsleutels blijven als compatibele aliassen ondersteund.
- `control_device_name` is de door de server vastgelegde weergavenaam.
- `manual_key` identificeert één van de zes bedieningsfamilies, inclusief de Ajax-app.
- `manual_version` verwijst naar een append-only release; `2026.08.1` blijft voor historische installaties beschikbaar en de actuele foto-/pictogramrelease is `2026.08.2`.
- Een inhoudelijke wijziging krijgt een nieuwe release naast de bestaande versie. Een uitgegeven installatie wordt niet stil naar nieuwe instructies omgezet.
- De objectlogboekdiff registreert wijzigingen van paneel en handleiding zonder gevoelige codewaarden.
- De assetrelease heeft een manifest met bron-URL, ophaaldatum en SHA-256-checksum. `npm run verify:ajax-handbook` controleert alle 25 bestanden en de frontend- en backend-allowlists.

## Officiële Ajax-bronnen

- [Ajax Remote Controls](https://support.ajax.systems/en/controls/)
- [KeyPad Jeweller](https://support.ajax.systems/en/manuals/keypad/)
- [KeyPad Plus Jeweller](https://support.ajax.systems/en/manuals/keypad-plus/)
- [KeyPad Combi Jeweller](https://support.ajax.systems/en/manuals/keypad-combi/)
- [KeyPad TouchScreen Jeweller](https://support.ajax.systems/en/manuals/keypad-touchscreen/)
- [Superior KeyPad Fibra](https://support.ajax.systems/en/manuals/superior-keypad-fibra/)
- [Superior KeyPad Plus Jeweller](https://support.ajax.systems/en/manuals/superior-keypad-plus-jeweller/)
- [Superior KeyPad TouchScreen Fibra](https://support.ajax.systems/en/manuals/superior-keypad-touchscreen-fibra/)
- [KeyPad Outdoor Jeweller](https://support.ajax.systems/en/manuals/keypad-outdoor-jeweller/)
- [Superior KeyPad Outdoor Fibra](https://support.ajax.systems/en/manuals/superior-keypad-outdoor-fibra/)
- [Superior KeyPad Plus G3 Jeweller](https://support.ajax.systems/en/manuals/superior-keypad-plus-g3-jeweller/)
- [Superior KeyPad TouchScreen G3 Jeweller](https://support.ajax.systems/en/manuals/superior-keypad-touchscreen-g3-jeweller/)
- [Ajax Eenmalige deactivering](https://ajax.systems/support/posts/one-arming-device-deactivation/)
- [Ajax groepsmodus](https://ajax.systems/support/posts/ajax-group-mode/)
- [Actuele Ajax-batterijreferentie met KeyPad Combi](https://support.ajax.systems/en/how-long-operate-from-batteries/)
- [Space en gebruikersrechten configureren](https://support.ajax.systems/en/how-to-configure-a-space/)

## Onderhoudsgrens

LOQ kopieert geen volledige fabrikantshandleidingen. De ingebouwde tekst is eigen, beknopt en gekoppeld aan officiële bronnen. De herkenningsfoto's en pictogrammen zijn ongewijzigde Ajax-assets; Ajax Systems behoudt de rechten en vóór productiegebruik moet de toepasselijke partner- of merktoestemming zijn vastgelegd. Nieuwe firmware, nieuwe bedienpanelen of een aantoonbaar gewijzigde interactieflow vragen eerst broncontrole en daarna een nieuwe handleidingrelease. Een verschil in voeding, radioprotocol, certificeringsgraad of bekabeling alleen is geen reden voor een tweede bedieningshandleiding.
