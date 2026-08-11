# Planningmatrix V2 - referentieanalyse en ontwerpbesluit

Datum: 2026-08-11

## Doel

De planning krijgt twee gelijkwaardige werkperspectieven met dagen altijd verticaal:

1. **Objectweergave** - objecten staan horizontaal. Iedere dagrij toont de taakvraag per object. Medewerkers worden vanuit de vaste rechterkolom naar een open taak of bezettingsplaats gesleept.
2. **Medewerkerweergave** - medewerkers staan horizontaal. Iedere dagrij toont hun toegewezen diensten. Open of gedeeltelijk geplande objecttaken worden vanuit de vaste rechterkolom naar de juiste medewerker en dag gesleept.

De weergave ondersteunt een kalenderweek en een zelfgekozen periode van maximaal 63 dagen.

Versie 1 maakt in dit scherm geen nieuwe dienstdefinities of objecttaken. Die bronconfiguratie blijft bij klant/object. De planner vormt uitsluitend concrete, gedateerde diensten uit bestaande taakuitvoeringen en deelt daar medewerkers op in.

## Herbeoordeelde referenties

### Secure-it

Bronnen: `Reference/Planning/Secure-it-Planning.md` en `Reference/Secure-it/source-pdfs/Secure-it Handleiding.pdf`, in het bijzonder de planningsbeelden rond pagina 13-15.

Sterk:

- compact rooster met medewerker-, dag- en objectcontext in hetzelfde scherm;
- filters voor objecten, functiegroepen, diensten en toegestane medewerkers;
- mogelijkheid om alleen medewerkers te tonen die op een object mogen werken, eventueel inclusief hun eigen planning;
- beveiligingsspecifieke relatie tussen object, restricties, contract, loon en publicatie.

Niet overnemen:

- een geselecteerde medewerker mag niet als verborgen, blijvende vulmodus actief blijven;
- een volgende klik mag nooit stil dezelfde medewerker op een ander doel zetten.

### Shiftbase

