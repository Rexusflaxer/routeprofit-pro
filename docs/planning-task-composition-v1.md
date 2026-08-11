# Planning: objecttaken en samengestelde diensten (V1)

## Doel

Taken uit het objectdossier zijn de vraag naar werk. De planning zet die vraag
niet automatisch om in een dienst: de planner kiest expliciet welke taakdelen
door één medewerker binnen één dienst achter elkaar worden uitgevoerd.

V1 ondersteunt daarmee beide richtingen van de relatie:

- één taakuitvoering kan over meerdere diensten worden verdeeld;
- één dienst kan meerdere taakuitvoeringen van één of meer objecten bevatten.

## Domeinmodel

`ObjectTaskDefinition` blijft de herhaaldefinitie in het objectdossier. Tijdens
`planningApi.bootstrap_range` ontstaat voor ieder toepasselijk tijdvak en iedere
datum één `PlanningTaskOccurrence`. Die occurrence bevriest de taak-, object-,
klant- en beveiligingsplancontext die de planner op dat moment gebruikt.
Ieder roosterblok krijgt daarbij een onveranderlijke `period_key`; legacyblokken
worden op tijdvakidentiteit gereconcilieerd zodat een gewone taakbewerking geen
dubbele planningsvraag maakt.

`PlanningShiftTaskSegment` is de geordende allocatie tussen occurrence en
`PlanningShift`. `PlanningShift.task_id` blijft gereserveerd voor de bestaande
legacy `Task`-relatie van routes.

```text
ObjectTaskDefinition
        │ materialiseren per datum/tijdvak
        ▼
PlanningTaskOccurrence ◄──── PlanningShiftTaskSegment ────► PlanningShift
        1                           n                         1
```

## Harde regels

- Een segment heeft een positieve duur en ligt volledig binnen het occurrence-venster.
- Segmenten binnen één dienst overlappen niet; de server bepaalt de chronologische volgorde.
- Segmenten van dezelfde occurrence overlappen ook niet wanneer ze in verschillende diensten staan.
- De unie van alle actieve segmentminuten is nooit groter dan `required_minutes`.
- Aansluitende overdrachten zijn toegestaan: ochtend `08:00–16:00` en avond `16:00–24:00` delen geen minuut.
- Ieder betrokken object moet een uitvoerend bedrijf hebben en één samengestelde dienst gebruikt exact één bedrijf; meerdere objecten en klanten zijn wel mogelijk.
- `required_count` blijft het aantal personeelsplaatsen en is nooit het aantal taken.
- Alle samenstellingsmutaties gebruiken een stabiele idempotency key, serialiseren occurrence-dekking met CAS-reserveringen en schrijven een planningaudit.
- De occurrence- en segmententiteiten zijn voor beheerders leesbaar, maar uitsluitend `planningApi` mag ze schrijven.

## Plannerinteractie

De rechterkolom heeft twee expliciete werkmodi:

1. **Taken** toont open en gedeeltelijk geplande occurrences met dekkingsvoortgang.
2. **Medewerkers** behoudt de bestaande veilige, eenmalige toewijzing en drag-and-drop.

`Nieuwe dienst` of `Aan deze dienst` opent altijd eerst de dienstcomposer. Pas
`Conceptdienst opslaan` schrijft de dienst en segmenten. Er bestaat dus geen
blijvende taak- of medewerkerselectie die een volgende klik stil kan toepassen.

De dienstkaart toont een taakstrip en aantallen. Diensten met meerdere objecten
staan in de vaste groep **Samengestelde diensten**. Tijden aanpassen gebeurt bij
deze diensten uitsluitend via de composer; los verplaatsen of kopiëren is
geblokkeerd om verweesde taakdekking te voorkomen.

Een nooit gepubliceerde conceptdienst kan expliciet worden verwijderd. De
segmenten en eventuele conceptbezetting worden auditbaar ingetrokken en de taken
keren terug naar de werkvoorraad. Een gepubliceerde dienst vereist later een
formele annuleringsworkflow en kan niet via deze snelle actie verdwijnen.

## Publicatie en historie

Publicatieschema V2 bevat shifts, personeelstoewijzingen, task occurrences en
task segments in dezelfde checksumsnapshot. Open of gedeeltelijke taakdekking is
een kritieke publicatiewaarschuwing en vereist een expliciete reden. Overlap of
overallocatie wordt altijd geblokkeerd. Ook een ontbrekende gepubliceerde
beveiligingsplanrevisie is kritisch. De occurrence bevat een checksumsnapshot van
de daadwerkelijk gepubliceerde planrevisie, inclusief uitvoeringsinstructies.

Publicatie berekent dekking uitsluitend met segmenten uit dezelfde scope als de
snapshot. Een stabiele publicatie-idempotency key maakt hervatten na
responsverlies mogelijk; actieve compositiereserveringen en dubbele source keys
blokkeren publicatie. Backend- en frontendscans worden expliciet gepagineerd om
de Base44-standaardlimiet van 50 records niet stil te overschrijden.

Een objecttaak wordt gearchiveerd in plaats van hard verwijderd. Daardoor blijven
reeds geplande en gepubliceerde occurrences herleidbaar.

## Bewuste V1-grenzen

- Reistijd tussen objecten wordt als controlewaarschuwing gemarkeerd; automatische routeberekening volgt later.
- De composer plant één kalenderstartdatum per dienst; nachteinden blijven ondersteund.
- Routes blijven als legacy diensten zonder task segments werken en worden niet gemigreerd.
