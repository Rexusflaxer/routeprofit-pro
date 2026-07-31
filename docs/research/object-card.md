# LOQ-objectkaart: onderzoek en architectuurbesluit

Onderzoeksdatum: 31 juli 2026
Status: leidend besluit voor de Backoffice-objectpagina
Route: `/Objects?id={objectId}&tab={tab}&view={view}&row={row}`

## Besluit in het kort

De LOQ-objectkaart wordt het operationele dossier van **één fysieke locatie**.
De kaart krijgt dezelfde rustige dossieropbouw als Personeel, Bedrijfsprofiel en
Klant: een compacte profielkop, verticale tabs op desktop, een horizontaal
scrollbare tabbalk op tablet en mobiel, dunne borders, schaalbare tabellen en
één primaire actie per context.

Een object is nadrukkelijk niet hetzelfde als een klant, contract, collectief,
dienst of bezoek:

| Begrip | Eigen verantwoordelijkheid |
| --- | --- |
| Klant | Juridische en commerciële partij, contactorganisatie en debiteur. |
| Object | Fysieke locatie met adres, operationele inrichting en uitvoeringscontext. |
| Collectief | Logische groep of gebied waarin meerdere objecten kunnen vallen. |
| Contractregel | Verkochte dienstverlening met geldigheid, scope en tariefmodel. |
| Taak/planningsdienst | Te plannen opdracht op een datum of binnen een tijdvenster. |
| Taakuitvoering | Historische uitvoering met snapshots, bewijs en financiële review. |

Daarom komt niet alle informatie als veld op `SurveillanceObject`. Gegevens met
een eigen geldigheid, versie, autorisatie, audit of één-op-veelrelatie krijgen
een eigen entiteit. De objectkaart brengt die gegevens samen, maar maakt hun
levenscycli niet gelijk.

## Onderzoeksbasis

### Bestaande LOQ-referenties

De volgende eerder opgebouwde workspace-referenties zijn opnieuw als basis
gebruikt:

- `Reference/SequriX/README.md`: een object bevat operationele locatiecontext,
  maar sleutels, installaties, checkpoints, escalatiecontacten, relaties,
  documenten en rapportontvangers zijn afzonderlijke onderdelen. Gevoelige
  objectdetails vragen in de mobiele workflow om herbevestiging.
- `Reference/Secure-it/README.md`: instructies kunnen algemeen, structureel of
  eenmalig zijn; documenten hebben verschillende zichtbaarheid en kunnen extra
  worden beveiligd. Planning, restricties, rapportage en klantcontracten hebben
  ieder een eigen proces.
- `Reference/Secusoft/README.md`: de opdrachtgever is iets anders dan de
  opdracht/werklocatie. Eerst wordt een minimale locatie gemaakt; standaardwerk,
  instructies, planning en klantrechten volgen daarna.
- `Reference/WebappLandscape/FUNCTION-MATRIX.md`: TrackTik is de primaire
  referentie voor de operationele keten, GuardsPro voor aanvullende
  volledigheid, TrakaWEB voor custody en Front/Trengo voor scanbare context.
- `Reference/WebappLandscape/DESIGN-UX.md`: toon alleen de informatie die de
  rol voor de huidige taak nodig heeft; voorkom een tegelwand waarin elk
  datapunt even belangrijk lijkt.
- `Reference/WebappLandscape/deep-dives/02-security-operations.md`: een ronde
  loopt van opdracht via uitvoering en bewijs naar review en expliciete
  klantpublicatie. Postorders horen versieerbaar en aantoonbaar gelezen te zijn.
- `Reference/WebappLandscape/deep-dives/06-assets-routes-fleet.md`: sleutel- en
  middelenbeheer is een custody-domein. De actuele houder is een projectie uit
  append-only uitgifte- en retourevents, geen vrij wijzigbaar objectveld.

### Actuele officiële controlebronnen

Alle onderstaande bronnen zijn geraadpleegd op 31 juli 2026:

