# Objectmodules: gedeeld operationeel platform

Onderzoeksdatum: 5 augustus 2026
Status: leidend ontwerpbesluit voor de objectkaart en beveiligingsplannen
Objectroute: `/Objects?id={objectId}&tab=modules&view=edit&row={moduleId}&module_tab={section}`

## Besluit in het kort

De tab **Modules** wordt de centrale plek waar een gebruiker operationele
hulpmiddelen voor één object activeert en inricht. Een module hoort bij het
object en niet bij één dienst, taak of beveiligingsplan. Beveiligingsplannen
krijgen alleen een versieerbare koppeling naar een bestaande objectmodule.

Daardoor delen een receptieplan, een weekendplan en een brand- en sluitronde
dezelfde actuele bezoekers, uitgegeven middelen, ontvangen pakketten, gevonden
voorwerpen, agenda en actiepunten wanneer die module in de betreffende plannen
beschikbaar is gemaakt. Een plan dat de module niet koppelt, toont haar niet
tijdens de uitvoering.

De vaste domeinketen is:

```text
Object
  -> ObjectModule
    -> gepubliceerde configuratieversie
    -> catalogi en objectreferentielijsten
    -> gedeelde operationele records
    -> append-only module-events

Beveiligingsplanrevisie
  -> SecurityPlanModuleBinding
    -> verwijst naar ObjectModule
    -> begrenst zichtbaarheid en toegestane handelingen in dit plan

Concrete taakuitvoering
  -> gebruikt live gedeelde records
  -> legt de gebruikte module- en beleidsversie vast bij iedere handeling
```

De zes vaste moduletypen zijn:

1. **Bezoekersbeheer**;
2. **Middelenuitgifte**;
3. **Post & pakketten**;
4. **Gevonden voorwerpen**;
5. **Objectagenda**;
6. **Actiepunten**.

Een object kan van ieder type maximaal één niet-verwijderde module hebben. Een
module kan intern wel meerdere categorieën, ontvangstlocaties, catalogi,
agendaweergaven of referentielijsten bevatten. Dit voorkomt dat twee
gelijksoortige modules op hetzelfde object ongemerkt verschillende waarheden
gaan bijhouden.

## Onderzoeksbasis

### Bestaande LOQ-referenties

- `Reference/SequriX/README.md` plaatst bezoekersregistratie, itemuitgifte en
  objectlogboek als afzonderlijk activeerbare functies op het object. De
  onderliggende gebruikershandleiding beschrijft aangekondigde en directe
  bezoekers, actuele aanwezigen, een evacuatielijst, een objectgebonden
  itemcatalogus, geautoriseerden, verwachte retourtijden en retourmeldingen.
  Bezoekersregistraties zijn dienstoverschrijdend en open uitgiftes blijven
  zichtbaar totdat ze zijn geretourneerd.
- `Reference/Secure-it/README.md` levert twee aanvullende patronen. Instructies
  en documenten kunnen per functiegroep, zone of project zichtbaar zijn, en
  incidenttemplates ondersteunen tekst, afbeeldingen, enkel-/meerkeuze en
  objectzones. Moduleformulieren moeten daarom configureerbaar zijn en
  toegang mag niet alleen van een zichtbare frontendknop afhangen.
- `Reference/Secusoft/README.md` en `Reference/Secusoft/COMPLIANCE.md`
  beschrijven vooraf aangemelde bezoekers, live aanwezigen, uitgegeven badges,
  sleutels en passen, met rechten per klant, object en module. Bezoekersdata,
  foto's en toegangsinformatie vereisen dataminimalisatie, retentie en extra
  afscherming.
- `Reference/WebappLandscape/FUNCTION-MATRIX.md` kiest TrakaWEB als primaire
  referentie voor sleutel- en middelencustody: wie, welk middel, wanneer,
  reden, verwachte retour en feitelijke retour moeten afzonderlijk aantoonbaar
  zijn.
- `Reference/WebappLandscape/deep-dives/06-assets-routes-fleet.md` maakt
  reservering, bevoegdheid, beschikbaarheid en feitelijke custody tot vier
  verschillende begrippen. De actuele houder is een projectie uit
  append-only gebeurtenissen en geen vrij overschrijfbaar veld.
- `Reference/WebappLandscape/deep-dives/01-front-trengo.md` beschrijft
  actiepunten met bron, klant/object, eigenaar, status, prioriteit, deadline en
  afrondbewijs. Een afgerond actiepunt sluit zijn bronproces niet automatisch.
- `docs/research/object-security-plan-v2.md` bepaalt dat een beveiligingsplan
  een versieerbare uitvoeringswijze is en geen live operationele database. De
  modulekoppeling hoort daarom in de planrevisie, terwijl moduledata bij het
  object blijft.

### Actuele officiële controlebronnen

