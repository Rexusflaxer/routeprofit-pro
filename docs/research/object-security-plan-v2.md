# Beveiligingsplan V2: operationele planbibliotheek

Onderzoeksdatum: 5 augustus 2026
Status: leidend ontwerpbesluit voor fase 1
Objectroute: `/Objects?id={objectId}&tab=security-plan&view={view}&row={row}`

## Besluit in het kort

De tab **Beveiligingsplan** wordt geen verzameling losse categorieformulieren en
ook geen rooster. Het wordt de operationele planbibliotheek van één object. Een
planvariant beschrijft **hoe** één herkenbare uitvoering moet verlopen; de tab
Taken beschrijft later **wanneer** die variant nodig is; Planning voegt concrete
taken samen tot een dienst; de mobiele app voert exact de gepubliceerde
plansnapshot uit.

De vaste domeinketen is:

```text
Planvariant
  -> onveranderlijke gepubliceerde revisie
    -> toekomstige roosterregel
      -> concrete taak/occurrence met revisiesnapshot
        -> dienst/PlanningShift met een of meer taken
          -> TaskExecution met uitvoering en bewijs
```

Deze scheiding voorkomt drie gevaarlijke fouten:

1. een gewijzigde instructie herschrijft geen reeds geplande of uitgevoerde
   werkzaamheden;
2. een terugkerende roosterregel wordt niet aangezien voor een concrete taak;
3. een dienst met taken van meerdere objecten verliest nooit de identiteit en
   instructieversie van de afzonderlijke taken.

## Onderzoeksbasis

### Bestaande LOQ-referenties

- `Reference/SequriX/README.md` beschrijft de operationele keten
  contractregel -> taakuitvoeringspatroon -> concrete taak -> dienst. Een
  taakpatroon bevat object, bloktijd, geplande duur, instructies, optionele
  checkpointroute, herhaling, feestdagen en uitzonderingen. Een dienst is de
  werkperiode waarin een of meer concrete taken worden gepland. Een
  checkpointroute is een geordende reeks punten en hoort niet in één tekstveld.
- `Reference/Secure-it/README.md` maakt onderscheid tussen een structurele
  blauwdruk en concreet gepubliceerde planning. Structurele object-/dienst-
  instructies en eenmalige instructies hebben een andere geldigheid. Documenten
  kunnen bovendien vooraf, pas op locatie of alleen voor bepaalde functies en
  zones zichtbaar zijn.
- `Reference/Secusoft/README.md` scheidt opdrachtgever, object/opdracht, dienst
  en taak. Herhaalregels blijven los van gegenereerde diensten, zodat één
  uitvoering kan worden gewijzigd zonder stil de hele reeks aan te passen.
- `Reference/WebappLandscape/FUNCTION-MATRIX.md` kiest TrackTik als primaire
  referentie voor postorders, sitetaken, tours en checkpoints: instructies zijn
  objectgebonden en versieerbaar; een ronde legt volgorde, controlepunt,
  vereiste handeling en bewijs afzonderlijk vast.
- `Reference/WebappLandscape/deep-dives/02-security-operations.md` bepaalt dat
  de gebruikte postorder-/actieplanversie bij de uitvoering moet blijven. Een
  actieve of historische uitvoering mag niet veranderen wanneer de bron later
  wordt bewerkt.
- `Reference/LOQ-ui-reference-ui-com-ajax.md` introduceert het LOQ Object Design
  Center: plattegrond importeren, zones en controlepunten plaatsen, taken en
  rondes koppelen, loopvolgorde simuleren, valideren en daarna publiceren.

### Vertaling naar LOQ

De referenties bevestigen hetzelfde patroon, maar LOQ combineert dit met een
rustigere dossierervaring:

- tabellen voor overzicht en schaal;
- een korte wizard voor de basis;
- een aparte werkruimte voor inhoudelijke configuratie;
- één concept naast één actuele publicatie;
- duidelijke aandachtspunten in plaats van een ondoorzichtige blokkeerflow;
- append-only historie voor publicaties en gevoelige wijzigingen.

## Domeinontwerp

### Planvariant en revisie

