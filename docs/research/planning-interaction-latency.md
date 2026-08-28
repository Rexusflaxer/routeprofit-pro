# Planning: interactielatency en backendgrens

Datum: 21 augustus 2026
Status: gekozen optimalisatierichting

## Doel

- Een sleepactie moet binnen één frame zichtbaar zijn; de planner mag direct de volgende taak plannen.
- Onafhankelijke acties mogen parallel verwerken. Acties voor dezelfde medewerker en kalenderdag blijven FIFO.
- Concept opslaan en publiceren mogen pas door wanneer alle lokale opdrachten autoritatief zijn bevestigd.
- Serverdoel na Base44 Publish: p50 onder 1,5 seconde en p95 onder 3 seconden voor `compose_and_assign`.

## Gemeten codepad

Een cold mock van één open taak, één medewerker en één kalenderdag telde vóór deze wijziging 98 buitenste SDK-calls. Daarvan waren 47 reads op `PlanningMutationCoordinator`. De volledige contract-/CAO-beslissing startte daarnaast drie backendfuncties na elkaar; de contractresolver doet zelf meerdere datagolven en kan nog een CAO-scopefunctie starten.

De vertraging kwam daardoor uit twee lagen:

1. de frontend projecteerde de optimistic records alleen in de matrix, terwijl werkvoorraad, uren en tellers autoritatieve records bleven tonen;
2. de Base44-functie voerde veel herhaalde lease-reads, een provisional en finale assignmentwrite, één globale idempotency-hotspot en dubbele servicecontextresolutie uit.

## Besluit voor deze release

Base44 blijft de autoritatieve bron. We voeren eerst deze wijzigingen door:

- één lokale mutation queue met optimistic records als bron voor matrix, werkvoorraad, waarschuwingen, uren en tellers;
- lokale FIFO per `personnel-day`, zonder de medewerker over alle dagen te blokkeren;
- geen remote lease-read zolang de zojuist verworven lokale lease aantoonbaar ruim geldig is;
- een voorlopige assignmentwrite, daarna precies één volledige autoritatieve
  contract-/CAO-/Wpbr-/kwalificatie- en conflictcontrole, gevolgd door de
  definitieve CAS-write;
- idempotencyclaims alvast verdeeld over 256 stabiele hash-shards; tijdens één
  overgangsrelease blijft de oude v2-claim als eerste rollout-fence behouden,
  zodat oude en nieuwe functie-instanties nooit naast elkaar schrijven;
- contract-readiness hergebruiken als servicecontext-readiness; de redundante context- en statische runtimefunction-hops vervallen.

Volledige contract-, Wpbr-, kwalificatie-, overlap-, afwezigheids- en CAO-controles blijven behouden. De UI verwijdert een optimistic opdracht pas nadat het autoritatieve resultaat in de querycache staat. Een fout rolt alleen die opdracht terug en blokkeert de volgende FIFO-opdracht niet.

De gemeten bovengrens van het gewone `compose_and_assign`-pad daalt in deze
veilige overgangsrelease van 98 naar 77 buitenste SDK-calls; na het verwijderen
van de tijdelijke v2-rollout-fence wordt dat 67. Een assignment op een bestaande
dienst daalt direct van 46 naar 36. De lokale wachtrij is bedoeld om deze
resterende netwerktijd niet meer als interactiewachttijd aan de planner door te
geven.

## Wanneer wel een eigen planningserver

Een externe backend kan niet rechtstreeks Base44 `serviceRole` gebruiken. Alleen een Base44-hosted backendfunctie heeft die elevated context. Een losse server die de huidige Base44-entities blijft muteren, verwijdert de Base44-hop dus niet en maakt authenticatie en herstel juist complexer.

Een eigen server wordt zinvol zodra de planning volledig één transactioneel write-model krijgt in PostgreSQL:

- unieke `(tenant_id, idempotency_key)`;
- unieke actieve `(shift_id, slot_index)`;
- exclusion constraint tegen overlappende medewerkerdiensten;
- één transactie voor shift, taaksegment, assignment, dekking en audit;
- transactionele outbox voor read projections;
- Base44 als authenticated gateway, niet als tweede writer.

Start die migratie achter een feature flag wanneer een geauthenticeerde productieproef na deze release nog één van deze grenzen overschrijdt:

- `compose_and_assign` p95 blijft boven 3 seconden;
- de lokale queue loopt bij normaal planwerk structureel verder op dan vijf opdrachten;
- Base44-conflicten of time-outs komen in meer dan 0,5% van planningmutaties voor;
- nieuwe planningregels vereisen echte multi-record transacties die de saga onredelijk complex maken.

## Schaalpad voor 200–500 medewerkers

De volledige medewerker × taak × tijd-matrix vooraf opslaan is nadrukkelijk niet
het doel. Bij 500 medewerkers, honderden taakvensters en meerdere mogelijke
start-/eindtijden groeit die projectie explosief en is een groot deel alweer
verouderd zodra één dienst, afwezigheid of contract wijzigt.

