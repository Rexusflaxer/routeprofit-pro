# Multicompany contract- en arbeidsroutering

Status: doelarchitectuur en implementatiecontract
Datum: 5 september 2026

## Afbakening van de huidige implementatiefase

Deze wijziging legt de rol- en taaksoortscheiding vast en implementeert de
conceptsignalen plus de eerste commerciële en arbeidsroutering. De onderstaande
doelarchitectuur is bewust breder dan de reeds actieve runtime.

Nu onderdeel van de runtime:

- canonieke taaksoorten op arbeidscontracten en klantcontractregels;
- afzonderlijke verkoop-, service- en werkgeversvelden in planningrecords;
- taaksoort- en intervalgebaseerde arbeidsroutering zonder bedrijfsdefault;
- commerciële routering van objecttaak-occurrences, inclusief klant-, object-
  en collectiefscope;
- lokale oranje conceptindicaties en ernstigere conflictaanduidingen;
- fail-closed detectie van ontbrekende, verouderde of meervoudige routebewijzen;
- een niet-wegklikbare publicatiepoort die commerciële en arbeidsroutering
  binnen de vergrendelde publicatiescope opnieuw berekent;
- een expliciete, controleerbare `not_applicable`-route voor interne taken die
  geen klantcontext hebben en aantoonbaar niet facturabel zijn;
- doorzetting van beschikbaar bevroren contract- en bedrijfsbewijs naar nieuwe
  mobiele en geoptimaliseerde taakuitvoeringen.

Nog geen afgeronde runtime in deze fase:

- vooraf gematerialiseerde, event-driven routeringsfeiten buiten het openen van
  de planning;
- volledige commerciële routering van samengestelde mobiele routes;
- de aanvullende finale loonperiode- en payrollcontrole boven op de huidige
  contractrouteringspoort;
- herstel/backfill van bestaande historische `TaskExecution`-records zonder
  publicatiebewijs;
- een taakdefinitiecatalogus waarmee maatwerksleutels zoals `other:<id>` ook in
  de arbeidscontractwizard kunnen worden geselecteerd;
- intercompany urenallocatie, tarieven en facturen.

Nullable doelvelden in uitvoeringsentiteiten zijn tot die schrijfpaden zijn
afgerond dus geen zelfstandig bewijs dat een route is gevalideerd.

## Doel

LOQ gebruikt één gezamenlijke planning voor meerdere juridische ondernemingen
binnen dezelfde familiegroep. Een klantopdracht kan commercieel bij een ander
bedrijf horen dan het arbeidscontract van de medewerker die het werk uitvoert.
Die situatie is geen fout: zij is de basis voor gecontroleerde interne in- en
uitleen.

De applicatie moet daarom drie onafhankelijke vragen beantwoorden:

1. Welk bedrijf heeft deze taak aan de klant verkocht en factureert de klant?
2. Welk bedrijf is juridisch en operationeel verantwoordelijk voor de dienst?
3. Welk arbeidscontract betaalt deze medewerker en welke CAO hoort daarbij?

Deze antwoorden mogen gelijk zijn, maar mogen nooit als hetzelfde gegeven
worden verondersteld. Een ontbrekend antwoord wordt niet aangevuld met een
algemeen bedrijfs- of CAO-default.

## Terminologie en bedrijfsrollen

Nieuwe code en API-contracten gebruiken expliciete rolnamen. Het generieke
`company_id` blijft alleen bestaan waar de betekenis door de entiteit zelf
ondubbelzinnig is of tijdens een gecontroleerde legacy-migratie.

| Rol | Canonieke veldnaam | Betekenis |
| --- | --- | --- |
| Verkopend klantbedrijf | `selling_company_id` | Juridische entiteit die het klantcontract houdt, de omzet draagt en de klant factureert. De bron is de unieke `CustomerContractLine` en het bovenliggende klantcontract. |
| Serviceverantwoordelijk bedrijf | `service_responsible_company_id` | Juridische entiteit die de opdracht operationeel draagt en, waar toepasselijk, als inlener of vergunninghouder moet worden beoordeeld. Dit is niet automatisch de verkoper of werkgever. |
| Werkgevers-/loonbedrijf | `employing_company_id` | Juridische werkgever en loonbetaler uit het geselecteerde `PersonnelContract`; dit bedrijf bepaalt samen met het contract de loon-CAO via `payroll_cao_key`. |
| Leverend bedrijf | `supplying_company_id` | Onderneming die de arbeid aan het serviceverantwoordelijke bedrijf levert. In de eerste interne variant is dit normaal het werkgeversbedrijf, maar die gelijkheid wordt als bewijs vastgelegd en niet impliciet aangenomen. |