Bronnen: `Reference/Planning/Shiftbase.md`, [Diensten toevoegen, bewerken en verwijderen](https://help.shiftbase.com/nl/diensten-toevoegen-bewerken-en-verwijderen) en [Werkrooster](https://help.shiftbase.com/nl/werkrooster).

Sterk:

- diensttemplates staan als duidelijke sleepbron naast het rooster;
- een dienst wordt rechtstreeks naar een concrete medewerker en dag gesleept;
- verplaatsen en kopieren zijn na de drop expliciet verschillende acties;
- beschikbaarheid, ATW, vaardigheden, open diensten en publiceren zijn in dezelfde roostercontext zichtbaar.

Vertaling naar LOC: de rechterkolom is perspectiefgebonden. In objectweergave bevat zij medewerkers; in medewerkerweergave bevat zij objecttaken.

### Eitje

Bronnen: [Introductie rooster](https://help.eitje.app/nl/articles/8228407-introductie-rooster) en `Reference/Planning/README.md`.

Sterk:

- afzonderlijke weergaven per team en per teamlid;
- medewerkers en beschikbaarheid worden op het moment van plannen zichtbaar gemaakt;
- een teamlid kan direct naar een shift worden gesleept;
- tabelweergave voor langere periodes is gescheiden van het snelle weekrooster.

Vertaling naar LOC: object- en medewerkerperspectief gebruiken dezelfde matrixgrammatica, zodat omschakelen geen nieuwe bediening hoeft te worden geleerd.

### Workfeed

Bronnen: [diensten maken en publiceren](https://help.workfeed.io/en/articles/5060998-how-to-create-and-publish-shifts), [open diensten](https://help.workfeed.io/en/articles/8675290-how-to-take-extra-shifts), [medewerkerfilter met uren en wensen](https://help.workfeed.io/en/articles/5813877-get-an-overview-of-hours-and-wishes-with-the-employee-filter), [persoonlijke roosterweergave](https://help.workfeed.io/en/articles/5071090-how-to-change-the-interface-of-the-schedule), [rule checker](https://help.workfeed.io/en/articles/13860240-how-to-use-the-rule-checker), [auto-assign](https://help.workfeed.io/en/articles/5405611-how-to-create-schedules-automatically-with-auto-assign), [kopieren](https://help.workfeed.io/en/articles/8672158-how-to-copy-paste-shifts-days-and-weeks), [templates](https://help.workfeed.io/en/articles/4466208-how-to-use-templates) en [bulkbewerking](https://help.workfeed.io/en/articles/15379540-how-to-bulk-edit-shifts), geraadpleegd op 11 augustus 2026.

Sterk:

- direct in het rooster een dienst maken, met een herkenbare conceptstatus en publiceren per dienst of zichtbare periode;
- open diensten, aanvragen, ruilen en overdragen vormen een duidelijke selfservice-laag met rol-, overlap- en goedkeuringscontroles;
- de medewerkerfilter combineert beschikbaarheid met ingeplande uren ten opzichte van minimum en maximum;
- iedere planner kan de informatiedichtheid van het rooster voor het eigen account aanpassen, zonder de weergave van collega's te veranderen;
- de rule checker verklaart overlap, rust, vrije dagen, dienstduur en geblokkeerde uren op de plek waar de planner beslist;
- auto-assign laat een dienst bewust open als geen geschikte medewerker bestaat;
- kopieren, meerweekse templates, bulkbewerking en direct ongedaan maken versnellen herhaalwerk zonder de concept/publicatiegrens te verbergen.

Niet als bewezen overnemen: de officiële documentatie bevestigt Alt/Option-slepen voor kopieren, maar geen algemene medewerker-naar-dienst-drag-and-drop, objectmatrix of dienst met geordende taaksegmenten over meerdere objecten.

Vertaling naar LOC: neem de rustige kaarthierarchie, lokale foutuitleg, herstelbaarheid en duidelijke concept/publicatiefeedback over. Behoud LOC's eigen object-taakmodel en beide matrixperspectieven. Week/dag kopieren, templates, bulkbewerking, open-dienstselfservice en auto-assign horen na V1 in de vervolgfase.

### Secusoft

Bronnen: `Reference/Secusoft/README.md`, de officiële [managementhandleiding](https://www.secusoft.nl/uploads/pdf/snel-starten-handleiding-voor-management.pdf), [plannerhandleiding](https://www.secusoft.nl/uploads/pdf/snel-starten-handleiding-voor-planners-1.2.pdf), [mobiele-surveillancetaken](https://www.secusoft.nl/mobiele-surveillance-taken-ptf1102) en [Secusoft-app](https://www.secusoft.nl/secusoft-app), geraadpleegd op 11 augustus 2026.

Sterk:

- wisselbare roosterassen, waaronder datum/opdracht en datum/medewerker, plus week, maand en vier weken;
- open dienst naar medewerker slepen en bestaande diensten verplaatsen naar medewerker, datum of opdracht;
- classificaties, contracturen, ORT/reiskosten/verschuivingstoeslag en een dagelijkse CAO-check;
- losse mobiele-surveillancetaken vormen samen een routelijst voor één dienst;
- onafgerond werk wordt expliciet afgehandeld of aan de volgende dienst overgedragen.

Vertaling naar LOC: een dienst is een container met geordende taaksegmenten. Resterende tijd en personeelsbezetting blijven twee afzonderlijke dekkingen.

### Rostar CAS van Paralax

Bronnen: [Plan client](https://paralax.nl/oplossingen/producten/plan-client), [Rostar CAS Beveiliging](https://paralax.nl/oplossingen/productsheets/rostar-cas-beveiliging) en [Shiftpicking-productsheet](https://paralax.nl/uploads/shiftpickingproductsheet-o4x01z21g40sl3itkbdj.pdf), geraadpleegd op 11 augustus 2026.

Sterk:

- doelgerichte werkbladen op dag-, week-, periode-, maand- en jaarniveau;
- open bezettingen worden alleen aan geschikte medewerkers aangeboden;
- beschikbaarheid, afwezigheid, kwalificaties, uren, reisafstand, kosten, ATW en CAO sturen de kandidaatselectie;
- beveiligingsplanning kan op competentie, locatie/object en tijdvak werken;
- diensten en de precieze taken binnen die diensten zijn afzonderlijke planningslagen.

Niet als bewezen overnemen: de openbare bronnen leggen geen drag-and-dropcontract of vaste matrixassen vast.

### Roosterplaats

Bronnen: [planbord](https://roosterplaats.freshdesk.com/support/solutions/articles/43000682012-hoe-werkt-het-planbord-), [medewerkers inplannen](https://roosterplaats.freshdesk.com/support/solutions/articles/43000682013-hoe-kan-ik-medewerkers-inplannen-) en [roosterkleuren](https://roosterplaats.freshdesk.com/support/solutions/articles/43000679591-wat-betekenen-de-kleuren-op-het-rooster-), geraadpleegd op 11 augustus 2026.

Sterk:

- medewerker naar dienst slepen en de toewijzing daarna verplaatsen;
- beschikbaar en niet-beschikbaar personeel is zichtbaar gescheiden;
- iconen verklaren overlap, verlof, contracturen en maximale inzet;
- rood/groen en `1/2` maken onderbezetting en benodigde bezetting onmiddellijk leesbaar;
- afwijkende begin- en eindtijd per medewerker ondersteunt gedeeltelijke bezetting.

Vertaling naar LOC: toon op ieder werkblok zowel minuten (`180/480`) als bezettingsplaatsen (`1/2`) en maak de reden voor een ongeschikte kandidaat zichtbaar vóór of direct na de drop.

### Superplan

Bronnen: [Superplan](https://getsuperplan.com/), [security services](https://getsuperplan.com/industries/security-services/), [grid-acties](https://shiftparade.notion.site/Quick-actions-on-Superplan-s-schedule-grid-4c268092444849c79fe9eae7bd0d86e9) en [releasehistorie](https://shiftparade.notion.site/What-s-new-in-Superplan-67d90027d689499b9868b8203f70cc74), geraadpleegd op 11 augustus 2026.

Sterk:

- medewerkergerichte weekmatrix met een vaste kaart-/templatewerkvoorraad;
- directe drag-and-drop, toetsenbordacties, kopiëren/plakken en bulkselectie;
- open diensten hebben een expliciet benodigd aantal medewerkers;
- beschikbaarheid, skills, kwalificaties, rust, dekking, kosten en eerlijkheid kunnen regels vormen;
- de beveiligingsvariant kent objecten, posten, patrouilles, meldkamers en overdrachten.

Niet als bewezen overnemen: de openbare documentatie toont geen objectmatrix en geen dienst met meerdere opeenvolgende taaksegmenten.

### Intus InPlanning

Bronnen: [Dienstroosterplanning](https://www.intus.nl/software/dienstroosterplanning), [Dagplanning](https://www.intus.nl/software/dagplanning), [Employee Self Service](https://www.intus.nl/software/employee-self-service) en [Flexplanning](https://www.intus.nl/software/flexplanning), geraadpleegd op 11 augustus 2026.

Sterk:

- dienstroosterplanning beheert kwantitatieve en kwalitatieve bezetting en signaleert onder-/overbezetting;
- dagplanning verfijnt een dienst met meerdere taken, werkplekken of een route langs verschillende adressen, expliciet ook voor beveiligers;
- ATW, CAO, kwalificaties en organisatiespecifieke regels blijven onderdeel van iedere planningbeslissing;
- open diensten kunnen via ESS of stapsgewijs via team, buurteam, flexpool en inhuur worden aangeboden.

Niet als bewezen overnemen: Intus publiceert geen vaste matrixassen, drag-and-dropgedrag, sticky-scroll of expliciete verdeling van één taak over meerdere diensten.

### BeveiligingPro

`Reference/BeveiligingPro/README.md` bevestigt als aanvullende brancheles centrale drag-and-drop, live beschikbaarheid en objectcontext. LOC combineert dat met de zwaardere CAO-, credential- en auditregels uit Secusoft, Rostar CAS en Intus.

## LOC-ontwerpbesluit

- Er is precies een scrollcontainer voor het matrixvlak.
- De bovenste object- of medewerkerkop blijft vast bij verticaal scrollen.
- De linker dagkolom blijft vast bij horizontaal scrollen.
- De hoekcel blijft boven beide assen liggen.
- Resourcekolommen zijn minimaal 220 px breed; de dagkolom circa 136 px.
- De rechterwerkvoorraad heeft een eigen verticale scroll en blijft buiten de horizontale matrixscroll.
- Objecttaken tonen taaknaam, tijdvenster, tijddekking (`gepland/vereist`) en personeelsdekking (`ingevuld/vereist`).
- Een gesplitste taak toont meerdere gekoppelde dienstsegmenten.
- Een volledig tijdgedekte taakvraag verdwijnt in de objectcel als los taakblok; de gekoppelde dienst blijft zichtbaar. Als de personeelsbezetting nog niet compleet is, blijft zij in de werkvoorraad beschikbaar als expliciete bezettingsactie.
- Een samengestelde dienst behoudt dezelfde dienst-id, maar verschijnt per object en segmentdatum met de lokale segmenttijd.
- Medewerkerweergave dedupliceert een samengestelde dienst: dezelfde dienst verschijnt eenmaal bij de toegewezen medewerker.

## Veilige sleepcontracten

1. `personnel:<id> -> slot:<shift>:<slot>:<datum>` wijst een medewerker direct toe aan een bestaande open bezettingsplaats wanneer de volledige dienst binnen die zichtbare kalenderdag valt. Bij een nachtdienst opent de drop eerst de volledige dienstcontext met start- en einddatum voor bewuste bevestiging.
2. `personnel:<id> -> occurrence:<id>:<datum>` vormt uitsluitend de nog open dagsnede van die zichtbare taak tot een nieuwe dienst en wijst de medewerker in dezelfde serveractie toe.
3. `task:<id> -> employee-day:<personnel>:<datum>` doet hetzelfde vanuit het omgekeerde perspectief; de doeldatum moet door het half-open tijdvenster van de taakuitvoering worden geraakt. Zo kan het doorlopende deel van een nachttaak ook op de volgende kalenderdag worden bediend.

De tweede en derde route gebruiken `compose_and_assign`: taakreservering, dienstsamenstelling, regelcontrole en medewerkerstoewijzing delen een idempotency key en optimistic-lockcontext. Een losse frontendketen `compose` gevolgd door `assign` is niet toegestaan, omdat die bij een fout een lege conceptdienst kan achterlaten.

## UX-regels

- Een drag eindigt na precies een doel en laat geen medewerker- of taakkeuze actief.
- Verkeerde dag, bezet slot of gelijktijdige wijziging geeft directe uitleg en herlaadt waar nodig.
- Open, gedeeltelijk gepland, volledig afgedekt maar nog te bezetten, en gereed zijn afzonderlijke toestanden.
- Sleepdoelen hebben ook een zichtbare actie om de taak of dienst te openen voor toetsenbordgebruik en complexere samenstelling.
- Week en periode worden in de URL vastgelegd, zodat een planner dezelfde context kan delen of terugvinden.

## Gefaseerde uitbouw

1. **Interface V1** - de twee matrices, bestaande objecttaken als werkvoorraad, taakdekking en bezetting, splitsen en combineren van taaksegmenten, week/periode, waarschuwingen, concept/publicatie en ongedaan maken.
2. **Snelheidslaag** - dienst-, dag- en weekkopie, meerweekse templates met of zonder medewerkers, bulkselectie, bulkbewerking en persoonlijke zichtbaarheid van aanvullende roosterinformatie. Invoegen mag bestaande planning nooit stil overschrijven en krijgt altijd een directe undo.
3. **Selfservice** - open diensten aanbieden, aanvragen, ruilen en overdragen met rol-, beschikbaarheids-, overlap- en managergoedkeuringsregels plus gerichte notificaties.
4. **Beslisondersteuning** - kandidaatvergelijking op kwalificaties, inzetgrenzen, contracturen, rust, reisafstand en kosten; daarna pas voorstelplanning en auto-assign die ongeschikte diensten bewust open laat.

De latere lagen bouwen op dezelfde taaksegmenten en mutatie-audit voort. Zij voegen geen tweede, concurrerend dienst- of taakmodel toe.