`ObjectSecurityPlan` is de stabiele identiteit van één uitvoerbare variant,
bijvoorbeeld `Brand- & sluitronde - Volledig` of `Receptie - Weekend`. De
identiteit bewaart object- en klantscope, taaktype, variantnaam, status,
concurrencyversie en een verwijzing naar de actuele gepubliceerde revisie.

`ObjectSecurityPlanRevision` bewaart de inhoud van een versie:

- revisionummer en lifecycle `draft`, `published` of `superseded`; archiveren
  gebeurt op het bovenliggende plan zonder historische revisies te verwijderen;
- duurmodel en eventuele geplande duur;
- standaardsecties en toegestane secties;
- beleid voor operationele afwijkingen;
- geordende instructieblokken en stappen;
- verwijzingen naar installaties, secties en kaartpunten;
- plattegrond-ID en expliciete plattegrondrevisie;
- route-overlay met start, einde, lijn en instructiepunten;
- publicatieactor, publicatietijd en inhoudschecksum.

Een gepubliceerde revisie is onveranderlijk. Bewerken maakt of hergebruikt het
concept voor de volgende revisie. Publiceren vervangt de actuele verwijzing en
markeert de vorige publicatie als `superseded`, maar verwijdert haar niet.

### Taaktypen en vrije varianten

LOQ levert herkenbare taaktypen zoals objectbeveiliging, receptie,
brand-/sluitronde, openingsronde, externe controle, mobiele controle,
sluitbegeleiding, toegangscontrole en brandwacht. Een gebruiker kan daarnaast
`anders` kiezen met een eigen taaktypenaam.

Het taaktype bepaalt suggesties, niet de inhoud. Varianten zijn vrije,
objectgebonden configuraties. Daardoor zijn onder hetzelfde taaktype meerdere
geldige werkwijzen mogelijk zonder categorieën of instructies te dupliceren.

### Duurmodellen

Iedere revisie gebruikt precies één duurmodel:

| Model | Betekenis | Voorbeeld |
| --- | --- | --- |
| `fixed` | De planvariant heeft een vaste verwachte uitvoeringsduur. | Volledige sluitronde van 75 minuten. |
| `schedule_defined` | Begin en einde worden later door de roosterregel bepaald. | Receptiedienst van 10:00 tot 18:00. |
| `none` | Er is bewust geen geplande duur. | Naslag-/ondersteunende instructie zonder tijdsclaim. |

Alleen `fixed` vereist een positief geheel aantal minuten. Bij de andere twee
modellen is `duration_minutes` leeg. `0` is nooit een geldige vaste duur.

### Instructieblokken en stappen

Een lange vrije tekst is onvoldoende voor uitvoering en toekomstige mobiele
ondersteuning. Een revisie bevat geordende blokken, bijvoorbeeld dienststart,
bezoekers, leveranciers, controle, sluiten, alarmhandeling, sleutelhandeling,
overdracht en afwijkingen. Een blok bevat geordende stappen.

Een stap heeft minimaal een titel/instructie en kan optioneel verwijzen naar:

- één objectsectie per stap; meerdere secties worden via verschillende stappen
  of de planbrede sectiescope gecombineerd;
- een kaartpunt;
- een installatie zonder credentials;
- een vereiste handeling, zoals controleren, openen, sluiten, inschakelen,
  uitschakelen, registreren of overdragen;
- een later bewijs- of bevestigingsvereiste.

Volgorde wordt als integerpositie opgeslagen. Identiteiten blijven stabiel bij
verslepen, zodat historie en toekomstige mobiele acknowledgement naar dezelfde
stap kunnen verwijzen.

### Objectsecties en hybride selectie

`ObjectSection` is herbruikbare objectinrichting met klant-/objectscope, unieke
code binnen het object, naam, omschrijving, optionele kaartgeometrie, status en
concurrencyversie. Een sectie is niet hetzelfde als een alarmzone en bevat geen
alarmcode.

Een planrevisie kan drie sectiemodellen gebruiken:

- `not_applicable`: secties zijn niet van toepassing;
- `fixed`: alle opgegeven standaardsecties horen altijd bij de uitvoering;
- `default_with_controlled_override`: een standaardselectie plus een grotere
  toegestane set.