- [Secure-IT CRM](https://www.secure-it.nl/hoe-werkt-het-/crm/): meerdere
  objecten onder één relatie en afzonderlijke objectonderdelen voor onder meer
  documenten, instructies, installaties, scanpunten, sleutels en
  waarschuwingsadressen.
- [SequriX objectbeveiliging](https://www.sequrix.com/nl/product/objectbeveiliging/)
  en [SequriX alarmopvolging](https://www.sequrix.com/nl/product/alarmopvolging/):
  het object is de operationele context voor logboek, controles, rapportage en
  alarmopvolging; informatie moet gericht bij de uitvoerder terechtkomen.
- [Secusoft klantenportaal](https://www.secusoft.nl/klantenportaal-ptf1069):
  klanttoegang is geautoriseerde inzage in geselecteerde planning, instructies,
  registraties, rapportages en documenten, niet rechtstreekse toegang tot het
  interne objectrecord.
- [TrackTik Manage Sites](https://support.tracktik.com/hc/en-us/articles/1500000786682-Manage-Sites):
  site-identiteit, geocodering, dispatch- en planningsinstellingen worden
  afzonderlijk beheerd. Locatiecontrole is meer dan alleen een adresstring.
- [TrackTik Managing Post Orders](https://support.tracktik.com/hc/en-us/articles/360060079154-Managing-Post-Orders):
  site- en zone-instructies kunnen bijlagen en een gelezen-/erkenningsproces
  hebben.
- [TrackTik Checkpoints and Tours](https://support.tracktik.com/hc/en-us/articles/30569727081367-Best-Practices-for-Creating-Checkpoints-and-Tours):
  checkpointdefinitie, locatie/sectie, scanmethode, vereiste handeling en
  bewijs horen bij een beheerde ronde en niet bij één tekstveld.
- [TrackTik Features](https://support.tracktik.com/hc/en-us/articles/360060066134-Features):
  noodcontacten met escalatievolgorde, sitetaken, rapportages en audit zijn
  samenhangende maar afzonderlijke sitefuncties.
- [GuardsPro Post Sites](https://support.guardspro.com/hc/en-us/articles/29334526380443-How-to-add-post-site-on-the-Back-Office-Dashboard)
  en [GuardsPro mobile check-in](https://support.guardspro.com/hc/en-us/articles/33468399270683-How-to-check-into-a-post-site-on-mobile-app):
  de locatie wordt eerst onder een klant ingericht; bij een actieve inzet krijgt
  de medewerker contextueel toegang tot tours, postorders, taken, rapportages
  en logboeken.
- [GuardsPro Post Order Acknowledgement](https://support.guardspro.com/hc/en-us/articles/50926706266011-How-to-check-post-order-acknowledgement-report-on-the-GuardsPro-Admin-App):
  erkenning van instructies is aantoonbaar met gebruiker en tijdstip en is iets
  anders dan de instructietekst zelf.

De bronnen bevestigen hetzelfde patroon: de objectkaart is een dossier en
werkruimte, niet één groot formulier.

## Domeingrenzen

### Objectbasis

`SurveillanceObject` blijft de stabiele kern voor:

- klantrelatie en server-side gegenereerde objectcode;
- herkenbare naam en functioneel objecttype;
- gestructureerd adres, BAG-verwijzing, coördinaten en geocodestatus;
- regio en collectiefcontext;
- een kleine levenscyclus;
- mobiele kaartinstellingen;
- defaults voor latere planning en CAO-/kwalificatiecontrole;
- tijdelijke compatibiliteitsvelden voor bestaande objectinstructies.

Een objecttype helpt de vervolgconfiguratie voorstellen, maar activeert geen
dienst, tarief, portaalrecht of mobiele toegang. Die beslissingen komen uit de
eigen bronentiteiten.

### Drie onafhankelijke toestanden

De interface mag deze drie begrippen nooit samenvoegen:

1. **Levenscyclus** — `concept`, `active`, `inactive` of `archived` op
   `SurveillanceObject`. Dit is een administratief besluit over het object.
2. **Inrichtingsgereedheid** — een afgeleide checklist per dienstverlening,
   bijvoorbeeld geldig adres, geocode, contact/escalatie, geldige instructie,
   contractregel en uitvoerbare taak. Dit is geen handmatig statusveld en kan
   per dienst verschillen.
3. **Actuele operationele staat** — bijvoorbeeld gepland, onderweg, op locatie,
   afgerond, incident actief of administratief in review. Dit volgt uit
   `PlanningShift`, `TaskExecution`, route- en incidentdata en wordt nooit naar
   `SurveillanceObject.status` teruggeschreven.

`active` betekent dus niet automatisch "klaar voor alarmopvolging" en een
lopende uitvoering verandert de objectlevenscyclus niet.

Voor de eerste versie berekent de UI aandachtspunten uit de beschikbare data.
Wanneer readiness later processturend wordt, is een afzonderlijke
`ObjectReadinessAssessment` nodig met diensttype, vereistenversie, resultaat,
blokkerende redenen, beoordelaar en tijdstip. Een enkel `is_ready`-veld is niet
voldoende.

## Minimale aanmaakwizard

Het eerder genomen onboardingbesluit blijft gelden: aanmaken moet snel zijn en
de detailinrichting gebeurt op de objectkaart. De wizard bevat maximaal drie
compacte stappen:

1. **Basis** — klant staat vast vanuit het geopende klantdossier; de gebruiker
   kiest een herkenbare objectnaam en objecttype.
2. **Locatie** — adres zoeken/kiezen of bewust handmatig invullen. BAG-id,
   geocodestatus en coördinaten worden waar mogelijk vastgelegd.
3. **Controle** — samenvatting, duplicaatwaarschuwing en expliciet aanmaken.

Bij opslaan:

- maakt de server de unieke objectcode;
- voorkomt een `idempotency_key` duplicaten bij retry;
- begint het object als `concept`;
- opent direct de herlaadbare deeplink
  `/Objects?id={objectId}&tab=overview&new=1`;
- leidt een korte onboardingchecklist naar de ontbrekende inrichting.

Regio, collectief, instructies, contactrollen, dienstverlening, planning,
plattegronden, documenten, codes en sleutels horen niet in deze wizard. Een
handmatig of niet-geverifieerd adres mag als concept worden opgeslagen, maar
blijft een zichtbaar aandachtspunt en wordt niet stil als mobiele kaartlocatie
behandeld.

## Informatiearchitectuur van de objectkaart

### Profielkop

De vaste kop toont alleen scanbare identiteit en context:

- breadcrumb `Objecten / {objectnaam}` en terugactie;
- objecticoon of initialen, objectnaam en objectcode;
- levenscyclusbadge;
- adres en geocodestatus;
- gekoppelde klant als deeplink;
- regio en eventueel collectief;
- compacte readiness-/aandachtspuntsamenvatting;
- één primaire actie die past bij de actieve tab.

Geheime codes, sleutellocaties, volledige instructies en interne incidentnotities
staan nooit in de profielkop, lijstweergave of zoekresultaten.

### Tabs die met de huidige backend verantwoord beschikbaar zijn

| Tab | Doel | Huidige bron | Gedrag in deze fase |
| --- | --- | --- | --- |
| **Overzicht** | Aandachtspunten, klant/collectief, komende inzet, actieve diensten, laatste uitvoering en recente activiteit. | `SurveillanceObject`, `Customer`, `Collectief`, `Task`, `PlanningShift`, `TaskExecution`, `CustomerEvent` | Samengestelde read-only samenvatting met deeplinks. |
| **Objectgegevens** | Naam, type, adres/geocode, regio en mobiele kaartcontext. | `SurveillanceObject` | Bewerken via gevalideerde backendmutatie met `expected_version` en `idempotency_key`. |
| **Contacten** | Klantcontacten die klantbreed of expliciet voor dit object bevoegd zijn. | `CustomerContact`, `CustomerContactPoint`, `CustomerContactRole.object_ids` | Tabel; klantbrede rol of object-id bepaalt scope. Beheer blijft voorlopig in klantdossier. |
| **Instructies** | Parkeren, aankomst, lopen, toegang, alarm, sleutelinstructie en veiligheidscontext. | Compatibiliteitsvelden op `SurveillanceObject` | Alleen intern bewerken. Duidelijk tonen dat dit nog geen versieerbare postorderpublicatie is. |
| **Planning & taken** | Directe objecttaken, collectieftaken waarin het object is geselecteerd, geplande diensten en historische uitvoeringen. | `Task`, `Collectief`, `PlanningShift`, `TaskExecution` | Schaalbare tabellen; zware planning opent de centrale werkruimte. Historische snapshots blijven intact. |
| **Plattegronden** | Actuele en eerdere 2D-/3D-revisies en annotaties. | `ObjectFloorPlan` | Revisietabel en veilige preview; `is_current` is niet hetzelfde als `published`. |
| **Rapportages** | Objectrapporten, uitvoeringsstatus, review en eventuele klantpublicatie. | `MobileReport`, `TaskExecution.report_id`, `CustomerPortalPublication` | Intern rapport en gepubliceerde portalsnapshot worden apart getoond. |
| **Documenten** | Objectgebonden bestanden, categorie, versie, geldigheid en publicatiestatus. | `ManagedFile` met `owner_type=object`, `owner_id`/`object_id` | Privébestand als uitgangspunt; upload is nooit automatisch publiceren. |
| **Dienstverlening** | Contracten en contractregels die klantbreed, collectiefbreed of expliciet op dit object gelden. | `CustomerContract`, `CustomerContractLine`, `CustomerContractRate` | Read-only context en deeplink naar Commercieel; geen tarieven kopiëren naar het object. |
| **Historie** | Append-only wijzigingen, notities, publicaties en systeemacties met objectscope. | `CustomerEvent.object_id`, aangevuld met relevante auditbronnen | Tijdlijn; gebeurtenissen worden niet overschreven of verwijderd. |
| **Beheer** | Lifecycle, archiveren/herstellen, mobiele zichtbaarheid en gecontroleerde beheeracties. | `SurveillanceObject` | Geen gewone hard-delete. Archiveren vereist reden; herstel is een expliciete overgang. |

De stabiele URL-keys zijn achtereenvolgens `overview`, `details`, `contacts`,
`instructions`, `planning`, `floorplans`, `reports`, `documents`, `services`,
`history` en `manage`.

Een tab mag read-only zijn als de gegevens betrouwbaar en geautoriseerd kunnen
worden gelezen. Mutatieknoppen blijven verborgen totdat een server-side
workflow alle scope-, versie-, idempotency- en auditcontroles uitvoert. Een lege
decoratieve tab zonder werkende bron wordt niet getoond.

### URL- en LOQ-gedrag

- De actieve tab staat in `tab`; subtabel/filter in `view`; geselecteerde rij in
  `row`. Vernieuwen en browser terug/vooruit behouden de werkcontext.
- Een onbekende tab valt voorspelbaar terug op `overview` en herschrijft de URL.
- Desktop gebruikt een vaste linkerkolom met dossiernavigatie. Tablet en mobiel
  gebruiken dezelfde volgorde in een horizontaal scrollbare tabbalk.
- Elke tab laadt alleen zijn eigen zwaardere datasets. Tabellen worden
  server-side pagineerbaar en sorteerbaar; zoeken en filters blijven in de URL.
- Een tabelrij is volledig klikbaar, toetsenbordbedienbaar en opent een
  rijzijpaneel of echte deeplink. Op mobiel wordt dezelfde rij een compacte
  kaart, zonder functionele reductie.
- Loading, ontbrekend object, geen toegang, queryfout, leeg dossier, lege
  zoekresultaten en gearchiveerd object zijn afzonderlijke toestanden.
- Een ongeldig of nog niet geladen `id` mag nooit stil de algemene objectenlijst
  tonen; de gebruiker krijgt een concrete laad- of fouttoestand.
- De vormgeving blijft compact: dunne borders, beperkte schaduw, rustige
  typografie, geen concurrerende dashboardtegels en geen herhaling van dezelfde
  klant- of adresgegevens in iedere tab.

## Mapping op het huidige LOQ-datamodel

| Huidige entiteit | Gebruik op de objectkaart | Belangrijke grens |
| --- | --- | --- |
| `SurveillanceObject` | Identiteit, locatie, status, regio, kaartinstellingen, planningdefaults en huidige compatibiliteitsinstructies. | Geen verzamelbak voor contacten, contracten, checkpoints, installaties, sleutels of historie. |
| `Customer` | Naam en deeplink van de juridische/commerciële eigenaar. | Legacy contactvelden zijn niet de objectcontactscope. |
| `CustomerContact` | Persoonlijke identiteit en functie. | Geen e-mail/telefoon of objectbevoegdheid in hetzelfde record. |
| `CustomerContactPoint` | E-mail, telefoon, voorkeur, verificatie en doeleinden. | Contactkanaal is niet hetzelfde als contactrol. |
| `CustomerContactRole` | Operationele, emergency-, warning-, planning- of rapportrol; `object_ids=[]` betekent klantbreed. | Portaalmembership en portaalrechten blijven afzonderlijk. |
| `Collectief` | Groepering waarin het object voorkomt en bron voor relevante collectieftaken. | Een collectief is geen fysieke objectidentiteit en geen klant. |
| `Task` | Herhaalpatroon, tijdvenster, dienstcontext en directe/collectieve objectscope. | Een taak is nog geen concrete uitvoering. |
| `PlanningShift` | Gepubliceerde of te publiceren inzet met objectscope en snapshots. | Planningstatus is geen objectstatus. |
| `TaskExecution` | Uitvoering, tijden, bewijs, contract-/tariefsnapshot en financiële review. | Objectwijzigingen herschrijven historische snapshots niet. |
| `ObjectFloorPlan` | Revisies, huidige versie, 2D/3D-bronnen en annotaties. | Ruwe bestands-URL's zijn opslagdetails en geen portaal-API. |
| `MobileReport` | Intern mobiel rapport met object-, taak- en routecontext. | `submitted`/`synced` betekent niet beoordeeld of klantgepubliceerd. |
| `ManagedFile` | Privé objectdocument met categorie, classificatie, versie, geldigheid en retentie. | `portal_visible` alleen is onvoldoende; publicatie gebruikt een veilige snapshot. |
| `CustomerPortalPublication` | Immutable, allowlisted klantversie van rapport, planning of document met objectscope. | Portal leest nooit rechtstreeks uit interne object-, rapport- of bestandsrecords. |
| `CustomerContract` | Commerciële overeenkomst van de klantrelatie. | Contractstatus bepaalt niet automatisch objectstatus. |
| `CustomerContractLine` | Dienstverlening met `customer`, `collective` of `object` scope en geldigheidsperiode. | Alleen een geldige, actieve regel mag als dienstverlening gelden. |
| `CustomerContractRate` | Periodegebonden tarief bij contractregel. | Tarief wordt niet als veranderlijk `price`-veld op het object opgeslagen. |
| `CustomerEvent` | Append-only objecttijdlijn via `customer_id` plus `object_id`. | Auditpayloads zijn intern tenzij een aparte publicatie is gemaakt. |
| `MobileAuditLog` | Mobiele uitvoerings- en toegangscontext per object/taak/route. | Geen vervanging voor de zakelijke objecttijdlijn. |
| `ManagedFileAccessLog` | Audit van objectbestandsacties. | Bestandsinzage en objectwijziging zijn verschillende events. |

## Toekomstige modules: pas conditioneel activeren

De referenties tonen waardevolle modules waarvoor het huidige datamodel nog
geen veilige volledige lifecycle biedt. Deze modules verschijnen pas als de
genoemde entiteiten, backendmutaties, rechten en audit zijn gerealiseerd.

| Toekomstige module | Benodigde kernentiteiten | Minimale veiligheids-/procesregel |
| --- | --- | --- |
| **Versieerbare postorders** | `ObjectInstruction`, `ObjectInstructionVersion`, `InstructionAudience`, `InstructionAcknowledgement` | Publicatie maakt een immutable versie; wijziging maakt een opvolger; erkenning bewaart gebruiker, context en tijdstip. |
| **Alarminstallaties en PAC** | `ObjectAlarmInstallation`, `ObjectAlarmCredential`, `ObjectMonitoringAssignment`, `ObjectInstallationEvent` | Codes versleuteld/vault-backed; step-up auth, doelgebonden toegang en read-audit; geldigheid en verificatie apart. |
| **Sleutels en middelen** | `ObjectAsset`, `KeyRing`, `AssetAuthorization`, `AssetCustodyEvent`, optioneel `AssetReservation` | Huidige houder afleiden uit append-only uitgifte/retour; geen vrij wijzigbaar holderveld; verwachte en feitelijke retour apart. |
| **Checkpoints en rondes** | `ObjectSection`, `CheckpointDefinition`, `CheckpointVersion`, `TourDefinition`, `TourVersion`, `CheckpointObservation` | Scanmethode en bewijs expliciet; handmatige fallback vereist reden en audit; definitie en observatie nooit samenvoegen. |
| **Escalatie en waarschuwingsadressen** | `ObjectEscalationPlan`, `ObjectEscalationStep`, `EscalationAttempt` | Geordende stappen, geldigheidsvenster, niet-bellenregels, uitkomst en acknowledge als afzonderlijke events. |
| **Installaties en leveranciers** | `ObjectInstallation`, `ObjectRelationAssignment`, `InstallationMaintenanceEvent` | Installatie, onderhoud, externe relatie en geheime bediening blijven gescheiden. |
| **Objectlogboek en incidenten** | `ObjectLogEntry`, `Incident`, `IncidentEvent`, `IncidentPublication` | Operationeel log is append-only; extern bericht is een gereviewde publicatie, niet hetzelfde record. |
| **Medewerkerrestricties** | `ObjectPersonnelPolicy`, `ObjectPersonnelAssignment`, `ObjectPersonnelRestriction` | Toestaan, uitsluiten en vereiste kwalificaties met geldigheid en verklaarde override; nooit alleen een naam-array op het object. |
| **Rapportprofielen en ontvangers** | `ObjectReportProfile`, `ReportTemplateAssignment`, `ReportRecipientAssignment` | Template, ontvangersrol, verzendmoment, review en publicatie zijn afzonderlijk. |
| **Bezoekers en itemuitgifte** | `VisitorVisit`, `ObjectIssuedItem`, `IssuedItemCustodyEvent` | Dataminimalisatie, retentie en uitgifte/retouraudit; geen vrije onbeperkte bezoekershistorie. |

Feature flags kunnen deze modules daarnaast per BV en diensttype activeren. De
afwezigheid van een module betekent geen impliciete toestemming of
functionaliteit.

## Gevoelige informatie, versiebeheer en publicatie

### Classificatie en toegang

- Algemene identiteit (naam, objectcode, veilig adres) mag in interne tabellen.
- Operationele instructies zijn alleen zichtbaar voor bevoegde interne rollen en
  medewerkers met actuele object-/dienstcontext.
- Alarmcodes, kluiscodes, sleutelgegevens en vergelijkbare geheimen vragen
  step-up authenticatie, een concrete reden/context en een read-audit.
- Mobiele offline data wordt versleuteld, heeft een beperkte geldigheid en wordt
  na einde van de bevoegde dienst verwijderd of ontoegankelijk gemaakt.
- Bestanden blijven privé. Een download loopt na autorisatie via een korte signed
  URL; ruwe `file_url`, `file_uri`, storagepaden en encryptiesleutelmetadata
  worden niet aan portal of onbevoegde clients geleverd.

### Versies en snapshots

- Een gepubliceerde instructie, plattegrond, planning of klantpublicatie wordt
  niet overschreven. Een correctie maakt een nieuwe versie met verwijzing naar
  de vervangen versie.
- Een "huidige versie" is een expliciete projectie. Oude versies blijven
  beschikbaar voor audit en historische uitvoeringen.
- `TaskExecution` bewaart de relevante klant-, contract- en tariefcontext van het
  uitvoeringsmoment. Latere object- of contractwijzigingen wijzigen deze
  historie niet.
- Alleen een expliciete `CustomerPortalPublication` met status `published`,
  juiste klant- en objectscope en een allowlisted `safe_payload` is zichtbaar in
  het klantportaal.
- GPS/EXIF, medewerker-ID's, interne notities, alarmcodes, sleutelinformatie en
  ruwe bestands-URL's worden nooit in een portalsnapshot opgenomen.
- Intrekken maakt de bestaande publicatie niet onzichtbaar in de audit; het
  voegt een verklaarde statusovergang of opvolgende publicatie toe.

## Mutatie- en lifecyclebeleid

- Iedere objectmutatie loopt server-side en controleert persona, BV/klant,
  objectscope en actie vóór de eerste gevoelige datalezing.
- `idempotency_key` voorkomt dubbele effecten; `expected_version` voorkomt dat
  de laatste schrijver ongemerkt een tussentijdse wijziging overschrijft.
- Gevoelige wijzigingen schrijven altijd een append-only `CustomerEvent` met
  objectscope, actor, resultaat en verklaarde reden waar nodig.
- Archiveren is de normale eindactie. Het bewaart contract-, uitvoerings-,
  rapport-, bestands-, publicatie- en audithistorie.
- Hard verwijderen kan alleen voor een aantoonbaar leeg concept zonder taken,
  planning, uitvoeringen, contractregels, documenten, publicaties, contacten of
  events en uitsluitend via een gecontroleerde serveractie.
- De statusovergang archive/restore wordt niet via een generieke directe
  Base44-entitymutatie uitgevoerd.
- Een gearchiveerd object is duidelijk read-only; herstel is een expliciete,
  geautoriseerde actie en maakt readiness niet automatisch groen.

## Acceptatiecriteria

### Navigatie en vormgeving

- `/Objects?id={id}&tab={tab}` opent na refresh dezelfde klant, hetzelfde object
  en dezelfde tab; terug/vooruit werkt zonder lokale-stateverlies.
- Desktop toont verticale dossiernavigatie links; tablet/mobiel toont een
  horizontaal scrollbare tabbalk met dezelfde volgorde en functionaliteit.
- Profielkop en tabcontent volgen aantoonbaar de LOQ-stijl van Personeel,
  Bedrijfsprofiel en Klant: compacte ruimte, dunne borders en één primaire actie.
- Alle tabelrijen zijn met muis en toetsenbord te openen; mobiele kaarten bieden
  dezelfde gegevens en acties.
- Loading, leeg, geen zoekresultaat, fout, geen toegang, ontbrekend object en
  gearchiveerd zijn afzonderlijk getest.

### Domein en data

- De objectkaart toont de klantrelatie, maar wijzigt nooit klantidentiteit,
  contract of tarief als bijeffect van een objectwijziging.
- Klantbrede contacten en expliciet aan het object gescopeerde contacten zijn
  zichtbaar; contacten van andere objecten of klanten niet.
- Directe taken en relevante collectieftaken verschijnen zonder duplicaten;
  uitvoeringen blijven een aparte tabel met eigen status.
- Wijziging van naam, adres, klant of contract herschrijft geen historische
  `TaskExecution`, publicatie of audit-event.
- Readiness toont concrete ontbrekende onderdelen en is niet gelijk aan
  `SurveillanceObject.status`.
- Een concept met ongeverifieerde locatie kan niet ongemerkt als betrouwbare
  mobiele kaartlocatie of operationeel gereed worden behandeld.

### Beveiliging en publicatie

- Geen algemene lijst-, overzichts- of portalpayload bevat alarmcode,
  sleutelinformatie, interne incidentnotitie, GPS/EXIF, medewerker-ID of ruwe
  bestands-URL.
- Een gebruiker zonder juiste klant-/objectscope kan het object niet ophalen via
  UI, geraden ID, directe SDK-call, function-call of bestandslink.
- Uploaden van een document, indienen van een rapport of publiceren van een
  planning maakt dit nooit automatisch klantzichtbaar.
- Alleen een expliciet gepubliceerde veilige versie is portalzichtbaar;
  `draft`, `review`, `withdrawn` en `superseded` zijn niet als actuele
  klantpublicatie opvraagbaar.
- Gelijktijdige updates met een verouderde `expected_version` worden verklaard
  geweigerd; een retry met dezelfde idempotency key herhaalt het effect niet.
- Archiveren bewaart alle relaties en audit; gewone UI-acties voeren geen
  hard-delete uit.

### Gefaseerde oplevering

1. Bouw eerst de URL-gestuurde shell, profielkop, overzicht en backend-gereed
   zijnde read-only tabellen.
2. Voeg veilige objectbasis-, instructie- en lifecyclemutaties toe met
   concurrency en audit.
3. Activeer toekomstige modules alleen per complete verticale slice: entiteiten,
   rechten, backend, audit, mobiel contract, tests en eventuele portalpublicatie.
4. Verifieer per fase desktop, tablet en mobiel, plus directe API- en
   cross-customer isolatietests.

Dit besluit voorkomt dat de eerste objectkaart te leeg blijft, maar ook dat LOQ
gevoelige operationele processen nabootst met onveilige losse tekstvelden. Het
dossier kan nu bruikbaar groeien terwijl de gespecialiseerde modules later met
hun juiste lifecycle worden toegevoegd.