`operating_company_id` mag alleen blijven worden gebruikt nadat per entiteit is
vastgelegd of dit het serviceverantwoordelijke of het werkgeversbedrijf
betekent. De huidige gecombineerde betekenis "uitvoerend bedrijf/werkgever" is
geen geldige doelarchitectuur.

De bestaande commerciële velden behouden gedurende de migratie hun betekenis:

- `CustomerAccount.company_id` is het verkopende en facturerende bedrijf;
- `CustomerContract.company_id` is hetzelfde verkopende bedrijf;
- `PersonnelContract.company_id` is het werkgeversbedrijf;
- `TaskExecution.selling_company_id` is reeds de commerciële uitvoeringssnapshot.

De drie primaire bedrijfsrollen blijven altijd afzonderlijk herleidbaar:

```text
klantcontractregel -> selling_company_id             -> klantfactuur en omzet
opdracht/dienst    -> service_responsible_company_id -> operatie, inleen en vergunning
arbeidscontract    -> employing_company_id           -> loonbetaling en payroll_cao_key
```

Wanneer een externe payrollprovider later een eigen juridische rol krijgt,
wordt daarvoor een afzonderlijk veld en contractmodel ingevoerd. Zo'n provider
wordt nooit afgeleid uit `selling_company_id` of
`service_responsible_company_id`.

## Twee onafhankelijke routeringen

### Commerciële vraagroutering

De taak bepaalt via klant, concreet object, canonieke taaksoort en datum exact
één actieve klantcontractregel. De gevonden regel bepaalt vervolgens het
klantcontract, de klantrelatie en het verkopende bedrijf.

```text
customer_id + object_id + task_type_key + service interval
                              │
                              ▼
             exact één actieve klantcontractregel
                              │
                              ▼
 customer_contract_id + customer_account_id + selling_company_id
```

Het verkopende bedrijf is dus een uitkomst van deze routering. Het mag niet aan
de uniciteitssleutel worden toegevoegd om twee conflicterende klantcontracten
toch passend te laten lijken.

### Arbeids- en CAO-routering

De medewerker bepaalt via medewerker, canonieke taaksoort en dienstinterval
exact één actief arbeidscontract. Het geselecteerde contract bepaalt het
werkgeversbedrijf, de contractfunctie en de CAO waarmee planning en loon worden
gecontroleerd.

```text
personnel_id + task_type_key + service interval
                         │
                         ▼
            exact één actief arbeidscontract
                         │
                         ▼
 personnel_contract_id + employing_company_id + payroll_cao_key
```

Het verkopende of serviceverantwoordelijke bedrijf mag een arbeidscontract van
een ander bedrijf niet uitsluiten. Het mag de CAO van het geselecteerde
arbeidscontract evenmin vervangen.

### Samenvoeging van beide uitkomsten

Na beide routeringen gelden de volgende situaties:

- `selling_company_id === employing_company_id`: normale inzet binnen één
  onderneming;
- `selling_company_id !== employing_company_id`: interne in-/uitleen die als
  afzonderlijke, herleidbare allocatie moet worden gemarkeerd;
- een ontbrekende commerciële match: de taak mag in de conceptplanning blijven
  staan met de oranje status `Klantcontract koppelen`, maar is nog niet gereed
  voor definitieve publicatie of facturatie;
- een meervoudige of tegenstrijdige commerciële match: dit is een ernstiger
  routeringsconflict, nooit een ontbrekende koppeling, en blokkeert definitieve
  publicatie en facturatie;
- een ontbrekende arbeidscontractmatch of onvolledig assignmentbewijs: de
  medewerker mag als concept worden ingepland met de oranje status
  `Arbeidscontract koppelen`, maar de assignment is niet publicatie- of
  payrollgereed;
- een meervoudige of tegenstrijdige arbeidscontractmatch: dit blijft als
  ernstiger conflict zichtbaar en blokkeert definitieve publicatie en
  loonverwerking;
- een ontbrekende expliciete `PersonnelContract.cao_key` blokkeert het maken of
  bewerken van een concept niet, maar publicatie en payroll blijven fail-closed;
  er bestaat geen CAO PB-default.

Een bedrijfsverschil alleen is geen CAO-fout. Vergunningen, bedrijfspassen,
inlenersverplichtingen en groepsautorisatie worden wel afzonderlijk op hun
juiste bedrijfsrol gecontroleerd.

## Canonieke taaksoort

Alle routering gebruikt één stabiele `task_type_key`. Voor de eerste migratie is
de snake_case-verzameling van `ObjectTaskDefinition.task_type` leidend, onder
meer `reception`, `fire_closing_round` en `mobile_control_round`.

