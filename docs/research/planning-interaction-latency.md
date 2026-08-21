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