Bij `default_with_controlled_override` moet elke standaardsectie ook in de
toegestane set staan. De backoffice bewaart zo het veilige maximum. In de
toekomstige planningsfase kan de planner de concrete selectie voor een taak
vastleggen. Een uitvoerder mag alleen binnen die set afwijken en alleen met een
verplichte reden. De concrete selectie en reden komen in de occurrence-/
uitvoeringssnapshot, nooit terug in de bronrevisie.

### Plattegrond en route

Een route-overlay verwijst altijd naar een bestaande `ObjectFloorPlan` én het
revisionummer dat tijdens het intekenen zichtbaar was. De overlay bevat alleen
genormaliseerde geometrie en stabiele referenties, geen ruwe opslag-URL's.

Een route of plattegrond is in fase 1 aanbevolen maar niet verplicht. Ontbreekt
de route, dan krijgt het plan bij controle/publicatie aandachtspunt
`route_missing`; publicatie blijft mogelijk. Zodra een concept wel een
plattegrond gebruikt, moet die bij hetzelfde object horen, gepubliceerd zijn en
exact hetzelfde revisionummer hebben als de route. Een ontbrekende, niet-
gepubliceerde of afwijkende revisie blokkeert die nieuwe publicatie. Een reeds
gepubliceerde historische planrevisie houdt uiteraard haar oorspronkelijke
plattegrondreferentie en wordt niet achteraf herschreven.

## Saturn Petcare als acceptatiescenario

Voor object `Saturn Petcare` moet de bibliotheek minstens deze onafhankelijke
varianten kunnen bevatten:

| Taaktype | Variant | Duurmodel | Secties |
| --- | --- | --- | --- |
| Receptie | Werkdagen | `schedule_defined` | Niet van toepassing |
| Receptie | Weekend | `schedule_defined` | Niet van toepassing |
| Brand- & sluitronde | Volledig | `fixed` | Alle acht, vast |
| Brand- & sluitronde | Productieavond | `fixed` | Standaardselectie binnen acht toegestane secties |
| Brand- & sluitronde | Secties 1 t/m 4 | `fixed` | Secties 1-4, vast |
| Openingsronde | Op aanvraag | `fixed` | De voor opening relevante secties |

De twee receptievarianten kunnen verschillende instructieblokken hebben zonder
een kunstmatige duur. De volledige en gedeeltelijke rondes kunnen verschillende
duur, route en alarmhandelingen hebben. De productieavond bewaart welke
secties maximaal gekozen mogen worden; de uiteindelijke avondselectie hoort
later bij de concrete taak.

## Fase 1: Beveiligingsplan

Fase 1 levert:

- een full-screen planbibliotheek met URL-gestuurde filters en selectie;
- een korte wizard voor taaktype, variantnaam, uitvoeringsvorm en duurmodel;
- een werkruimte met Overzicht, Instructies, Secties & route en Controle &
  versies;
- concept opslaan, dupliceren, publiceren en archiveren;
- beheer van herbruikbare objectsecties;
- duidelijke gereedheidswaarschuwingen;
- revisie- en mutatiehistorie;
- migratie van bestaande `ObjectSecurityPlan`-records;
- server-side scope, idempotency, optimistic concurrency en audit.

Expliciet buiten fase 1 vallen:

- de functionele verbouwing van de tab Taken;
- herhaalregels, feestdagen en uitzonderingen;
- het genereren van concrete occurrences;
- selecteren van avondsecties op een concrete datum;
- het samenvoegen van taken tot diensten;
- routeoptimalisatie en automatische duurberekening;
- mobiele uitvoering, acknowledgement, checkpoints en bewijs.

De fase-1-entiteiten en API houden wel stabiele sleutels vrij voor deze
vervolgstappen. De UI toont geen niet-werkende rooster- of mobiele acties.

## Backend- en beveiligingsgrenzen

### API

Beveiligingsplannen gebruiken `customerPlatformApi`; er komt geen nieuwe
functiemap. De backend levert allowlisted DTO's en ondersteunt minimaal:

- lijst en detail binnen expliciete klant-/objectscope;
- plan aanmaken en dupliceren;
- conceptrevisie opslaan;
- revisie publiceren;
- plan archiveren;
- objectsecties lijst/aanmaken/wijzigen/archiveren;
- expliciete legacy-migratie met standaard `dry_run=true`.

