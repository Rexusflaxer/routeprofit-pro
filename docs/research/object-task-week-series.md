# Objecttaken per kalenderweek - ontwerpbesluit

Datum: 2026-08-14
Status: gekozen en geimplementeerd domeinmodel; bediening gevalideerd met gebruiker

## Doel

De tab **Objectkaart > Taken** legt de klantvraag vast op een echte kalenderweek. De gebruiker tekent een taak op een concrete datum en tijd, kiest daarna op het getekende blok of deze eenmalig of wekelijks terugkomt en kan een wekelijkse reeks vanaf een latere uitvoering wijzigen of stoppen. Verleden, historie en reeds uitgegeven planningssnapshots worden nooit herschreven.

Dit model sluit aan op de bestaande scheiding binnen LOQ:

1. de objecttaak beschrijft wat de klant op een bepaald moment vraagt;
2. Planning vormt daar concrete diensten en taaksegmenten van;
3. personeel wordt pas in Planning aan die diensten gekoppeld.

De lokale Secure-it-referentie bevestigt het effectieve-datumprincipe: een patroonwijziging werkt alleen voor toekomstige weken en concrete planning blijft een afzonderlijke laag. De LOQ-uitwerking voegt daar een tijdlijn, bronwijzigingscontrole, optimistic locking en append-only audit aan toe.

## Gebruikersmodel

De taakwizard heeft drie stappen:

1. **Categorie** - kies het taaktype;
2. **Plan** - kies de gepubliceerde beveiligingsplancontext;
3. **Rooster** - teken een of meer tijdblokken in een gedateerde week.

De losse stap **Herhaling** vervalt. Herhaling hoort bij een getekend tijdblok, omdat twee blokken van dezelfde taak verschillende patronen kunnen hebben.

- De wizard opent op de huidige ISO-week in `Europe/Amsterdam`.
- Het vertrouwde compacte rooster blijft leidend: maandag tot en met zondag staan onder elkaar en de horizontale tijdlijn loopt van `00:00` tot `24:00` in blokken van dertig minuten.
- De bestaande gereedschappen blijven behouden: slepen/schilderen voor aaneengesloten taken, een klik voor een taak met vaste planduur, wissen en de presets voor werkdagen en `24/7`.
- Een compacte weekkop boven het bestaande rooster toont ISO-weeknummer, datumbereik en vorige/deze/volgende week. De daglabels tonen naast de weekdag de kalenderdatum.
- Een live nu-indicatie wordt in dezelfde tijdlijn getekend en beweegt door zolang het scherm openstaat.
- Voltooide dagen zijn vergrendeld. Op vandaag is alles voor de eerstvolgende geldige vijfminutengrens vergrendeld.
- Toekomstige weken zijn rechtstreeks bereikbaar. De gebruiker kan niet naar een volledig verstreken week terug om nieuwe vraag te tekenen.
- De tijdlijn blijft op de bestaande dertigminutenblokken werken; via een klik op een getekend blok opent de kleine, aan het blok gekoppelde popup voor een exacte tijd.
- Diezelfde popup bevat compact de keuze eenmalig of wekelijks, met een optionele inclusieve einddatum. Er komt geen afzonderlijke herhalingsstap of grote algemene reeksdialoog.
- Andere objecttaken blijven gedempt in de achtergrond zichtbaar met de bestaande legenda.

## Reeks- en revisiemodel

Ieder zelfstandig getekend blok krijgt een `ObjectTaskScheduleSeries`. Een serie heeft een stabiele identiteit en wordt nooit hergebruikt nadat zij is gestopt. Opnieuw tekenen maakt een nieuwe serie.

Wijzigingen worden append-only vastgelegd in `ObjectTaskScheduleRevision`:

- `schedule` legt starttijd, eindtijd, weekdag en herhaling vast;
- `stop` beeindigt de reeks vanaf een gekozen occurrence;
- `effective_from` is altijd de concrete occurrence-datum waarop de wijziging begint;
- `recurrence_end_date` is inclusief;
- weekdagen worden in opslag als ISO `1` (maandag) tot `7` (zondag) bewaard;
- alle tijden zijn lokale objecttijden in `Europe/Amsterdam`.

Voorbeeld:

