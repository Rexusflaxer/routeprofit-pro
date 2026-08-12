# Planning taakdekkingstijdlijn - designspecificatie

Datum: 2026-08-12
Status: gekozen interactiemodel voor de volgende planninguitbouw

## Doel en ontwerpbesluit

LOC gebruikt een vraaggestuurde planning in drie afzonderlijke lagen:

1. **Klanttaak** - de onveranderlijke vraag uit het objectdossier: wat, waar, wanneer, vereiste duur en waar beschikbaar vereiste bezetting.
2. **Dienstindeling** - een of meer operationele diensten en taaksegmenten die de klanttaak afdekken.
3. **Personeelsbezetting** - de medewerker die een dienst uitvoert.

De objectweergave wordt een taakgestuurde kaartmatrix: de klanttaak blijft als vaste bronkaart zichtbaar en dienst-/medewerkerkaarten worden daarbinnen gevormd. Na de eerste planning klapt alleen die taakkaart uit tot een lokale verticale tijdverdeling. De planning mag de klanttaak niet verplaatsen, verlengen of dupliceren. Een bronwijziging gebeurt uitsluitend in het objectdossier.

Dit bouwt voort op [Planningmatrix V2](./planning-matrix-v2.md), met een door de gebruiker gekozen oriëntatiecorrectie: in objectweergave staan objecten verticaal als rijen links en dagen horizontaal als kolommen boven. Medewerkers blijven in de vaste rechterwerkvoorraad. De medewerkerweergave behoudt de omgekeerde sleepstroom met medewerkers horizontaal en dagen verticaal.

## Begrippen en invarianten

- Een **taakuitvoering** is een gedateerde occurrence van een objecttaak.
- Een **taakvenster** is het half-open interval `[start, einde)`. Daardoor sluiten `06:00-12:00` en `12:00-20:00` exact aan zonder dubbele minuut.
- Een **taaksegment** is het deel van een taakuitvoering dat door een dienst wordt uitgevoerd.
- Een **dienst** is de personeelscontainer met een of meer chronologisch geordende taaksegmenten.
- Een **open dienst** heeft wel tijden en taaksegmenten, maar nog geen medewerker.
- Tijddekking en personeelsdekking blijven afzonderlijke statussen.
- Overlappende segmenten tellen nooit dubbel mee voor de tijddekking.
- Een dienstkaart mag standaard niet buiten het taakvenster worden geresized.
- Een drop, resize, vervanging of gedeelde overdracht is één atomaire, herstelbare mutatie met audit en undo.
- Een drag eindigt na precies één doel en laat geen medewerker of taak geselecteerd.

## Uitvoeringsmodi

### `continuous`

Het volledige taakvenster moet zonder gaten zijn afgedekt. Voor een receptietaak `06:00-20:00` is `required_minutes` gelijk aan de volledige vensterduur.

- De hele achtergrondoverlay is vereiste dekking.
- De taak mag over meerdere diensten worden gesplitst.
- Een gat van één minuut houdt de taak gedeeltelijk open.
- Aangrenzende diensten krijgen één gedeelde overdrachtsgrens.

### `time_window`

De taak vereist `required_minutes` binnen een ruimer toegestaan venster. Bijvoorbeeld een ronde van 25 minuten binnen `22:00-23:00`.

- De buitenste overlay toont het toegestane venster.
- Een label toont bijvoorbeeld `25 min uitvoeren binnen 22:00-23:00`.
- Alleen de vereiste unieke minuten hoeven te worden ingepland; de rest van het venster is geen dekkingsgat.
- De eerste plaatsing is bij voorkeur één aaneengesloten segment. Splitsen gebeurt alleen expliciet wanneer de taak dit functioneel toestaat.
- Een volledig segment kan binnen het venster worden verschoven zonder de duur te wijzigen.
- Als vensterduur en vereiste duur gelijk zijn, gedraagt de taak zich visueel als een vaste taak.

## Kaartmatrix en lokale tijdverdeling

Er is één kaartweergave; een globale 00:00-24:00-tijdlijn en een transposeknop zijn niet nodig. Dit houdt een week of langere periode scanbaar.