De volgende gegevens zijn geen canonieke sleutel:

- een vertaald of door de gebruiker zichtbaar label;
- het Nederlandse legacyveld `Task.task_type` zonder gevalideerde mapping;
- een vrije `CustomerContractLine.service_code`;
- de algemene waarde `other` zonder aanvullende stabiele maatwerksleutel.

Een maatwerktaaksoort krijgt daarom een stabiele registry-ID of unieke
`custom_task_type_key`. De omschrijving mag later wijzigen zonder de routering
of historie te veranderen.

Tijdens de migratie:

1. krijgt iedere herkenbare legacywaarde exact één mapping naar
   `task_type_key`;
2. wordt een niet-herkenbare of meervoudige mapping `manual_review_required`;
3. mag een lege `service_code` niet langer als wildcard voor iedere taaksoort
   functioneren;
4. worden nieuwe contract- en planningwrites uitsluitend met de canonieke
   sleutel aangemaakt.

## Klantcontractmodel

### Contractopbouw

Eén `CustomerContract` hoort bij één klant, één `CustomerAccount` en daarmee
één verkopend bedrijf. Het contract mag tegelijk:

- één of meerdere objecten van die klant omvatten;
- één of meerdere taaksoorten omvatten;
- per taaksoort tarieven en geldigheidsperioden bevatten.

De zin "één taaksoort per contract" betekent binnen deze architectuur niet dat
een contract maximaal één taaksoort heeft. Zij betekent dat een taaksoort voor
hetzelfde klantobject en dezelfde effectieve periode naar maximaal één actief
contract mag leiden.

De gewenste genormaliseerde structuur is:

```text
CustomerContract
  ├── CustomerContractObjectScope (één rij per geselecteerd object)
  └── CustomerContractLine        (één canonieke taaksoort per regel)
        └── CustomerContractRate  (periodegebonden tariefversies)
```

`CustomerContractObjectScope` bevat minimaal:

- `contract_id`;
- `customer_id`;
- `object_id`;
- `status`;
- `valid_from` en `valid_until`;
- `version` en auditmetadata.

`CustomerContractLine` krijgt minimaal een niet-lege `task_type_key`. Een regel
kan voor alle geselecteerde contractobjecten gelden of voor een expliciete
deelverzameling. De routering expandeert een scope altijd naar concrete
object-ID's voordat uniciteit wordt gecontroleerd.

Nieuwe contracten gebruiken geen impliciete klantbrede wildcard. Bestaande
klantbrede of collectiefregels worden bij validatie naar de op dat moment
betrokken concrete objecten geëxpandeerd en kunnen daardoor met een
objectspecifieke regel conflicteren.

### Harde commerciële uniciteit

Voor iedere effectieve minuut geldt maximaal één actieve commerciële scope met
de logische sleutel:

```text
(customer_id, object_id, task_type_key)
```

De geldigheidsperiode hoort bij de constraint. Twee rijen met dezelfde sleutel
mogen alleen bestaan wanneer hun effectieve intervallen niet overlappen. Dit
geldt ook wanneer zij bij verschillende verkopende bedrijven of verschillende
klantcontracten horen.

Voorbeeld:

- receptie op object X via contract A van januari tot en met juni;
- receptie op object X via opvolgend contract B vanaf juli;
- receptie op object Y via een ander contract gedurende dezelfde maanden.

Dit is geldig. Twee actieve receptieregels voor object X op 15 mei zijn
ongeldig, ook wanneer de ene regel klantbreed en de andere objectspecifiek is.

De controle vindt server-side en atomair plaats bij activering van:

- een klantcontract;
- een objectscope;
- een contractregel;
- een opvolgende contractversie of periodewijziging.

Een clientcontrole is alleen gebruikersondersteuning en geen bewijs. Alle
schrijfpaden moeten dezelfde autoritatieve resolver en overlapcontrole gebruiken.

### Resolutievolgorde voor facturatie

De facturatieresolver selecteert niet eerst één actief klantcontract. Hij:

1. verzamelt alle actieve contractregels van de klant die de uitvoeringsdatum
   kunnen dekken;
2. beperkt die verzameling tot het concrete object en de canonieke taaksoort;
3. controleert de doorsnede van contract-, objectscope- en regelgeldigheid;
4. eist exact één regel;
5. haalt pas daarna het bovenliggende contract, de klantrelatie en het
   verkopende bedrijf op;
6. resolveert binnen die regel exact één geldig tarief voor de factureereenheid.

Dezelfde resolver wordt gedeeld door interactieve API's en achtergrondautomatisering.
Er mogen geen twee gekopieerde implementaties met afwijkend gedrag blijven.

## Arbeidscontractmodel