- [SequriX objectbeveiliging](https://www.sequrix.com/nl/product/objectbeveiliging/)
  bevestigt volledige registratie van uitgifte en teruggave, directe en
  aangekondigde bezoekers, een evacuatielijst, flexibele formulieren en
  realtime gebruik via desktop en app.
- [SequriX over dienstoverschrijdende objectbeveiliging](https://www.sequrix.com/nl/blog/voordelen-digitaliseren-objectbeveiliging/)
  bevestigt dat bezoekersregistraties en het objectlogboek over diensten heen
  beschikbaar blijven en objectinformatie op één plek wordt onderhouden.
- [Traka electronic key management](https://www.traka.com/global/en/solutions/electronic-key-management-systems)
  bevestigt persoons- en tijdgebonden toegang, curfews, overdue-meldingen en
  een volledige audittrail van iedere uitname en retour.
- [Envoy Visitors](https://envoy.com/products/visitors) en
  [visitor pre-registration](https://envoy.com/features/visitor-pre-registration)
  bevestigen bezoekerstypen, configureerbare vragen, vooraf aanmelden,
  hostmeldingen, interne beveiligingsnotities, toegangsgoedkeuring en actuele
  aanwezigheid voor calamiteiten.
- [Envoy Deliveries](https://envoy.com/products/deliveries/features) bevestigt
  ontvangstfoto/OCR, ontvangersmatching, ontvangstlocaties, notificaties,
  herinneringen, kantooruren en handtekening of foto als afhaalbewijs.
- [iLost voor organisaties](https://ilost.co/terms-and-conditions-business)
  beschrijft registratie, publicatie, matching, communicatie, logistiek en
  procesbewaking als afzonderlijke delen van gevonden-voorwerpenbeheer. De
  [officiële richtlijn voor eigendomscontrole](https://support.ilost.co/en/articles/341047-how-to-prove-you-are-the-owner-of-an-item)
  gebruikt geheime controlekenmerken en waarschuwt geen BSN te delen.
- [SafetyCulture recurring actions](https://help.safetyculture.com/003374)
  bevestigt herhalende acties met site-/assetcontext, samenwerking, een
  activiteitenfeed en tijdstempels.
- [Planon workplace services](https://planonsoftware.com/uk/software/iwms/space-workplace-services-management/)
  bevestigt de samenhang tussen facility-agenda's, bezoekers, evenementen,
  reserveringen en mobiele taken, zonder die processen tot één roosterrecord
  te reduceren.

## Domeinprincipes

### Eén objectmodule, meerdere plannen

`ObjectOperationalModule` is de stabiele identiteit van een geïnstalleerde module. Het
record bevat minimaal:

- eigen BV, klant en object;
- vast `module_type`;
- door de gebruiker gekozen weergavenaam;
- verantwoordelijke gebruiker of team;
- status `concept`, `active`, `suspended` of `archived`;
- actuele gepubliceerde configuratieversie;
- algemene retentie- en zichtbaarheidsinstellingen;
- optimistic-concurrencyversie;
- aanmaak- en wijzigingsmetadata.

Een unieke server-side constraint op `object_id + module_type` voorkomt een
tweede instantie. Een gearchiveerde instantie wordt hersteld of opnieuw
ingericht; er wordt geen nieuw parallel gegevensarchief voor hetzelfde type
gemaakt.

### Configuratie en operationele data zijn verschillende levenscycli

`ObjectOperationalModuleRevision` bewaart een concept of gepubliceerde versie van de
instellingen. Een publicatie bevat een versienummer, schema-versie, actor,
publicatietijd en checksum. Een gepubliceerde configuratie wordt niet
overschreven; wijzigen maakt een volgende versie.

Operationele records zoals een bezoek, uitgifte, pakket of actiepunt worden
niet gekopieerd wanneer de configuratie wijzigt. Iedere operationele mutatie
legt wel vast welke configuratie- en beleidsversie bij de beslissing is
gebruikt. Daardoor blijft later verklaarbaar waarom iemand op dat moment wel of
niet bevoegd was.

### Catalogi en referentielijsten zijn herbruikbare objectinrichting

Verschillende modules hebben dezelfde selectielijsten nodig, bijvoorbeeld
personen, kamers, afdelingen, leveranciers en ontvangstlocaties. LOQ gebruikt
daarom beheerde objectreferentielijsten in plaats van vrije, telkens opnieuw
ingevoerde tekst.

Een lijstitem heeft stabiele identiteit, type, code, naam, optionele externe
referentie, geldigheid en status. Persoonslijsten verwijzen waar mogelijk naar
bestaande medewerkers, klantcontacten of portaalcontacten. Een lokale
objectpersoon is alleen nodig wanneer geen bestaande bron passend is.

Catalogusitems blijven modulespecifiek. Een middel kan bijvoorbeeld verwijzen
naar kamer `101`, maar de kamer zelf wordt niet als kopie in de
middelenconfiguratie opgeslagen.

### Een recordstatus is geen audittrail

Iedere module gebruikt append-only gebeurtenissen voor relevante
statusovergangen. De tabel toont een actuele projectie, maar historie bevat
minimaal:

- actor en persona;
- gebeurtenis- en registratietijd;
- object, module en record;
- bronplan en concrete taakuitvoering indien van toepassing;
- actie en verklaarde reden;
- gebruikte configuratie-/beleidsversie;
- allowlisted wijzigingssamenvatting;
- idempotency key.

Correcties maken een corrigerend event en verwijderen het oorspronkelijke
event niet. Auditpayloads bevatten geen volledige identiteitsdocumenten,
geheime controlekenmerken, vrije before/after-dumps of ruwe bestands-URL's.

### Beheer en snelle uitvoering blijven gescheiden

De backoffice biedt uitgebreide configuratie, catalogi, regels, rapportage en
audit. De operationele gebruiker krijgt een korte flow:

1. relevante records zien;
2. toegestane keuze maken;
3. alleen noodzakelijke velden invullen;
4. resultaat bevestigen;
5. direct een duidelijke status en eventuele vervolgactie zien.

Een beveiligingsplan kan een module als snelle actie tonen, maar ontsluit
nooit de beheerinstellingen tijdens de operationele taak.

## Moduleflow 1: Bezoekersbeheer

### Inrichting

- bezoekerstypen, zoals bezoeker, leverancier, monteur, chauffeur, contractor
  en evenementgast;
- registratieformulier per type met verplichte en optionele velden;
- bron voor te bezoeken persoon, afdeling, kamer of zone;
- vooraf aanmelden en eventuele goedkeuring;
- bezoektijdvenster en toegestane objectzones;
- host-, receptie- en beveiligingsmeldingen;
- badge-/pasbeleid en optionele nummerreeks;
- vereiste documenten, veiligheidsinstructie, verklaring of NDA;
- regels voor escort, blokkade en bijzonderheden;
- automatische uitcheck en no-showbeleid;
- retentie en anonimisering per bezoekerscategorie;
- rechten voor klantportaal, receptie, beveiliger en beheerder.

### Operationele flow

```text
expected -> approved -> checked_in -> checked_out
         -> denied
         -> cancelled
         -> no_show
```

Een walk-in begint bij `checked_in` nadat de vereiste controle is uitgevoerd.
De actuele evacuatielijst is een server-side projectie van alle bezoeken met
status `checked_in` zonder vertrekmoment. Het handmatig verwijderen van iemand
uit die lijst is niet toegestaan; uitchecken of een gelogde correctie verandert
de projectie.

De basisregistratie bevat bezoeker, bedrijf, contactpunt, kenteken indien
nodig, bezoekdoel, host/bestemming, verwacht en werkelijk aankomst-/vertrekmoment
en opmerkingen. Identiteitscontrole bewaart standaard alleen methode,
resultaat, actor en tijd. Een volledig documentnummer of documentafbeelding is
alleen toegestaan na een expliciete privacy- en grondslagbeslissing.

## Moduleflow 2: Middelenuitgifte

### Inrichting

- itemtypen, bijvoorbeeld sleutel, toegangspas, badge, portofoon, laptop,
  gereedschap of kamergerelateerd middel;
- catalogus met objectunieke itemcode, naam, type, serienummer, locatie,
  verantwoordelijke en opmerkingen;
- serie-item of hoeveelheid/voorraad;
- keuze of niet-gecatalogiseerde items mogen worden uitgegeven;
- selecteerbare personen-, kamers-, afdelingen- en leverancierslijsten;
- rechten per persoon, rol, groep, item of itemgroep;
- geldigheid, dag-/tijdvensters, noodzakelijke kwalificaties en voorwaarden;
- boekings-, uitgifte-, overdrachts- en retourformulier;
- standaard verwachte retour, curfew, grace period en escalatie;
- inspectie- en defectcategorieën;
- bewijsbeleid voor uitgifte en retour;
- overridebeleid, inclusief reden en eventuele tweede goedkeurder.

### Beslisregels

Een middel kan alleen worden uitgegeven wanneer alle toepasselijke controles
slagen:

- identiteit en actieve status;
- item is beschikbaar en niet gereserveerd voor een ander;
- expliciete bevoegdheid voor persoon/rol en middel;
- actueel tijdvenster en geldigheid;
- vereiste kwalificatie;
- geen blocking defect of vermissing;
- vorige custody is correct beëindigd.

Het personenveld toont standaard alleen bevoegde kandidaten. Een bevoegde
beheerder kan via een afzonderlijke controleactie een verklaarde weigering
opvragen. Een reservering is nooit automatisch een bevoegdheid en een
bevoegdheid bewijst niet dat het item fysiek beschikbaar is.

### Custodyflow

```text
available -> reserved -> checked_out -> transferred -> returned
                       -> returned_with_fault
                       -> overdue -> escalated -> resolved
                       -> missing

authorization check -> allowed
                    -> access_denied
                    -> override_used
```

De actuele houder en inzetbaarheid zijn projecties uit deze events. Een
kritiek defect, vermissing of gecompromitteerde sleutel blokkeert nieuwe
uitgifte. Retour na de curfew blijft een late retour en wordt niet achteraf
genormaliseerd tot een tijdige retour.

## Moduleflow 3: Post & pakketten

### Inrichting

- ontvangstgebieden of balies binnen het object;
- categorieën zoals pakket, aangetekende post, interne post, maaltijd,
  leverancier of kantoorvoorraad;
- vervoerders en optionele trackingreferentie;
- ontvangersbron met aliassen, afdeling, kamer en vervanger/assistent;
- handmatige invoer en later optionele foto-/OCR-herkenning;
- opslagplaats en verplaatsingsrechten;
- notificatiekanaal, kantooruren, vertraging en herinneringsschema;
- afhaalbewijs via bevestiging, PIN, handtekening of foto;
- regels voor onbekende ontvanger, beschadiging, vertrouwelijke post,
  doorsturen en retour afzender;
- bewaartermijn voor labels, foto's, trackingdata en afhaalbewijs.

### Operationele flow

```text
received -> recipient_matched -> notified -> picked_up
         -> unknown_recipient
         -> moved
         -> forwarded
         -> returned_to_sender
         -> damaged
         -> unclaimed -> escalated
```

Ontvangst, melding en feitelijke afhaling zijn afzonderlijke gebeurtenissen.
Een ontvanger mag zijn eigen pakket als afgehaald bevestigen wanneer het beleid
dat toestaat, maar een beheerder kan niet zonder audit de ontvangst- of
afhaalactor herschrijven. Labelafbeeldingen zijn privébestanden en worden niet
standaard in algemene zoekresultaten of notificaties opgenomen.

## Moduleflow 4: Gevonden voorwerpen

### Inrichting

- categorieën en gevoelige categorieën, zoals identiteitsdocument, sleutel,
  betaalmiddel of elektronica;
- registratieformulier met vinddatum, -tijd, -plaats, omschrijving, kleur,
  merk, kenmerken en optionele foto;
- unieke objectgebonden registratietag;
- interne opslaglocaties en bevoegdheden voor verplaatsing;
- afzonderlijke interne en publiceerbare omschrijving;
- claimformulier en configureerbare geheime controlevragen;
- rollen voor claimbeoordeling, goedkeuring en fysieke afgifte;
- afhaal-, verzend-, politieoverdracht-, donatie- en vernietigingsbeleid;
- bewaartermijn en escalatie per categorie;
- privacybeleid voor vinder, claimant, foto en bewijsgegevens.

### Operationele flow

```text
registered -> stored -> published
                     -> claim_received -> under_review -> verified -> returned
                                                   -> rejected
                     -> transferred
                     -> donated
                     -> disposed
```

Een claim is geen bewijs van eigendom. Controlekenmerken die de echte eigenaar
moet kunnen noemen worden niet in de publieke omschrijving getoond. De
claimbeoordelaar ziet alleen de noodzakelijke bewijsgegevens. BSN, volledige
kaartnummers en onnodige kopieën van identiteitsdocumenten worden niet
opgeslagen.

Iedere fysieke verplaatsing tussen balie, kluis, opslag, politie, koerier en
claimant is een custody-event. De actuele opslagplaats is een projectie; zij
wordt niet zonder historie overschreven.

## Moduleflow 5: Objectagenda

### Afbakening

De Objectagenda is een operationele kalender voor wat op of rond het object
gebeurt. Zij is niet het personeelsrooster, geen reeks beveiligingstaken en geen
vervanging van Planning. Een afspraak of evenement kan wel bezoekers,
actiepunten, mededelingen of toekomstige beveiligingstaken veroorzaken.

### Inrichting

- typen zoals afspraak, levering, contractor, onderhoud, evenement,
  sluiting/afwijkende opening en reservering;
- velden en kleur/icoon per type, waarbij status nooit alleen door kleur wordt
  weergegeven;
- organisator, eigenaar, deelnemers en betrokken teams;
- locatie, gebouwdeel, kamer, zone of resource;
- capaciteit, conflicten en optionele goedkeuring;
- instructies, bijlagen en interne versus operationele zichtbaarheid;
- herinneringen en escalaties;
- herhaling, uitzonderingen, feestdagen en tijdzone;
- koppeling naar bezoekeruitnodigingen en actiepunttemplates;
- toekomstige adapter voor Outlook/Google met externe ID en syncstatus.

### Operationele flow

```text
draft -> pending_approval -> confirmed -> in_progress -> completed
                       -> rejected
       -> cancelled
       -> no_show
```

Een terugkerende serie en haar afzonderlijke occurrences zijn verschillende
records. Een wijziging aan één datum verandert niet stil de hele serie. Externe
kalendersynchronisatie gebruikt idempotency en conflictstatussen; LOQ bewaart
de canonieke objectcontext en accepteert geen blinde last-write-wins.

## Moduleflow 6: Actiepunten

### Inrichting

- actiepunttypen en labels;
- prioriteitsniveaus en toegestane statussen;
- medewerker- of teamtoewijzing;
- standaarddeadline, reminders en escalatie per type;
- terugkerende acties en uitzonderingen;
- verplichte velden, bijlagen en afrondbewijs;
- klantzichtbaarheid en eventuele review voor publicatie;
- automatische bronnen, bijvoorbeeld overdue middel, niet-afgehaald pakket,
  visitor overstay, afgewezen claim of incidentbevinding;
- rechten voor aanmaken, toewijzen, uitvoeren, reviewen en sluiten.

### Operationele flow

```text
open -> in_progress -> completed
     -> waiting
     -> blocked
     -> cancelled
```

Ieder actiepunt heeft een expliciete bron, bijvoorbeeld module-record,
planuitvoering, incident, rapport, object of handmatige registratie. Het
actiepunt bevat titel, omschrijving, eigenaar/team, prioriteit, deadline,
status, volgers, afhankelijkheden en completion evidence.

Afronden sluit de bron niet automatisch. Een afgeronde actie bij een overdue
middel maakt dat middel bijvoorbeeld pas `resolved` wanneer de aparte
custodyflow dat bevestigt. Comments en activiteit vormen een tijdgestempelde
feed; een comment is zelf geen actiepunt.

## UX van de tab Modules

### Full-screen tabel

De tab volgt dezelfde LOQ-tabelconventies als Waarschuwingsadressen, Sleutels
en Installaties. De tabel gebruikt de volledige beschikbare dossierbreedte en
ondersteunt zoeken, statusfilter, sorteren, toetsenbordbediening, loading,
lege zoekresultaten, fouten en geen-toegangstoestanden.

Aanbevolen kolommen:

| Kolom | Betekenis |
| --- | --- |
| Module | Icoon, weergavenaam en vast moduletype. |
| Status | Instellen vereist, actief, gepauzeerd of gearchiveerd. |
| Inrichting | Concrete voortgang of ontbrekende verplichte onderdelen. |
| Beveiligingsplannen | Aantal actuele planrevisies dat de module koppelt. |
| Actueel | Modulespecifieke indicator, zoals aanwezigen of open records. |
| Verantwoordelijke | Beheerder of team. |
| Laatste activiteit | Laatste operationele gebeurtenis, niet alleen configuratiewijziging. |
| Gewijzigd | Tijd en actor van de laatste beheerwijziging. |

De primaire tabelactie is **Module toevoegen**. Er staat geen concurrerende
archiveerknop in iedere rij. Rijacties staan in het contextmenu en een klik op
de rij opent de modulewerkruimte via de URL.

### Korte toevoegwizard

De toevoegwizard blijft bewust klein:

1. **Module kiezen** — alleen nog niet toegevoegde typen zijn selecteerbaar;
2. **Naam** — een herkenbare weergavenaam kiezen en de module toevoegen.

Een nieuwe module krijgt status `concept`. De gebruiker gaat
na opslaan direct naar de modulewerkruimte. De volledige domeinconfiguratie
wordt niet in de toevoegwizard geperst.

### Modulewerkruimte

Iedere modulewerkruimte heeft dezelfde basisopbouw:

- breadcrumb en moduleheader;
- duidelijke status en configuratiechecklist;
- één primaire contextactie;
- compacte horizontale sectienavigatie;
- tabellen voor catalogi, regels en historie;
- een rijzijpaneel of wizard voor enkelvoudige toevoegingen;
- URL-gestuurde sectie, filter en rijselectie.

Naast de editor staat een live operationeel voorbeeld. Dit voorbeeld werkt
uitsluitend in de browser met de nog niet opgeslagen werkconfiguratie. Het
laat direct zien welke velden en keuzes de beveiliger krijgt, blokkeert een
groene testuitkomst zolang verplichte velden ontbreken en simuleert bij
middelenuitgifte de ingestelde bevoegdheden en tijdvensters. De testmodus
maakt nadrukkelijk geen operationeel record en mag daarom niet met echte
persoonsgegevens worden gebruikt.

Modulespecifieke secties:

| Module | Secties |
| --- | --- |
| Bezoekersbeheer | Overzicht, Bezoekerstypen, Formulieren, Hosts & toegang, Meldingen, Privacy, Historie |
| Middelenuitgifte | Overzicht, Catalogus, Personen & rechten, Tijdregels, Formulieren, Meldingen, Historie |
| Post & pakketten | Overzicht, Ontvangstlocaties, Ontvangers, Meldingen, Afhaalbeleid, Privacy, Historie |
| Gevonden voorwerpen | Overzicht, Categorieën, Opslag, Claims & controle, Retentie, Publicatie, Historie |
| Objectagenda | Kalender, Typen, Resources, Herhaling, Meldingen, Integraties, Historie |
| Actiepunten | Overzicht, Typen, Toewijzing, Deadlines & escalatie, Automatisering, Historie |

Niet-geïmplementeerde functies worden niet als decoratieve, lege sectie
getoond. Een fase- of featureflag bepaalt of een volledige sectie beschikbaar
is.

## Koppeling met beveiligingsplannen

### Binding in een planrevisie

Alleen actieve, gepubliceerde objectmodules verschijnen in de
planwerkruimte onder **Modules**. De `module_assignments` in een
`ObjectSecurityPlanRevision` bevatten in fase 1:

- objectmodule en vastgelegde moduleconfiguratierevisie;
- toegang `read` of `register`;
- optionele snelle actie;
- aanvullende planinstructie;

Fijnmaziger capabilities en recordfilters worden pas toegevoegd wanneer de
operationele uitvoerings-API deze end-to-end kan afdwingen.

De binding kopieert geen catalogus, instellingen of operationele records. Een
module kan in meerdere plannen worden gekoppeld en blijft dezelfde gegevens
tonen. Een planbinding kan basisrechten beperken, maar nooit uitbreiden. De
server berekent effectieve toestemming als doorsnede van persona, BV, klant,
object, actieve taak, modulebeleid en planbinding.

### Publicatie en wijziging

- Een gepubliceerde planrevisie houdt haar modulebinding onveranderlijk.
- Een volgende planrevisie mag bindings toevoegen, wijzigen of verwijderen.
- Moduleconfiguratie heeft een eigen publicatiecyclus; een wijziging maakt geen
  nieuwe beveiligingsplanrevisie.
- Iedere operationele handeling legt de op dat moment gebruikte
  moduleconfiguratie- en beleidsversie vast.
- Archiveren of pauzeren van een verplichte gekoppelde module blokkeert nieuwe
  taakgeneratie/publicatie met een concrete reden; historische taken blijven
  leesbaar.
- Ontkoppelen van een module verwijdert nooit moduledata of historie.

### Operationele zichtbaarheid

Een beveiliger ziet alleen modules die:

1. bij het object horen;
2. actief zijn;
3. aan de gebruikte planrevisie zijn gekoppeld;
4. voor zijn persona/rol en concrete taak zijn toegestaan;
5. binnen eventuele tijd-, zone- of categorievoorwaarden vallen.

Voor gedeelde data kan een binding een weergavefilter gebruiken, maar geen
afzonderlijke dataset maken. Een receptieplan kan bijvoorbeeld alle gevonden
voorwerpen registreren, terwijl een sluitronde alleen open of recent gevonden
records raadpleegt.

## Privacy en beveiliging

### Autorisatiegrens

De browser en operationele app lezen module-entiteiten niet rechtstreeks. Alle
moduleacties lopen via een bestaande geconsolideerde backendgrens, bij voorkeur
`customerPlatformApi` voor beheer en een operationele API/actie binnen de
bestaande functielimiet voor uitvoering.

Iedere request controleert vóór de eerste inhoudelijke datalezing:

- interne of operationele persona;
- eigen BV;
- klant en object;
- module en plan-/taakcontext;
- actie/capability;
- recordstatus en publicatiestatus;
- eventuele tijd-, zone- en persoonsvoorwaarden.

In fase 1 is de beheer-API uitsluitend toegankelijk voor de ingebouwde
backoffice-rol `admin`. Die rol is in de huidige LOQ-app een bewust
organisatiebrede vertrouwensrol; de API controleert daarnaast altijd de
klant-objectrelatie voordat module-inhoud wordt gelezen. Dit is geen
geschikte grens voor beperkte BV-beheerders. Zodra zo'n persona wordt
ingevoerd, is een expliciete gebruiker-BV-membership plus eigenaarschap van
klant/object een activeringsvoorwaarde voordat modules voor die persona
beschikbaar komen. De operationele en portaalfasen mogen nooit op de globale
admin-aanname leunen.

Clientfilters zijn nooit autorisatie. Mutaties vereisen `idempotency_key` en
`expected_version`; dubbele retries leveren hetzelfde resultaat en
gelijktijdige conflicten een verklaarde `409`.

### Dataminimalisatie en veldbeveiliging

- Bezoekers- en claimformulieren verzamelen alleen doelgebonden velden.
- BSN, volledige betaalkaartnummers en onnodige identiteitskopieën zijn
  verboden.
- Identiteitscontrole bewaart standaard resultaatmetadata, niet het document.
- Geheime eigendomskenmerken van gevonden voorwerpen zijn field-level
  afgeschermd en nooit publiek doorzoekbaar.
- Sleutel-/toegangsdetails, gevoelige itemnotities en blokkaderedenen krijgen
  expliciete veldrechten en waar nodig step-up authenticatie.
- Bestanden zijn privé en worden uitsluitend via een kort geldige signed URL
  geleverd na nieuwe autorisatie.
- Algemene object- en klantzoekresultaten bevatten geen identiteitsnummers,
  labelafbeeldingen, geheime claimdetails of toegangsinformatie.

### Retentie en verwijdering

Iedere module heeft configureerbare maar beleidsbegrensde bewaartermijnen per
record- en bestandstype. Anonimisering/verwijdering geldt ook voor media,
exports, notificatiepayloads, zoekindexen en afgeleide caches.

Een operationeel record wordt niet hard verwijderd om een fout te verbergen.
Correctie, annulering, anonimisering en wettelijke verwijdering zijn
afzonderlijke gelogde acties. Financieel, juridisch of veiligheidsrelevant
bewijs kan langer worden bewaard dan gewone persoonsgegevens wanneer daarvoor
een vastgelegd doel en grondslag bestaat.

### Audit en support

- Auditrecords zijn append-only en niet wijzigbaar door normale gebruikers.
- Exports leggen actor, doel, filters en recordaantallen vast.
- Support gebruikt geen onzichtbare impersonatie; tijdelijke supporttoegang
  heeft ticket, reden, scope, eindtijd en auditbanner.
- Klantportaaltoegang wordt per klant, object en module verleend en gebruikt
  veilige DTO's, nooit interne entiteiten.

## Gefaseerde operationele grens

### Fase 1 — platformfundament en objectbeheer

In scope:

- tab Modules met full-screen tabel, states, zoeken en filters;
- korte toevoegwizard en unieke module-installatie per object/type;
- moduleheader, status, configuratiechecklist en basiswerkruimte;
- live, niet-opslagend voorbeeld met verplichte-veldcontrole en lokale test;
- configuratieversies, algemene rollen, retentie en audit;
- basiscatalogi en objectreferentielijsten;
- planbinding in concept- en gepubliceerde beveiligingsplanrevisies;
- server-side objectscope, idempotency, CAS en featureflags;
- gecontroleerd pauzeren, archiveren en herstellen.

Operationele registratieknoppen worden alleen getoond voor een module waarvan
de betreffende flow werkelijk end-to-end beschikbaar en getest is.

### Fase 2 — backoffice/receptie-uitvoering

In scope:

- bezoekers vooraf aanmelden, inchecken, uitchecken en evacuatielijst;
- middel uitgeven, overdragen, retour, overdue en defect;
- post/pakket ontvangen, melden, verplaatsen en afhalen;
- gevonden voorwerp registreren, opslaan, claimen, beoordelen en retourneren;
- objectagenda met series en occurrences;
- actiepunten met toewijzing, reminders, activiteit en afrondbewijs;
- gedeelde records zichtbaar vanuit meerdere gekoppelde plannen;
- operationele dashboards en modulehistorie.

### Fase 3 — concrete taak en mobiele uitvoering

In scope:

- modulecontext in `TaskExecution`;
- snelle acties vanuit een actieve beveiligingstaak;
- effectieve plan-/rolrechten per handeling;
- veilige beperkte offline ondersteuning met idempotente eventqueue;
- syncconflicten, retries en buiten-volgorde-events;
- gebruikte configuratie-/beleidsversie per uitvoering;
- overdracht tussen diensten zonder datasetkopie.

Gevoelige autorisatiecontroles die actuele bevoegdheid vereisen worden niet
offline toegestaan zonder expliciet, kort geldig en server-uitgegeven recht.

### Fase 4 — portaal, integraties en automatisering

In scope:

- klantportaal voor vooraf aanmelden en toegestane inzage;
- Outlook/Google Calendar-adapter;
- directory-, HR- en access-control-integraties;
- OCR voor pakketten;
- providerkoppeling of veilige publicatie voor gevonden voorwerpen;
- configureerbare automatisering van reminders, escalaties en actiepunten;
- analytics en goedgekeurde exports.

Modules en secties blijven achter een featureflag per BV en eventueel object.
Een latere fase wordt niet in de productie-interface gesimuleerd met knoppen
die nog geen volledige backend-, autorisatie- en auditflow hebben.

## Acceptatiecriteria

### Objectmodule en UX

- De Modules-tab heeft dezelfde table shell, dichtheid, responsive states en
  toetsenbordbediening als de overige objecttabellen.
- Een module toevoegen opent de bekende LOQ-wizard en daarna een herlaadbare
  module-deeplink.
- Een object kan hetzelfde moduletype niet tweemaal toevoegen, ook niet via
  parallelle requests of directe API-calls.
- Een nieuwe module toont concrete ontbrekende configuratie en wordt pas actief
  na geldige inrichting.
- Tab, sectie, filters en geselecteerde rij zijn URL-gestuurd en werken met
  browser terug/vooruit.
- Pauzeren, archiveren en herstellen zijn auditbaar; alleen een leeg concept
  zonder records of planrelaties kan hard worden verwijderd.

### Gedeelde data en planbinding

- Twee beveiligingsplannen die dezelfde module koppelen lezen aantoonbaar
  dezelfde records en catalogi.
- Een record dat in plan A wordt toegevoegd is in plan B zichtbaar zodra de
  binding en rechten dat toestaan, zonder duplicatie of synchronisatiejob.
- Een plan zonder modulebinding kan de module niet via UI, SDK, geraden ID of
  function-call lezen of wijzigen.
- Een planbinding kan rechten beperken maar nooit de module- of
  persoonsbevoegdheid uitbreiden.
- Ontkoppelen van een module verwijdert geen records, configuraties of audit.
- Een gepubliceerde planrevisie en historische taak blijven verwijzen naar hun
  oorspronkelijke binding; latere wijzigingen herschrijven geen historie.
- Een operationele actie bewaart de gebruikte configuratie-/beleidsversie en
  concrete taakcontext.

### Moduleflows

- De evacuatielijst bevat exact de actuele ingecheckte, niet uitgecheckte
  bezoekers en is niet handmatig te manipuleren.
- Een niet-bevoegde persoon kan geen middel uitgeven via UI of directe API en
  krijgt een verklaarde, gelogde weigering zonder gevoelige beleidsdetails.
- Reservering, bevoegdheid, beschikbaarheid en custody blijven afzonderlijk;
  een reservering geeft geen uitgifterecht.
- Iedere uitgifte, overdracht, retour, late retour, defect en vermissing blijft
  als afzonderlijk event reproduceerbaar.
- Een pakket kent afzonderlijke ontvangst-, notificatie- en afhaalmomenten en
  afhaalbewijs wordt alleen volgens modulebeleid gevraagd.
- Een gevonden-voorwerpclaim maakt de claimant niet automatisch eigenaar;
  geheime controlekenmerken zijn niet publiek zichtbaar.
- Eén wijziging in een terugkerend agenda-item verandert niet stil alle andere
  occurrences.
- Afronden van een actiepunt sluit het bronrecord niet zonder een expliciete,
  afzonderlijke domeinactie.

### Privacy, security en betrouwbaarheid

- Klant/object A kan records, bestanden, catalogi of policy-uitkomsten van
  klant/object B nooit ophalen.
- API-autorisatie vindt vóór de eerste inhoudelijke datalezing plaats en test
  persona, BV, klant, object, module, plan/taak en actie.
- Portal- en mobiele DTO-tests bewijzen de afwezigheid van interne notities,
  geheime claimkenmerken, volledige ID-nummers, raw file-URL's en
  toegangsinformatie.
- Bestandsdownloads vereisen actuele autorisatie en een kort geldige signed
  URL; de opslaglocatie wordt niet aan de client prijsgegeven.
- Dubbele offline of online mutaties met dezelfde idempotency key maken één
  gebeurtenis en leveren hetzelfde resultaat.
- Gelijktijdige configuratie- of recordwijzigingen overschrijven elkaar niet
  stil maar leveren een verklaard versieconflict.
- Retentie en anonimisering worden aantoonbaar toegepast op hoofddata,
  bestanden, exports, zoekindexen en notificatiepayloads.
- Auditlogs bewaren actor, tijd, bron, reden, taakcontext en gebruikte
  beleidsversie zonder gevoelige vrije before/after-dumps.
- Desktop, tablet en mobiel tonen aparte loading-, leeg-, fout-, geen-toegang-
  en gearchiveerd-toestanden.

## Niet overnemen uit de referenties

- Geen losse objectcheckbox als volledige modulearchitectuur.
- Geen kopie van een modulecatalogus of operationele dataset per plan.
- Geen vrij overschrijfbare actuele houder, bezoekerstatus of opslaglocatie.
- Geen reservering behandelen als bevoegdheid.
- Geen onbevoegde personen selecteerbaar maken om pas na opslaan te weigeren.
- Geen identiteitsbewijsnummer als vanzelfsprekend bezoekersveld.
- Geen publieke foto of omschrijving die geheime eigendomskenmerken verraadt.
- Geen kalender vermengen met personeelsrooster, beveiligingstaak of dienst.
- Geen actiecommentaar behandelen als taak en geen actiecompletion gebruiken
  om stil een ander domeinrecord te sluiten.
- Geen mobiele of portaalmodule publiceren voordat scope, autorisatie,
  retentie, audit en fout-/offlinegedrag end-to-end zijn getest.