- De objectkop links en dagkop boven zijn sticky binnen één matrixscrollcontainer.
- De matrix scrollt horizontaal door dagen en verticaal door objecten.
- De medewerkerwerkvoorraad rechts blijft buiten deze matrixscroll.
- Een ongeplande taak is een compacte kaart met taaknaam, exact venster, tijddekking en bezetting.
- Na een geslaagde medewerkerdrop klapt precies die kaart in-place uit. Maximaal één taakkaart is tegelijk geopend.
- De lokale verticale tijdrail loopt uitsluitend van taakstart tot taakeinde, bijvoorbeeld 06:00-20:00, en toont daarin open delen en gevormde diensten.
- Een geplande of volledig afgedekte taak blijft als bronkaart zichtbaar; gekoppelde diensten worden niet nogmaals als losse kaarten ernaast getoond.
- Een taak korter dan het minimale klikvlak krijgt een groter bedieningsvlak, terwijl begin-/eindlabels de echte tijd blijven aangeven.
- Nachttaken verschijnen als twee dagsneden met dezelfde occurrence- en dienstidentiteit.
- Compactmodus verkleint gesloten kaarten, maar verbergt een geopende lokale tijdverdeling niet.

## Visuele lagen en toestanden

Een taakoverlay houdt een smalle vaste taakrail zichtbaar met taaknaam, bestelde tijd en objectcontext. Dienstkaarten liggen ingesprongen boven de overlay zodat de bronvraag herkenbaar blijft.

| Toestand | Betekenis | Weergave |
| --- | --- | --- |
| `unplanned` | Geen dienstsegment gevormd | Lichte gearceerde taakoverlay, label `Nog niet verdeeld` |
| `partial` | Een deel van de vereiste minuten is verdeeld | Open deel gearceerd, teller `6u / 14u` |
| `open_service` | Dienstsegment bestaat, medewerker ontbreekt | Witte kaart met stippellijn en label `Open dienst` |
| `needs_staffing` | Tijddekking compleet, een of meer diensten zijn open | Volledige taakomtrek, amber personeelsbadge |
| `ready` | Tijddekking en personeelsbezetting compleet | Groene check en label `Volledig ingepland` |
| `warning` | Geldige conceptplanning met aandachtspunt | Amber icoon met lokale uitleg |
| `blocked` | Mutatie schendt een harde regel | Rood verbodssymbool; drop wordt niet opgeslagen |
| `source_changed` | Brontaak wijzigde na dienstvorming | Badge `Bron gewijzigd`, herstelactie vereist |
| `published` | Zichtbaar voor medewerkers | Publicatie-icoon; wijziging maakt een nieuw concept |

Status mag nooit alleen door kleur worden overgebracht. Iedere status heeft tekst of een herkenbaar icoon.

## Primaire sleepinteractie

### Medewerker naar ongedekte taak

1. Bij het starten van de drag markeert LOC alleen compatibele taakkaarten en open intervallen binnen een reeds geopende kaart.
2. Incompatibele doelen worden gedimd. Hover of toetsenbordfocus verklaart de reden, bijvoorbeeld overlap, afwezigheid of ontbrekende kwalificatie.
3. Boven een compacte taakkaart toont LOC het eerstvolgende veilige voorstel; binnen een geopende kaart toont het exacte open interval de ghostkaart met medewerker, start, einde, duur en resterende dekking.
4. Loslaten voert `compose_and_assign` uit: dienst vormen, segment reserveren, regels controleren en medewerker toewijzen in één serveractie.
5. Na succes verschijnt een korte undo-toast. Bij conflict blijft de taak ongewijzigd en wordt de actuele planning herladen.

### Standaardduur en plaatsingsalgoritme

De UX-standaard voor een nieuw dienstsegment is **8 uur**. Dit is een aanpasbare planningsvoorkeur en geen CAO- of wettelijke regel.

Voor een `continuous` taak kiest de ghostkaart:

1. het geraakte, nog ongedekte aaneengesloten interval;
2. als start standaard het begin van dat interval;
3. als einde de eerste van: einde medewerkerbeschikbaarheid, einde ongedekt interval of `start + 8 uur`;
4. als het gehele resterende interval maximaal 8 uur duurt, exact het volledige restant.

Voor `06:00-20:00` ontstaat daardoor standaard `06:00-14:00`; het restant wordt `14:00-20:00`. De planner kan de overdracht vervolgens naar bijvoorbeeld 12:00 verplaatsen.

Voor `time_window` bepaalt de verticale drop-positie de voorgestelde start, afgerond volgens het snapcontract. LOC houdt de vereiste duur intact en begrenst het segment binnen het toegestane venster.