Eén `PersonnelContract` hoort juridisch bij één medewerker en één
werkgeversbedrijf en bevat een expliciete `cao_key`. Het contract mag meerdere
taaksoorten toestaan.

Voor schaalbare queries, versiebeheer en overlapcontrole wordt de bestaande
vrije array `allowed_task_types` op termijn genormaliseerd naar
`PersonnelContractTaskScope`. Deze entiteit bevat minimaal:

- `personnel_contract_id`;
- `personnel_id`;
- `employing_company_id`;
- `task_type_key`;
- `status`;
- `valid_from` en `valid_until`;
- `version` en auditmetadata.

Voor iedere effectieve minuut geldt maximaal één actieve arbeidscontractscope
met de logische sleutel:

```text
(personnel_id, task_type_key)
```

Het werkgeversbedrijf hoort niet in deze sleutel: het is de uitkomst die LOQ
juist moet kunnen bepalen. Twee gelijktijdige receptiescopes voor dezelfde
medewerker bij bedrijf A en bedrijf B zijn dus ambigu en worden bij
contractactivering geweigerd. Een bestaand concept met legacyambiguïteit blijft
zichtbaar voor correctie, maar is nadrukkelijk ernstiger dan een ontbrekende
koppeling en kan niet definitief worden gepubliceerd of verloond; een primair
bedrijf of willekeurige sortering mag het conflict niet oplossen.

De arbeidscontractresolver controleert daarna onder meer:

- contractstatus en volledige geldigheid voor het dienstinterval;
- canonieke taaksoort en contractfunctie;
- expliciete `cao_key` en toepasselijke CAO-configuratie;
- kwalificaties, functieclassificatie en beveiligingsstatus;
- de actieve relatie van de medewerker met het werkgeversbedrijf;
- werkgeversgebonden documenten en beveiligingspassen;
- CAO-, rust-, arbeidstijd- en contracturenregels.

Een dienst mag `required_cao_key` bevatten wanneer de aard van het werk dit
juridisch vereist. Dat veld is dan alleen een compatibiliteitsvoorwaarde. Het
wordt nooit de loon-CAO en vult een ontbrekende contract-CAO niet aan.

## Datum- en intervalregels

Alle gebruikersdatums zijn kalenderdatums in de tijdzone van de dienst,
standaard `Europe/Amsterdam`. Opslagvelden `valid_from` en `valid_until` zijn
inclusief. Resolver- en overlaplogica zet deze intern om naar halfopen
intervallen:

```text
[valid_from 00:00, dag-na-valid_until 00:00)
```

Een open einddatum betekent oneindig in de toekomst. Een nieuwe scope sluit
alleen correct aan op een oude scope wanneer:

```text
oude.valid_until < nieuwe.valid_from
```

De effectieve commerciële periode is de doorsnede van:

- klantcontractperiode;
- objectscopeperiode;
- contractregelperiode;
- eventueel de tariefperiode.

De effectieve arbeidsperiode is de doorsnede van:

- arbeidscontractperiode;
- taaksoortscopeperiode;
- bedrijfstoewijzing en overige contractvoorwaarden.

Een nachtdienst of meerdaagse dienst moet gedurende het volledige interval door
dezelfde vereiste scopes worden gedekt. Wisselt een contract, werkgever, CAO of
commerciële scope tijdens de dienst, dan wordt de dienst bij die grens gesplitst
of blijft hij als niet-publiceerbaar concept staan. Publicatie, facturatie en
loonverwerking blokkeren vervolgens fail-closed. Alleen de startdatum
controleren is onvoldoende.

## Planningmodel en samengestelde diensten

### Taakniveau

De commerciële vraag hoort bij de taak, niet bij de medewerker. Nieuwe
`PlanningTaskOccurrence`- en `PlanningShiftTaskSegment`-projecties bevatten
daarom minimaal:

- `task_type_key`;
- `selling_company_id`;
- `service_responsible_company_id`;
- `customer_account_id`;
- `customer_contract_id`;
- `customer_contract_line_id`;
- contract-, scope- en resolverrevisies in een snapshot;
- een resolutiestatus en dependency-hash.

Een taakdefinitie wordt niet blind voor onbepaalde tijd aan één versiegebonden
contractregel vastgezet. Voor iedere occurrence wordt de commerciële scope op
het dienstinterval opgelost en bij planning/publicatie opnieuw gevalideerd.

### Dienstniveau

Een `PlanningShift` is een tijdcontainer en geen werkgever. De dienst mag
taaksegmenten voor meerdere objecten, klanten en verkopende bedrijven bevatten.
Commerciële identiteit blijft daarom per segment bewaard.