De schaalbare projectie bestaat uit twee niveaus:

1. een blijvend, event-driven feitenoverzicht per medewerker en servicedag met
   contract-/CAO-route, kwalificaties, beveiligingspassen, afwezigheid,
   restricties, reeds geplande intervallen, rustgrenzen en urentotalen;
2. een kleine contextberekening voor alleen de concrete dienst of het taakdeel
   waarover de planner sleept.

Het feitenoverzicht krijgt een dependency-hash. Een wijziging aan medewerker,
contract, bedrijfstoewijzing, kwalificatie, pas, afwezigheid, restrictie,
dienst, assignment of toepasselijke CAO-configuratie maakt alleen de betrokken
medewerker-/dagrecords ongeldig. Een begrensde achtergrondworker bouwt die
records opnieuw op; een nachtelijke herstelrun controleert gemiste events. De
drag-preview leest uitsluitend lokale feiten en een reeds voorbereide
dienstcontext. Ontbrekend of verouderd bewijs wordt nooit als groen getoond.

De huidige release legt hiervoor de functionele grens vast: de client bouwt een
memoized lokale index en `prefetch_assignment_eligibility` kan serverbeslissingen
begrensd vooraf opwarmen. De volgende schaalstap is deze basisbewijzen duurzaam
en event-driven materialiseren, niet steeds grotere combinatiematrices bij het
openen laden. Dat kan eerst binnen Base44 met een dirty-queue plus worker. Een
eigen PostgreSQL-planningservice is pas de betere keuze wanneer de hieronder
genoemde productiegrenzen worden overschreden en zij de enige autoritatieve
planningstore wordt.

De overgangsrelease is bewust fail-closed: lokaal bekende waarschuwingen staan
al tijdens het slepen in beeld, maar `checking`, `stale` of `unavailable` wordt
nooit groen en leidt nog niet tot een assignmentwrite. De exacte combinatie
wordt met voorrang opgewarmd en de planner kan pas definitief plaatsen wanneer
het volledige bewijs actueel is. Dat voorkomt een waarschuwing die pas na de
planning verschijnt, maar is nog niet de eindoplossing voor 500 medewerkers.

Voor die eindsituatie materialiseren we geen medewerker × taak-matrix. De
duurzame laag bestaat uit vier compacte facts: medewerkerprofiel, medewerker per
CAO-periode, bedrijf/CAO en dienst/taakbron. Audit- en klant-events verhogen een
generation en zetten alleen de geraakte facts dirty; een begrensde worker werkt
ze bij en een nachtelijke hash-sweep herstelt gemiste events. De planner haalt
facts gepagineerd op en voert de concrete tijdinterval-join lokaal uit. Hierdoor
doet drag/hover nul netwerk zonder dat opslag kwadratisch groeit.

Operationele Base44-grenzen sturen de uitvoering: deze repository bevat al meer
functiedirectories dan de officieel genoemde limiet van 50 backendfuncties, dus
de facts-worker moet in een bestaande/geconsolideerde functie landen. Entity
automations zien bovendien geen bulkbewerkingen; planningaudit-events blijven
de primaire invalidatiebron. De geplande herstelrun gebruikt minimaal vijf
minuten interval en houdt per uitvoering ruim marge onder de gedocumenteerde
automatiseringslimiet.

Acceptatie voor de duurzame feitenindex:

- drag-/hovercontrole doet nul netwerkaanvragen;
- een bronwijziging is binnen 30 seconden verwerkt of zichtbaar als `stale`;
- een herstart of gemist event wordt door de herstelrun ingehaald;
- opslag/publicatie voert altijd nog een autoritatieve eindcontrole uit;
- de hoeveelheid feiten groeit lineair met medewerker × actieve servicedag,
  niet met medewerker × alle taak-/tijdcombinaties.

## Officiële technische bronnen

- [Base44 backend functions](https://docs.base44.com/developers/backend/resources/backend-functions/overview)
- [Base44 entity SDK en bulkoperaties](https://docs.base44.com/developers/references/sdk/docs/type-aliases/entities)
- [Base44 entities, NoSQL en realtime](https://docs.base44.com/developers/backend/resources/entities/overview)
- [Base44 client en service-role beperking](https://docs.base44.com/developers/references/sdk/getting-started/client)
- [Base44 automations](https://docs.base44.com/developers/backend/resources/backend-functions/automations)
- [PostgreSQL-transacties](https://www.postgresql.org/docs/current/sql-begin.html)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL range/exclusion constraints](https://www.postgresql.org/docs/current/rangetypes.html)

Na Base44 Editor Publish moet een echte desktop-smoke de perceived latency, server p50/p95, queue-diepte en foutpercentage vastleggen. Zonder die productiegegevens claimen we geen harde netwerklatency.