Beschikbaarheid mag een voorstel verkorten, maar een harde beschikbaarheids- of kwalificatiebeperking mag nooit stil worden genegeerd.

### Snapcontract

- Vrije drag en resize snappen standaard op **5 minuten**.
- Taakstart, taakeinde, naastliggende segmentrand en middernacht zijn magnetische grenzen, ook wanneer zij niet op een regulier rasterpunt vallen.
- Een exacte brontijd zoals `22:25` blijft dus exact `22:25`.
- De tijdbadge toont tijdens de interactie continu `start-einde`, duur en resterende minuten.
- Pijltjestoetsen verschuiven de actieve rand 5 minuten; `Shift` + pijl gebruikt 60 minuten voor snelle grove correcties.
- Directe tijdinvoer blijft beschikbaar voor toegankelijkheid en exacte correcties.
- `Escape` annuleert de volledige lokale wijziging; `Enter` bevestigt.

## Snel een open dienst vormen

Een ongedekt taakdeel heeft naast drag-and-drop een zichtbare actie `+ Open dienst`. Deze actie gebruikt hetzelfde 8-uursvoorstel, maar maakt geen medewerkerstoewijzing.

De aanvullende actie `Dienstindeling maken` biedt:

- `Volgens standaardduur`;
- `In 2 gelijke delen`;
- `Splitsen op...`;
- `Overdrachtsmoment aanwijzen`.

De preview toont de resulterende diensten vóór bevestiging. Tijddekking kan daarna compleet zijn terwijl personeelsdekking nog open blijft. Een medewerker op een open-dienstkaart slepen wijst uitsluitend die bestaande dienst toe en vormt geen duplicaat.

## Resizen en overdrachten

### Losse kaart

- Boven- en onderrand hebben duidelijke resizegrepen.
- Resizen blijft binnen de taakoverlay en mag niet door een ander segment heen lopen.
- Live tekst toont bijvoorbeeld `06:00-12:00 · 6u · 8u taak resteert`.
- Een korter segment maakt de taak opnieuw gedeeltelijk open.
- Een verlenging kan nooit meer unieke minuten claimen dan nog vereist zijn.

### Gedeelde overdrachtsgreep

Wanneer twee segmenten exact aansluiten, verschijnt één handovergreep. Het verslepen daarvan wijzigt atomair het einde van dienst A en het begin van dienst B.

Voorbeeld: `Jan 06:00-12:00` plus `Sara 12:00-20:00`; de grens naar 13:00 slepen levert `Jan 06:00-13:00` en `Sara 13:00-20:00`. Er ontstaat nooit een tussentijds gat of overlap.

De wijziging wordt alleen opgeslagen wanneer beide diensten na de wijziging geldig blijven. Een afgewezen grens toont de concrete regel die de beweging beperkt.

### Volledig of al bezet interval

- Een volle taak accepteert geen nieuwe standaarddrop.
- Een medewerker op een bestaande medewerkerkaart slepen betekent expliciet `Medewerker vervangen`.
- `Medewerker verwijderen` vraagt of de dienst open moet blijven of ook de dienstindeling moet worden verwijderd.
- Aangrenzende segmenten van dezelfde medewerker krijgen een voorstel `Samenvoegen` wanneer dienstregels en taakvolgorde dat toelaten.

## Samengestelde diensten

Eén dienst mag geordende segmenten van meerdere taken en objecten bevatten.