Afgeleide enkelvoudige velden op `PlanningShift` worden alleen gevuld wanneer
alle actieve segmenten dezelfde waarde hebben. Anders gelden bijvoorbeeld:

- `selling_company_id = null` en `selling_company_ids = [...]`;
- `customer_contract_line_id = null`;
- commerciële afhandeling uitsluitend per segment.

Een verschil tussen verkopende bedrijven is dus geen reden om taaksegmenten
technisch uit dezelfde dienst te weren, zolang alle overige planningregels
worden gehaald.

### Medewerkerniveau

De arbeidsroute hoort bij `PlanningAssignment`, omdat iedere bezettingsplaats
een medewerker van een andere werkgever kan bevatten. De assignment bewaart
minimaal:

- `personnel_contract_id`;
- `employing_company_id`;
- `supplying_company_id` zodra die afzonderlijk is bewezen;
- `payroll_cao_key` en CAO-configuratierevisie;
- geselecteerde contractfunctie en taaksoortbewijs;
- resolverstatus, waarschuwingen, dependency-hash en resolutietijdstip.

Alle actieve taaksegmenten onder één assignment moeten naar hetzelfde
`personnel_contract_id`, werkgeversbedrijf en loon-CAO routeren. Wanneer
receptie en mobiele surveillance voor die medewerker onder verschillende
arbeidscontracten vallen, moet LOQ de dienst bij de taakgrens splitsen. Eén
assignment krijgt nooit stilzwijgend meerdere werkgevers of loon-CAO's.

Bij meerdere bezettingsplaatsen wordt deze regel per assignment toegepast.
Twee medewerkers in dezelfde dienst mogen daardoor ieder een ander geldig
werkgeversbedrijf hebben.

## Vergunningen en bedrijfsspecifieke controles

De huidige contractresolver gebruikt één bedrijfswaarde voor meerdere soorten
controle. De doelarchitectuur splitst deze expliciet:

- arbeidscontract, loon-CAO en werkgeversdocumenten gebruiken
  `employing_company_id`;
- een medewerkerpas of toestemming gebruikt de bedrijfsrol waaraan het
  betreffende document juridisch is uitgegeven;
- object-, klant- of opdrachtvergunningen gebruiken
  `service_responsible_company_id`;
- inleners- en uitleenverplichtingen gebruiken zowel het serviceverantwoordelijke
  als het leverende bedrijf;
- `selling_company_id` wordt uitsluitend gebruikt voor commerciële routing en
  facturatie, tenzij een aparte regel bewijst dat dit bedrijf ook een andere rol
  draagt.

Het simpel vervangen van het huidige generieke `company_id` door het
werkgeversbedrijf is daarom geen veilige migratie. Iedere controle krijgt eerst
een benoemde bedrijfsrol.

`Company.holding_company_id` kan aantonen dat ondernemingen organisatorisch aan
dezelfde familiegroep zijn gekoppeld, maar is op zichzelf geen juridische
toestemming om personeel uit te lenen. Een latere effectieve
intercompany-overeenkomst levert dat aanvullende bewijs.

## Voorcontrole, waarschuwingen en achtergrondfeiten

De twee routeringen maken deel uit van de voorbereiding van de planning:

- wijzigingen aan klantcontract, objectscope, taaksoort of contractregel maken
  alleen de betrokken commerciële taakfeiten ongeldig;
- wijzigingen aan arbeidscontract, contracttaakscope, werkgever, CAO,
  kwalificatie of pas maken alleen de betrokken medewerker-/dagfeiten ongeldig;
- een begrensde achtergrondworker herbouwt de geraakte feiten;
- drag en hover lezen uitsluitend actuele lokale feiten en doen geen netwerkcall;
- een ontbrekende commerciële route verschijnt direct en compact oranje als
  `Klantcontract koppelen`;
- ontbreekt op een geplande medewerker een bewezen `personnel_contract_id`,
  `employing_company_id` of `payroll_cao_key`, dan verschijnt direct en compact
  oranje `Arbeidscontract koppelen`;
- deze ontbrekende koppelingen blokkeren het maken, verslepen, inkorten of
  anders bewerken van de conceptplanning niet;
- ambigue, meervoudige en tegenstrijdige routes krijgen een afzonderlijke,
  ernstigere status en worden nooit als een gewone ontbrekende koppeling of als
  groen getoond;
- verouderde feiten worden evenmin als groen getoond;
- de definitieve planningwrite en publicatie voeren altijd nog een
  autoritatieve controle uit.