```text
Revisie 1: maandag 06:30-18:00, wekelijks, vanaf week 22
Revisie 2: maandag 10:00-18:00, wekelijks, effectief vanaf week 24
Revisie 3: stop, effectief vanaf maandag in week 31
```

Week 22 en 23 blijven hierdoor `06:30-18:00`, week 24 tot en met 30 worden `10:00-18:00` en vanaf week 31 bestaat geen occurrence meer. Een nieuwe maandagtaak na week 31 vereist een nieuwe serie.

## Servergrenzen

Alle mutaties lopen via de bestaande `planningApi`; de frontend schrijft taakdefinities en revisies niet rechtstreeks.

- iedere mutatie heeft een `idempotency_key`;
- iedere wijziging heeft `expected_version` en compare-and-swap;
- de server valideert klant, object, gepubliceerde planrevisie en de Amsterdamse datum/tijd voor de eerste schrijfactie;
- een geselecteerde ingangsdatum moet echt een occurrence van de reeks zijn;
- herhaalde requests met dezelfde intent leveren hetzelfde resultaat;
- gewijzigde en gestopte revisies blijven auditbaar en worden niet verwijderd.

Legacy `schedule_periods`, `start_time`, `end_time`, `weekdays` en `recurrence_type` blijven alleen als compatibiliteitsmirror beschikbaar voor bestaande consumers. Series en revisies zijn voor nieuwe records leidend.

## Koppeling met Planning

`PlanningTaskOccurrence` materialiseert de gedateerde vraag. Een bronwijziging zonder gekoppelde dienst mag veilig worden ververst of gesupersede. Zodra een occurrence al door een dienstsegment wordt gebruikt, wordt de dienst nooit stil verplaatst, ingekort of verwijderd.

In dat geval ontstaat per geraakte dienst een open `PlanningTaskSourceChange` met:

- de oude en gewenste bronsnapshot;
- taak-, reeks-, revisie-, occurrence- en dienstidentiteit;
- de geraakte segmenten;
- het type `schedule_changed` of `schedule_stopped`;
- actor, detectietijd, versie en herstelstatus.

Planning toont dan **Bron gewijzigd** met oud en nieuw tijdvenster. De betreffende taak en dienst blijven in de werkvoorraad zichtbaar en hebben een primaire actie **Dienst aanpassen**. Publiceren is zowel in de interface als server-side geblokkeerd zolang binnen de publicatiescope een open bronwijziging bestaat. Een bronwijziging wordt pas opgelost nadat de oude koppeling is verwijderd of de dienst aantoonbaar aan de gewenste occurrence voldoet.

## Belangrijke grensgevallen

- ISO-week 52 of 53 loopt correct door naar week 1 van het volgende weekjaar.
- `recurrence_end_date` omvat de gekozen einddatum.
- Een taak mag over middernacht lopen; datum en tijd vormen samen een half-open interval.
- Zomer- en wintertijd worden als Amsterdamse lokale tijd naar instants vertaald; een kalenderdag is niet altijd 24 uur.
- Twee gelijktijdige reekswijzigingen leveren een versieconflict in plaats van een verloren update.
- Een occurrence die over meerdere diensten is verdeeld levert per dienst een afzonderlijke herstelactie.
- Concept- en gepubliceerde diensten behouden hun bestaande snapshot; een correctie maakt eerst een nieuw concept voordat opnieuw kan worden gepubliceerd.

## Acceptatievoorbeelden

1. Op vrijdag om 14:36 kan de gebruiker op vrijdag niet voor 14:40 tekenen, maar wel vanaf 14:40 en op alle volgende dagen.
2. Een maandagblok `06:30-18:00` met wekelijkse herhaling verschijnt exact op dezelfde lokale tijd in volgende weken.
3. Wijzigen in week 24 naar `10:00-18:00` verandert week 23 niet.
4. Stoppen in week 31 verwijdert geen eerdere occurrence en maakt week 32 niet opnieuw aan.
5. Een reeds geplande dienst op een gewijzigde occurrence krijgt **Bron gewijzigd** en de periode kan niet worden gepubliceerd totdat de dienst is hersteld.
6. Na herladen blijven gekozen week, reeksidentiteit, revisiehistorie en open planningsimpact reproduceerbaar.
