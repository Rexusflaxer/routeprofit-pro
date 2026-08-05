# Ajax-bedienpanelen en ingebouwde LOQ-handleidingen

Onderzoeksdatum: 4–5 augustus 2026
Scope: eerste ingebouwde handleidingen voor Ajax Systems binnen de objecttab **Installaties**

## Besluit

LOQ registreert het exacte bedienpaneel, maar maakt niet voor iedere elektrische of protocolvariant een gekopieerde handleiding. De functionele bedieningswijze bepaalt de handleidingfamilie. Daardoor delen een draadloze en bedrade uitvoering dezelfde Nederlandstalige werkinstructie wanneer knoppen, schermflow en gebruikershandeling gelijk zijn.

| Gedeelde handleidingfamilie | Bedienpaneelvarianten | Waarom gedeeld |
| --- | --- | --- |
| Numeriek paneel | KeyPad Jeweller; Superior KeyPad Fibra | Aanraakvlak, code en afzonderlijke toetsen voor in, uit en Nachtmodus; dezelfde groepsvolgorde. |
| Numeriek paneel met lezer | KeyPad Plus Jeweller; KeyPad Combi Jeweller; Superior KeyPad Plus Jeweller; Superior KeyPad Plus G3 Jeweller | Dezelfde numerieke kernbediening, aangevuld met Pass/Tag en eventueel een bevestigingscode. De ingebouwde zoemer van KeyPad Combi verandert de schakelvolgorde niet. |
| Touchscreen | KeyPad TouchScreen Jeweller; Superior KeyPad TouchScreen Fibra; Superior KeyPad TouchScreen G3 Jeweller | Dezelfde Bediening-tab, groepsselectie en authenticatie vóór of na de actie afhankelijk van Voorautorisatie. |
| Outdoor-paneel | KeyPad Outdoor Jeweller; Superior KeyPad Outdoor Fibra | Mechanische toetsen, OK-bevestiging en configureerbare primaire/secundaire modus. |
| Ajax-app | Geen vast bedienpaneel | Bedieningsflow verloopt volledig via een bevoegd Ajax-account. |

Het protocol (`Jeweller`, `Wings` of `Fibra`), de exacte modelnaam en de modelspecifieke officiële bron blijven wel afzonderlijk bij de installatie zichtbaar. Een gebruiker kiest dus het werkelijke model; LOQ leidt daarna server-side de gedeelde `manual_key`, versie en weergavenaam af. De client kan geen willekeurige handleiding of versie koppelen.

## Visuele modelkeuze

De wizard toont per fysiek model een lokale officiële Ajax-productrender op een vaste witte tegel. Alle renders zijn transparante PNG's van de zwarte uitvoering. Kleurvarianten zijn bewust geen afzonderlijke opties: kleur verandert de bediening of handleiding niet. De hogere-resolutiebronnen, ophaaldatum en checksums staan in `public/installation-control-devices/ajax/manifest.json`.

De actuele Ajax Controls-catalogus wordt aangevuld met `KeyPad Combi Jeweller` als aantoonbare geïnstalleerde basis. Ajax noemt dit model nog in de actuele batterijreferentie en onderhoudt de officiële handleiding en specificatiepagina. `KeyPad UK Plus Jeweller` is een regionale VK-uitvoering; hubs, SpaceControl, Button en DoubleButton zijn centrales of afstandsbedieningen en horen daarom niet in deze Nederlandse bedienpaneelstap.

## Bedieningsinhoud

De LOQ-handleiding is een beknopte operationele werkinstructie en bevat:

- volledig in- en uitschakelen;
- Nachtmodus;
- een afzonderlijke groep of sectie bedienen;
- tijdelijke overbrugging als Ajax **Eenmalige deactivering**;
- controles vóór en na de handeling;
- een schematische, niet-productfotografische weergave van het paneeltype;
- een directe link naar de officiële handleiding van het werkelijk opgeslagen model.

Eenmalige deactivering is bewust geen verzonnen toetsencombinatie. Volgens Ajax gebeurt dit vanuit een uitgeschakeld systeem via **Apparaten → apparaat → Instellingen → Eenmalige deactivering**. Hiervoor zijn rechten op apparaatinstellingen nodig. Een volledig gedeactiveerde detector geeft tijdelijk geen gebeurtenissen door en de instelling vervalt na de eerstvolgende uitschakeling.

De tekst toont nooit een echte schakel-, reset-, service- of overvalcode. Alleen placeholders zoals `Schakelcode`, `Gebruikers-ID` en `Sectie-ID` worden gebruikt. Bestaande installatiecodes blijven in de afzonderlijke versleutelde credentialopslag en worden niet door de handleiding gelezen. Overvalcodebediening is niet opgenomen: daarvoor blijven de objectspecifieke meldkamer- en calamiteitenafspraken leidend.

## Versiebeheer

- `control_device_key` identificeert de exacte hardwarevariant.
- `control_device_name` is de door de server vastgelegde weergavenaam.
- `manual_key` identificeert één van de vijf gedeelde bedieningsfamilies.
- `manual_version` verwijst naar een append-only release; de eerste release is `2026.08.1`.
- Een inhoudelijke wijziging krijgt een nieuwe release naast de bestaande versie. Een uitgegeven installatie wordt niet stil naar nieuwe instructies omgezet.
- De objectlogboekdiff registreert wijzigingen van paneel en handleiding zonder gevoelige codewaarden.

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
- [Ajax Eenmalige deactivering](https://support.ajax.systems/en/one-arming-device-deactivation/)
- [Actuele Ajax-batterijreferentie met KeyPad Combi](https://support.ajax.systems/en/how-long-operate-from-batteries/)
- [Space en gebruikersrechten configureren](https://support.ajax.systems/en/how-to-configure-a-space/)

## Onderhoudsgrens

LOQ kopieert geen volledige fabrikantshandleidingen. De ingebouwde tekst is eigen, beknopt en gekoppeld aan officiële bronnen. Nieuwe firmware, nieuwe bedienpanelen of een aantoonbaar gewijzigde interactieflow vragen eerst broncontrole en daarna een nieuwe handleidingrelease. Een verschil in voeding, radioprotocol, certificeringsgraad of bekabeling alleen is geen reden voor een tweede bedieningshandleiding.