De directe oranje indicaties worden uitsluitend uit de reeds geladen lokale
planningprojectie gelezen. Zij wachten niet op een netwerkcall tijdens slepen of
hover. Achtergrondvoorbereiding verlaagt de latency, maar is nooit het finale
bewijs. Definitieve publicatie vereist per taaksegment exact één bewezen
commerciële route en per assignment exact één bewezen arbeidsroute. Alleen een
taak zonder enige klantcontext waarvan iedere gekoppelde dienst expliciet
`customer_billable === false` is, krijgt in plaats daarvan een bevroren
`not_applicable`-bewijs.

Een intercompanyverschil krijgt een afzonderlijke, begrijpelijke status. Het
mag niet worden weergegeven als "geen CAO gevonden" wanneer het arbeidscontract
en diens CAO wel eenduidig zijn.

## Snapshots, publicatie en historie

Een publicatie mag pas doorgaan nadat zowel de commerciële route als de
arbeidsroute uniek en actueel zijn bewezen. Een ontbrekende of ambigue route mag
wel in een concept zichtbaar blijven, maar wordt niet door publicatie
stilzwijgend ingevuld. De publicatie bevriest daarna minimaal:

- alle taaksegmenten met taaksoort, object, klantcontractregel,
  `selling_company_id` en `service_responsible_company_id`;
- alle assignments met arbeidscontract, `employing_company_id`, contractfunctie
  en `payroll_cao_key`;
- gebruikte entityrevisies, geldigheidsperioden, resolverbeleid en hashes;
- waarschuwingen, handmatige besluiten en actor/tijdstip;
- de vastgestelde relatie tussen verkopend, serviceverantwoordelijk en leverend
  bedrijf.

`TaskExecution` erft deze gegevens per uitgevoerd taaksegment. Een latere
contractwijziging herschrijft nooit een bestaande publicatie of uitvoering.
Correcties zijn append-only en verwijzen naar het oorspronkelijke bewijs.

Ook de financiële vervolgstappen zijn fail-closed: klantfacturatie start alleen
met exact één bewezen commerciële route; loonverwerking start alleen met exact
één bewezen arbeidsroute. Een oranje conceptindicatie is dus toestemming om de
planning verder op te bouwen, niet om bedragen definitief te boeken.

Klantfacturatie gebruikt uitsluitend de bevroren commerciële route:

```text
TaskExecution
  -> customer_contract_line_id
  -> customer_contract_id
  -> selling_company_id
  -> klantfactuur
```

Payroll gebruikt uitsluitend de bevroren arbeidsroute:

```text
PlanningAssignment / TaskExecution
  -> personnel_contract_id
  -> employing_company_id
  -> payroll_cao_key
  -> loonverwerking
```

Geen van beide ketens mag de andere keten als fallback gebruiken.

## Gefaseerde implementatie

### Fase 0 — Semantische scheiding en regressiebeveiliging

- Leg de bedrijfsrollen in gedeelde domeinhelpers en API-contracten vast.
- Voeg tests toe voor bedrijf A als verkoper en bedrijf B als werkgever.
- Stop nieuwe code die `PlanningShift.company_id` tegelijk als verkoopbedrijf,
  werkgever en vergunningbedrijf gebruikt.
- Behoud alle bestaande velden additief totdat de migratie aantoonbaar compleet
  is.

### Fase 1 — Canonieke taaksoort en commerciële scopes

- Introduceer `task_type_key` en de gecontroleerde legacymapping.
- Voeg contractobjectscopes toe of materialiseer een gelijkwaardige concrete
  objectscope met dezelfde invarianten.
- Valideer taaksoort-/objectoverlap transactioneel bij activering.
- Laat de facturatieresolver eerst regels over alle actieve contracten filteren
  en pas daarna het unieke contract kiezen.
- Sla de commerciële route per occurrence en taaksegment op.

### Fase 2 — Arbeidscontractscopes over bedrijven heen

- Materialiseer `PersonnelContractTaskScope` uit de contractwizard en bestaande
  `allowed_task_types`.
- Valideer overlap per medewerker en taaksoort bij contractactivering.
- Resolveer arbeidscontracten op taaksoort en interval vóórdat een
  werkgeversbedrijf wordt gekozen.
- Gebruik de geselecteerde contract-CAO voor planning en payroll.
- Splits service-, werkgevers-, pas- en vergunningcontroles naar hun juiste
  bedrijfsrol.

### Fase 3 — Planning, publicatie en achtergrondfeiten

- Voeg commerciële velden per segment en arbeidsvelden per assignment toe.
- Ondersteun samengestelde diensten met meerdere verkoopbedrijven.
- Splits automatisch of blokkeer wanneer segmenten voor één assignment naar
  verschillende arbeidscontracten routeren.
- Breid publicaties en uitvoeringssnapshots uit.
- Neem beide resolveruitkomsten op in de event-driven planningfeitenindex.