```text
Dienst 15:30-23:30 - Noor
|- 15:30-18:15  Receptie - Object 1
|- 18:15-18:30  Reistijd / overgang
`- 18:30-23:30  Rondetaken - Objecten 2, 3 en 4
```

- In objectweergave verschijnt ieder lokaal taaksegment in zijn eigen taakoverlay, met dezelfde dienst-id en een kettingicoon.
- Hover of focus op één fragment markeert alle fragmenten van dezelfde dienst.
- In medewerkerweergave verschijnt de dienst eenmaal, met interne taakstroken in chronologische volgorde.
- Een drop naast een bestaande dienst biedt `Nieuwe dienst` en `Toevoegen aan dienst HH:MM-HH:MM`.
- Automatisch koppelen gebeurt niet over verschillende objecten zonder een valide overgang.
- Een positieve tijdruimte tussen objecten wordt expliciet als reistijd, pauze of ongedefinieerde tussenruimte vastgelegd; zij telt niet als taakdekking.
- Een nulminutenovergang tussen verschillende adressen geeft minimaal een harde controle of duidelijke reistijdwaarschuwing.
- Segmenten binnen één dienst mogen elkaar niet overlappen.
- Dienststart en -einde volgen het vroegste en laatste dienstonderdeel, maar de bronvensters van alle taaksegmenten blijven afzonderlijk gehandhaafd.

## Dekking en regels

Tijddekking wordt berekend over de unie van geldige taaksegmenten, nooit als een eenvoudige som. Voor een toekomstige taakbezetting groter dan één worden afzonderlijke bezettingsbanen gebruikt; standaard is de taakbezetting één.

Per taak toont LOC minimaal:

- `Dienstindeling: geplande / vereiste minuten`;
- `Personeel: ingevulde / vereiste plaatsen`;
- aantal open diensten;
- de eerstvolgende ongedekte periode.

Hard blokkeren:

- segment buiten het klantvenster;
- dubbel geclaimde taakminuten boven de vereiste dekking;
- medewerker overlapt een andere actieve dienst;
- inactieve medewerker, goedgekeurde afwezigheid of ontbrekende harde kwalificatie;
- onmogelijke objectovergang wanneer reistijd hard bekend is;
- stale versie of gelijktijdige wijziging.

Waarschuwen volgens bedrijfsinstellingen:

- overschrijding contract- of weekuren;
- rusttijd, maximale dienstduur en aantal diensten;
- beschikbaarheidsvoorkeur;
- kosten, overwerk of ongedefinieerde reistijd;
- pauze die mogelijk een continue beveiligingstaak onderbreekt.

## Edge cases

- **Over middernacht:** toon twee dagsneden met één occurrence- en dienstidentiteit. Resizen over de daggrens gebruikt altijd de volledige datum-tijdcontext.
- **Zomer-/wintertijd:** reken met `Europe/Amsterdam`-instants. Een lokale dag kan 23 of 25 uur duren; een vast `24 * 60`-model is niet toegestaan.
- **Korte taak:** gebruik minimaal klikvlak zonder de echte 25-minutenduur visueel te vervalsen; tijdlijnen en label blijven leidend.
- **Pauze:** een onbemande pauze vult geen `continuous` taak. Er is vervanging nodig of de pauze moet aantoonbaar als doorwerkte tijd gelden.
- **Meerdere gelijktijdige taken:** pack taken in afzonderlijke banen en valideer medewerker- en taakoverlap onafhankelijk.
- **Bron gewijzigd of verwijderd:** markeer afgeleide diensten als `source_changed`; niet stil rekken, inkorten of verwijderen.
- **Publicatie:** een wijziging aan een gepubliceerde dienst wordt concept en veroorzaakt pas na herpublicatie een medewerkerbericht.
- **Gelijktijdige planners:** behoud intent/idempotency key bij retry; laat geen half gevormde dienst of bezetting achter.
- **Offline/netwerkfout:** toon pending status, voorkom een tweede drop en bied veilige retry met dezelfde intent.
- **Volledige tijddekking zonder medewerker:** behoud de taak in de personeelswerkvoorraad als expliciete bezettingsactie.
- **Flexibele taak vol:** ongebruikte minuten van het toegestane `time_window` zijn geen open gat.
- **Meervoudige bezetting:** iedere vereiste positie krijgt een eigen dekkingsbaan; overbezetting boven de klantvraag wordt geblokkeerd.
- **Touch:** resizen gebruikt grotere grepen en een bevestigende tijdbalk; drag is nooit de enige bedieningsroute.

## Toetsbare kernscenario's

### Lange receptietaak

1. Receptie `06:00-20:00`, `continuous`, start als `0u / 14u`.
2. Jan naar de taak slepen toont en maakt standaard `06:00-14:00`.
3. De onderrand naar 12:00 resizen levert `6u / 14u` en open deel `12:00-20:00`.
4. Sara op het open deel slepen maakt exact `12:00-20:00`.
5. De taak wordt `ready`; een derde standaarddrop is geblokkeerd.
6. De gedeelde grens naar 13:00 slepen wijzigt beide diensten atomair en behoudt volledige dekking.

### Korte ronde binnen venster

1. Ronde heeft venster `22:00-23:00`, `time_window`, `required_minutes = 25`.
2. Drop rond 22:20 toont door 5-minutensnap `22:20-22:45`.
3. Verplaatsen binnen het venster behoudt 25 minuten.
4. Een tweede segment kan niet opnieuw dezelfde vereiste 25 minuten claimen.

### Samengestelde dienst

1. Noor werkt `15:30-18:15` op Object 1.
2. Een taak van Object 2 wordt naast de dienst gedropt.
3. LOC biedt nieuwe dienst of toevoegen aan bestaande dienst en toont de overgangscontrole.
4. Na koppelen verschijnt in medewerkerweergave één dienst met geordende taak-/reisstroken; in objectweergave blijven de brontaken afzonderlijk zichtbaar.

## Fasering

### Fase 1 - taakgestuurde kaartmatrix

- objectrijen met dagkolommen en blijvend zichtbare brontaken;
- compacte taakkaart en lokale verticale tijdverdeling;
- 8-uursvoorstel en 5-minutensnap;
- medewerkerdrag met ghostkaart en `compose_and_assign`;
- losse resizegrepen;
- gescheiden tijd- en personeelsstatus;
- harde begrenzing, lokale waarschuwing en undo.

### Fase 2 - snelle dienstvorming

- `+ Open dienst` en `Dienstindeling maken`;
- gedeelde overdrachtsgreep;
- vervangen, open laten, samenvoegen en splits-preview;
- toetsenbordbediening en persoonlijke zoom/actieve-urenvoorkeur.

### Fase 3 - samengestelde dienst

- koppelen van taaksegmenten uit meerdere objecten;
- interne taak-, reis- en pauzestroken;
- gezamenlijke markering tussen object- en medewerkerweergave;
- route-/reistijdcontrole.

### Fase 4 - beslisondersteuning

- beste kandidaat per open dienst;
- voorstelverdeling op beschikbaarheid, kwalificaties, contracturen en rust;
- geselecteerde taken automatisch in open diensten verdelen;
- auto-assign als conceptvoorstel, nooit automatisch publiceren.

## Primaire referenties

- Shiftbase: [required shifts met minimum, maximum, exact en directe planning](https://help.shiftbase.com/setting-up-required-shifts) en [auto-scheduling vanuit vereiste diensten](https://help.shiftbase.com/auto-scheduling).
- Workfeed: [diensten direct in het rooster maken](https://help.workfeed.io/en/articles/5060998-how-to-create-and-publish-shifts), [persoonlijke roosterweergave](https://help.workfeed.io/en/articles/5071090-how-to-change-the-interface-of-the-schedule), [uren en beschikbaarheid in de medewerkerfilter](https://help.workfeed.io/en/articles/5813877-get-an-overview-of-hours-and-wishes-with-the-employee-filter) en [regelcontrole voor overlap, rust en dienstduur](https://help.workfeed.io/en/articles/13860240-how-to-use-the-rule-checker).
- Deputy: [taakgestuurde capaciteitsvraag](https://help.deputy.com/hc/en-au/articles/4764637691279-Labor-modeling), [diensten automatisch uit vraag vormen](https://help.deputy.com/hc/en-au/articles/4688892429839-Using-Auto-scheduling) en [micro-scheduling, koppelen en splitsen](https://help.deputy.com/hc/en-au/articles/10611651590159-Managing-micro-scheduled-shifts-and-timesheets).
- When I Work: [chronologische coverage-weergave](https://help.wheniwork.com/articles/schedule-views-computer/), [dekking per uur, locatie en functie](https://help.wheniwork.com/articles/viewing-hourly-coverage-in-the-schedule/), [gekwalificeerd/conflictfeedback tijdens slepen](https://help.wheniwork.com/articles/saving-time-with-scheduling-shortcuts/) en [gedeeltelijke OpenShift-dekking en minimale splitduur](https://help.wheniwork.com/articles/scheduling-settings/).
- Homebase: [drag-and-drop, open diensten en conflictcontrole](https://www.joinhomebase.com/employee-scheduling).

Geen van deze referenties bewaart de concrete klanttaak op dezelfde manier als harde, onveranderlijke planningsvraag. LOC combineert hun bewezen roosterpatronen met een expliciete taak-dienst-medewerkerketen en voorkomt daarmee stille dubbele of te ruime klantdekking.