Iedere mutatie vereist `idempotency_key` en `expected_version`. De backend
controleert persona, BV, klant en object vóór de eerste inhoudelijke lezing.
Frontendcode gebruikt geen directe entity-CRUD. Gelijktijdige wijzigingen
leveren een verklaarde `409` en overschrijven elkaar niet stil.

Niet-dry-run plan-, sectie- en legacy-planmutaties worden per object kortdurend
geserialiseerd via een apart CAS-slot op `SurveillanceObject`. De slotversie
staat los van de gewone objectdossierversie. Dit voorkomt dubbele plannen,
dubbele sectiecodes en verweesde migratierevisies bij parallelle retries. Een
actief slot levert een retrybare `409`; na voltooiing wordt alleen het slot
vrijgegeven. Een migratie-dry-run reserveert geen slot en schrijft ook geen
generiek mutatie- of auditevent.

### Audit en immutability

Alle create-, update-, duplicate-, publish- en archive-acties schrijven een
append-only `CustomerEvent` met objectscope, actor, idempotency key, resource-ID,
revisie en een allowlisted wijzigingssamenvatting. Auditpayloads bevatten geen
credentials, ruwe bestands-URL's of vrije before/after-dumps van gevoelige
velden.

Gepubliceerde revisies mogen niet via een algemene updateactie worden gewijzigd
of verwijderd. De server leidt revisionummer, publicatiestatus, actor,
checksum en actuele publicatiereferentie af; een client mag die waarden niet
vertrouwen of zelf afdwingen.

### Geheimen en gegevensminimalisatie

Schakel-, meldkamer-, kluis-, retour- en installateurscodes horen niet in:

- plan- of revisievelden;
- instructiestappen;
- route-overlays;
- zoekresultaten, tabel-DTO's of auditpayloads;
- toekomstige planning- of iOS-snapshots.

Een instructiestap kan uitsluitend verwijzen naar een installatie of een
doelgebonden credentialbundel. Een toekomstige mobiele endpoint ontsluit een
code pas binnen actieve dienst-/taakcontext, met aanvullende authenticatie,
korte geldigheid en aparte read-audit. Een planpublicatie kopieert het geheim
nooit.

Ruwe plattegrond- en bestands-URL's blijven privé. De route-overlay bevat alleen
coördinaten en IDs; bestandsweergave verloopt via bestaande veilige
`ManagedFile`-mechanismen.

## Migratie en compatibiliteit

De migratie is additief en herhaalbaar. Zij wordt alleen via
`migrate_legacy_object_security_plans` gestart; gewone list/detail-reads
muteren nooit data. De actie vereist klant- en objectscope, een
`idempotency_key`, `expected_version=0` en gebruikt standaard `dry_run=true`:

1. ieder legacy `ObjectSecurityPlan`-record wordt één V2-planvariant;
2. categorie wordt taaktype, titel wordt variantnaam, omschrijving blijft
   samenvatting;
3. iedere legacy `scope_type` wordt veilig `not_applicable`; ook bij `full` of
   `partial` worden geen objectsecties stil verzonnen. De gebruiker richt de
   secties na migratie bewust in;
4. een geldige legacyduur wordt `fixed`; zonder duur wordt het model afgeleid
   als `schedule_defined` voor continue receptie/objectbeveiliging en anders als
   `none`, waarna de UI dit als controlepunt toont;
5. iedere legacy instructieregel wordt in volgorde een stap in één blok
   `Algemene instructies`;
6. `active` maakt alleen een concept, nooit automatisch een publicatie;
7. `archived` blijft gearchiveerd;
8. legacy-ID, migratiebron en een CAS-migratiemarker worden bewaard zodat
   retries geen duplicaten maken;
9. iedere actieve legacyvariant krijgt `migration_review_required=true`; een
   gebruiker moet de gemigreerde inhoud dus controleren voordat die kan worden
   gepubliceerd.

Onvolledige of ambigue records krijgen een migratieaandachtspunt. Er worden
geen secties, routes, installatiereferenties of publicaties verzonnen.
`ObjectTaskDefinition`, `Task`, `PlanningShift`, `TaskExecution` en bestaande
historie worden in fase 1 niet herschreven.

## Toekomstige contracten

### Taken en Planning