### Fase 4 — Intercompany registratie, nog zonder factuur

- Markeer geplande cross-company inzet als projectie.
- Maak na goedgekeurde werkelijk gewerkte tijd een onveranderlijke
  intercompany-urenallocatie of correctie aan.
- Houd commerciële klantfacturatie en payroll volledig operationeel, ook zolang
  een intercompanytarief nog ontbreekt.
- Zet ontbrekende financiële inrichting op `settlement_pending`; verander dit
  niet in een CAO- of planningfout.

### Fase 5 — Intercompany afrekening en facturatie

Deze fase wordt pas gebouwd nadat de urenbron, juridische rollen,
correctiestroom, BTW-behandeling en tariefprecedence afzonderlijk zijn
goedgekeurd.

## Expliciet uitgestelde intercompany-entiteiten

De volgende entiteiten behoren tot de doelarchitectuur maar worden niet als
onderdeel van de huidige planning- of contractrouting ingevoerd:

### `IntercompanyLaborAgreement`

Effectieve toestemming tussen serviceverantwoordelijk/inlenend en
leverend/uitlenend bedrijf, inclusief groepsrelatie, toegestane taaksoorten,
objectscope, compliancebewijs en geldigheidsperiode.

### `IntercompanyRateRule`

Periodegebonden tariefafspraak tussen leverend en afnemend bedrijf. De beoogde
scopes zijn:

- alles tussen twee bedrijven;
- één taaksoort;
- één object;
- één object plus taaksoort.

Wanneer meerdere regels geldig zijn, is de toekomstige vaste precedence:

```text
object + taaksoort > object > taaksoort > alles
```

Binnen dezelfde specificity en periode mag nooit meer dan één actieve regel
bestaan.

### `IntercompanyWorkAllocation`

Onveranderlijk urenfeit per goedgekeurd werkelijk gewerkt taaksegment, met
minimaal bronuitvoering, medewerker, arbeidscontract, taaksoort, object,
klantcontractregel, afnemend bedrijf, leverend bedrijf, werkminuten,
correctierelatie en idempotency key.

Geplande uren mogen als afzonderlijke projectie worden getoond, maar vormen
geen factureerbare allocatie.

### `IntercompanySettlementRun` en `IntercompanySettlementLine`

Periodeafsluiting die nog niet afgerekende allocaties groepeert, tarieven
bevriest, correcties verwerkt en een controleerbaar totaal per bedrijvenpaar
maakt.

### `IntercompanyInvoiceLink`

Auditrelatie van een goedgekeurde settlement naar de uiteindelijke interne
verkoopfactuur, creditnota en eventuele boekhoudkundige tegenboeking.

Ook uitgesteld zijn:

- automatische debiteuren-/crediteurenaanmaak tussen groepsbedrijven;
- BTW- en fiscale kwalificatie van interne doorbelasting;
- verdeling van reistijd, wachttijd en niet-taakgebonden dienstminuten;
- externe uitzend-, payroll- of zzp-leveranciers buiten de familiegroep;
- automatische tariefindexatie op basis van CAO-loonstijgingen;
- grootboek-, consolidatie- en rekening-courantboekingen.

De bestaande `hired_worker_*` velden op `PersonnelContract` worden niet voor
deze interne verrekening hergebruikt. Zij modelleren CAO- en contractregels voor
uitzend- of payrollkrachten en zijn geen intercompany grootboek.

## Tarieven en indexatie

Klanttarieven blijven onderdeel van `CustomerContractRate` en staan los van
loon en intercompanytarieven. Een prijsindexatie kan later een expliciete bron
hebben, bijvoorbeeld:

- vast percentage;
- CBS-index;
- handmatige index;
- een goedgekeurde CAO-loonmutatie.

Een CAO-loonmutatie mag nooit rechtstreeks een klanttarief wijzigen. Zij maakt
een controleerbaar indexatievoorstel met bron-CAO, bronrevisie, percentage,
ingangsdatum en goedkeuring. Een contract bepaalt vooraf of en hoe die bron op
zijn tarieven mag worden toegepast.

## Minimale object-onboarding blijft intact

De eerste objectwizard blijft beperkt tot:

- objectnaam;
- objecttype;
- adres.

Er wordt geen klantcontract, verkopend bedrijf, werkgever, CAO of
intercompany-inrichting verplicht toegevoegd aan deze eerste stap. Na het
aanmaken kan het object als concept bestaan.

De vervolginrichting gebeurt vanuit het klantdossier en de objectconfiguratie:

