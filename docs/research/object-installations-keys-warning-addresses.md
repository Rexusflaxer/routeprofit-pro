# Objectkaart: waarschuwingsadressen, sleutels en installaties

Onderzoeksdatum: 4 augustus 2026
Status: implementatiebesluit voor de huidige objectkaart

## Besluit

De drie modules horen bij hetzelfde object, maar hebben een verschillende
levenscyclus en gevoeligheid:

| Module | Wat de tabel toont | Wat apart beveiligd blijft |
| --- | --- | --- |
| Waarschuwingsadressen | Belvolgorde, persoon, relatie, bereikbaarheid en actuele status | Tijdelijke roosterafwijkingen en volledige wijzigingshistorie |
| Sleutels | Objectgebonden sleutelsets, sleutelnummer, type, merk, serienummer en status | Uitgifte/retour en actuele houder horen later in een afzonderlijke custody-keten |
| Installaties | Type, merk/model, locatie, meldkamer, installateur, test- en onderhoudsdata | Schakel-, reset-, gebruikers- en meldkamercodes in een afgeschermde credential-entiteit |

Alle mutaties lopen daarom via `customerPlatformApi`. De browser leest of
schrijft deze entiteiten niet rechtstreeks. Iedere wijziging is object- en
klantgebonden, gebruikt een idempotency key en actuele versie, en schrijft een
`CustomerEvent`. Verwijderen betekent archiveren; het logboek blijft bestaan.

## Onderzoeksbasis

De bestaande workspace-referenties zijn opnieuw gecontroleerd:

- `Reference/SequriX/README.md` beschrijft alarminstallaties met locatie, codes
  en opmerkingen, waarschuwingsadressen met belvolgorde en niet-bellenperioden,
  en sleutels als afzonderlijke objectonderdelen. Gevoelige sleutel- en
  installatiegegevens worden mobiel pas na herbevestiging getoond.
- `Reference/Secure-it/README.md` bevestigt de scheiding tussen operationele
  objectgegevens, documenten, rechten en extra beveiligde informatie.
- `Reference/Secusoft/COMPLIANCE.md` verlangt extra afscherming van objectcodes,
  sleutels en toegangsinformatie, plus aantoonbaar wijzigingsbeheer.
- `Reference/WebappLandscape/FUNCTION-MATRIX.md` en
  `deep-dives/06-assets-routes-fleet.md` gebruiken Traka als referentie voor
  bevoegdheid, uitgifte, retour en audit. Een sleutelrecord is dus nog geen
  volledige custody-administratie.
- `docs/research/object-card.md` bepaalt al dat codes nooit in profielkop,
  algemene zoekresultaten of onbeveiligde objectrecords horen.

Actuele officiële bronnen zijn als controle gebruikt:

- [SequriX alarmopvolging](https://www.sequrix.com/nl/product/alarmopvolging/)
  koppelt objectinformatie, alarmcodes, noodcontacten en documenten aan
  rollen en rechten binnen de operationele alarmflow.
- [Secusoft sleutelontvangst](https://www.secusoft.nl/sleutelontvangst-ptf241)
  registreert onder meer sleutelnummer, merk, aantal en omschrijving en noemt
  versleutelde opslag.
- [Traka electronic key management](https://www.traka.com/global/en/solutions/electronic-key-management-systems)
  bevestigt dat rechten en een volledige audit trail nodig zijn zodra LOQ ook
  feitelijke uitgifte en retour gaat beheren.
- [CCV onderhoud brandmeldinstallaties](https://hetccv.nl/keurmerken/brandbeveiliging/brandmeldinstallaties/onderhoud/)
  bevestigt dat beheer, periodieke controle, onderhoud en bijbehorende
  documentatie als eigen onderhoudscontext moeten worden vastgelegd.

## Wizard- en interactiebesluit

Alle drie de wizards gebruiken dezelfde LOQ-opbouw: compacte glazen panelen,
dezelfde stapindicator, één duidelijke keuze per kaart en onderaan dezelfde
Vorige/Volgende/Opslaan-navigatie. Een keuze verandert alleen de relevante
velden; niet-relevante codes of onderhoudsvelden worden niet getoond.

De installatiewizard bestaat uit vier korte stappen:

1. **Soort installatie** — inbraak, brandmelding, ontruiming, toegang, CCTV,
   intercom of een vrij omschreven ander systeem.
2. **Identiteit en locatie** — naam, merk, model, serienummer, externe
   referentie en locatie van het bedienpaneel.
3. **Meldkamer en codes** — PAC/meldkamer, aansluitnummer en alleen de
   codetypen die bij de gekozen installatie passen. Codevelden zijn gemaskeerd;
   leeg laten bij wijzigen behoudt de bestaande code. Een bestaande code kan
   daarnaast expliciet en gelogd worden ingetrokken.
4. **Beheer en controle** — installateur, telefoon, ingebruikname, laatste test,
   volgende onderhoudsdatum, levenscyclus, operationele staat en samenvatting.

De tabel toont nooit codewaarden en algemene zoekresultaten doorzoeken geen
sleutels of installaties zolang daar geen expliciet veilige, geprojecteerde
zoek-API voor bestaat. De backend versleutelt codewaarden met AES-GCM en bewaart
alleen het codetype in de veilige tabelprojectie en het objectlogboek.

Iedere credential bewaart naast de key-id ook de sleutelbron. Daardoor blijft
decryptie gekoppeld aan de oorspronkelijke dedicated key of HKDF-afgeleide
managed-file-root, onafhankelijk van welke sleutelbron later de voorkeur krijgt.
Historische dedicated keys worden als JSON keyring via
`OBJECT_INSTALLATION_MASTER_KEYS_JSON` aangeboden; geroteerde managed-file-roots
via `MANAGED_FILE_MASTER_KEYS_JSON`. Requestfingerprints verwerken codewaarden
uitsluitend als server-keyed HMAC. `CUSTOMER_PLATFORM_FINGERPRINT_HMAC_KEY_B64`
is daarvoor de aanbevolen vaste, afzonderlijke secret; zonder die secret wordt
een domeingescheiden sleutel uit de managed-file-root afgeleid.

## Grenzen en vervolg

- Deze release ondersteunt sleutelconfiguratie per object. Een centrale
  sleutelkluis, setkoppeling, daadwerkelijke uitgifte, retour, curfew en
  gebruikerscustody vereisen later append-only custody-events en tijdelijke
  bevoegdheden; de interface doet nu niet alsof die historie al bestaat.
- Installatiecodes kunnen veilig worden ingesteld, vervangen of ingetrokken, maar worden in
  de backofficetabel en het logboek nooit teruggegeven. Een toekomstige
  operationele onthulflow vereist step-up authenticatie, doelbinding, korte
  geldigheid en een afzonderlijk read-audit-event.
- Onderhoudsdata zijn beheergegevens en geen automatisch bewijs van wettelijke
  of normatieve conformiteit. Certificaten, logboeken en onderhoudsopdrachten
  blijven aparte documenten en processen.