Een toekomstige roosterregel verwijst naar `security_plan_id` en exact één
`security_plan_revision_id`. Publiceren van een nieuw plan wijzigt bestaande
regels of concrete taken niet automatisch. De gebruiker kiest expliciet of een
toekomstige reeks vanaf een ingangsdatum naar de nieuwe revisie gaat.

Een gegenereerde occurrence bewaart minimaal:

- roosterregel-ID;
- plan- en revisie-ID;
- veilige plansnapshot plus checksum;
- datum, tijdvenster en geplande duur;
- concrete sectieselectie;
- afwijkingsreden indien relevant;
- status en serie-/uitzonderingscontext.

`PlanningShift` kan via geordende taaksegmenten meerdere occurrences bevatten,
ook van verschillende objecten. De volgorde in de dienst staat los van de
volgorde van instructiestappen binnen één taak. Eén occurrence mag over meerdere
niet-overlappende segmenten en diensten worden verdeeld. De gezamenlijke actieve
dekking mag de vereiste duur nooit overschrijden; aansluitende overdrachten zijn
wel toegestaan. Eén segment hoort altijd bij exact één dienst.

`TaskExecution` krijgt dezelfde plan-/revisiereferenties en de immutable
plansnapshot die bij uitvoering gold. Dit is de bron voor latere rapportage,
review en bewijs; niet de inmiddels actuele planrevisie.

### iOS-routepackage

De huidige iOS-`RouteStop` kent onder meer `taskExecutionId`, `originalTaskId`,
generieke instructies en een `floorPlanSummary`, maar nog geen versieerbaar
beveiligingsplan. Een toekomstige additive DTO-uitbreiding bevat:

- `security_plan_id` en `security_plan_revision_id`;
- `security_plan_checksum`;
- taakvariantnaam, duurmodel en veilige sectiesnapshot;
- geordende instructieblokken/stappen met stabiele IDs;
- route-overlay en de bijbehorende floorplan-ID/revisie;
- acknowledgement- en bewijsvereisten, zodra die backendworkflow bestaat.

Nieuwe velden blijven tijdens de overgang optioneel zodat oudere routepackages
en iOS-builds decodeerbaar blijven. De app toont uitsluitend de plansnapshot uit
de routepackage en haalt niet zelfstandig de nieuwste planrevisie op tijdens een
actieve dienst. Offline opslag volgt de bestaande routepackagebeveiliging en
bevat nooit credentials.

## Verificatie- en acceptatiecriteria

- De zes Saturn-varianten zijn zonder duplicatie van taaktypen modelleerbaar.
- `fixed`, `schedule_defined` en `none` handhaven hun eigen duurregels.
- Bij selecteerbare secties is de standaardset altijd een deelverzameling van
  de toegestane set.
- Een plan zonder route levert een waarschuwing en mag worden gepubliceerd.
- Een gepubliceerde revisie kan niet worden overschreven; wijzigen creëert een
  volgende conceptrevisie.
- Een plattegrondroute blijft aan het oorspronkelijke revisionummer gekoppeld.
- Migratie bewaart legacy volgorde, status en IDs en publiceert niets stil.
- Een retry met dezelfde idempotency key maakt geen dubbel plan of revisie.
- Een verouderde `expected_version` overschrijft geen gelijktijdige wijziging.
- Cross-customer- en cross-object-ID's worden server-side geweigerd.
- Schema's, DTO's en auditpayloads bevatten geen code-, secret- of ruwe
  bestands-URLvelden.
- Payloads met geneste code-/secretvelden of expliciete codetekst zoals
  `Alarmcode: 1234` worden server-side geweigerd. Normale werkinstructies over
  het in- of uitschakelen van alarm blijven toegestaan; verdachte legacytekst
  wordt tijdens migratie door een controlewaarschuwing vervangen.
- Twee gelijktijdige niet-dry-run mutaties op hetzelfde object leveren precies
  één slotbezitter; de andere krijgt een retrybare `409`. Na vrijgave kan een
  retry veilig verder.
- Dezelfde idempotency key met dezelfde actor, scope en payload levert hetzelfde
  resultaat en maakt geen dubbel plan, sectie of migratierevisie. Hergebruik met
  een andere payload wordt geweigerd.
- Toekomstige Taken-, Planning- en iOS-koppelingen kunnen additief worden
  ingevoerd zonder fase-1-records of historische uitvoeringen te herschrijven.