1. maak of upload een klantcontract;
2. kies het verkopende bedrijf en de klantrelatie;
3. selecteer één of meerdere bestaande klantobjecten;
4. selecteer één of meerdere canonieke taaksoorten;
5. leg perioden, tarieven, indexatieafspraken en overige contractgegevens vast;
6. activeer pas nadat de scope- en uniciteitscontroles slagen.

Een object zonder deze vervolginrichting wordt niet verwijderd en de minimale
wizard wordt niet zwaarder. LOQ toont in het dossier en de planning wel een
gerichte configuratiestatus. Een ontbrekende route blokkeert de conceptplanning
niet: de taak of assignment blijft bewerkbaar met een oranje koppelen-indicatie.
De taak is pas facturatiegereed en de assignment pas publicatie- en
payrollgereed nadat de eigen route uniek is bewezen.

## Acceptatievoorbeelden

### Bedrijf A verkoopt, bedrijf B verloont

- Klantcontract A bevat `reception` voor object X.
- Medewerker M heeft bij bedrijf B een actief arbeidscontract met `reception`
  en een expliciete CAO Particuliere Beveiliging.
- LOQ routeert de klantopbrengst naar A.
- LOQ routeert loon en CAO-controles naar B.
- De inzet wordt als interne levering B aan A gemarkeerd.
- Een ontbrekende intercompanyprijs verandert niet achteraf het gekozen
  arbeidscontract of de CAO.

### Eén klantcontract met meerdere taaksoorten

Contract A bevat voor object X zowel `reception`, `fire_closing_round` als
`mobile_control_round`. Iedere taaksoort heeft één eigen canonieke contractregel
en alle drie resolveren zonder ambiguïteit naar hetzelfde contract.

### Conflicterende klantcontracten

Contract A en contract C bevatten op dezelfde dag beide `reception` voor
dezelfde klant en object X. Activering van de tweede overlappende scope wordt
geweigerd, ongeacht het verkopende bedrijf.

### Gelijke taaksoort op verschillende objecten

Contract A bevat `reception` voor object X en contract C bevat `reception` voor
object Y. Beide zijn geldig omdat de concrete objectscope verschilt.

### Opvolgend contract

Contract A eindigt op 30 juni en contract B begint op 1 juli voor dezelfde
klant, hetzelfde object en dezelfde taaksoort. De intervallen overlappen niet en
de routering kiest op iedere servicedatum exact één contract.

### Conflicterende arbeidscontracten

Medewerker M heeft op dezelfde dag twee actieve arbeidscontractscopes voor
`reception`, één bij A en één bij B. LOQ toont dit als een ernstig
routeringsconflict en publiceert of verloont de assignment niet totdat de
contractscopes zijn gecorrigeerd; primair bedrijf en verkopend bedrijf lossen
dit niet stilzwijgend op. Een bestaand concept blijft zichtbaar voor herstel.

### Samengestelde dienst

Een dienst bevat een receptiesegment verkocht door A en een rondesegment
verkocht door C. Beide segmenten blijven commercieel afzonderlijk. Wanneer M
voor beide taaksoorten via hetzelfde arbeidscontract bij B inzetbaar is, kan één
assignment de dienst dragen. Wanneer de taaksoorten naar verschillende
arbeidscontracten routeren, wordt de dienst bij de taakgrens gesplitst.

## Definitie van gereed voor de routingfasen

De contract- en arbeidsroutering is pas gereed wanneer:

- ieder nieuw taaktype één canonieke sleutel gebruikt;
- iedere taak op datum exact nul, één of meerdere commerciële matches kan
  rapporteren en alleen één match als resolved geldt;
- iedere medewerker op taaksoort en volledig dienstinterval exact nul, één of
  meerdere arbeidscontractmatches kan rapporteren en alleen één match als
  resolved geldt;
- CAO en werkgever uitsluitend uit het geselecteerde arbeidscontract komen;
- samengestelde diensten verkoopcontext per segment bewaren;
- assignments werkgevers- en CAO-context per bezettingsplaats bewaren;
- waarschuwingen vóór de planningactie beschikbaar zijn en een stale status
  nooit groen wordt;
- ontbrekende klant- of arbeidscontractroutering conceptplanning niet blokkeert
  en direct als `Klantcontract koppelen` respectievelijk
  `Arbeidscontract koppelen` wordt getoond;
- ambigue en tegenstrijdige routering zichtbaar ernstiger blijft dan een
  ontbrekende koppeling;
- publicatie beide resoluties met revisie- en hashbewijs bevriest;
- klantfacturatie en payroll aantoonbaar ieder hun eigen route gebruiken;
- de minimale object-onboarding ongewijzigd blijft;
- intercompany facturatie nog uitgeschakeld kan zijn zonder deze basislogica te
  vervormen.
