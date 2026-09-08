# Collectieven en gedeelde objecten — backoffice

## Doel en afbakening

Een collectief is een gezamenlijk gebied of gebouw met een eigen dossier, niet een tweede klantobject. Een object blijft het operationele dossier van een locatie. Een klant blijft een commerciële relatie. Deze release verbindt die begrippen zonder bestaande objecttaken, facturen, contractregels of toegangsrechten te herschrijven. De iPhone-app en `mobileApi` blijven ongewijzigd.

Voorbeeld: collectief **IR. van der Zeelaan** bevat het zelfstandige portiersobject, het klantobject Kruizinga en eventueel een onderliggend bedrijfsverzamelgebouw met eigen huurdersobjecten. IR. van der Zeelaan kan als beherende klant worden vastgelegd. Dat geeft geen toegang tot gegevens van Kruizinga. Als twee klanten juist samen voor het gehele object verantwoordelijk zijn, worden zij aan hetzelfde object gekoppeld; daarvoor is geen tweede huurdersobject nodig.

## Beschikbare werkwijzen

- **Collectieven** opent een doorzoekbare tabel met typen, beheerder en bovenliggend collectief. Elk collectief heeft dossieronderdelen, deelnemers, kaart en logboek. Een beheerder is optioneel. Een gebied zonder huisnummer krijgt een expliciet bevestigde kaartlocatie.
- **Objecten & deelnemers** koppelt bestaande klantobjecten aan één of meer collectieven, met begin-/einddatum en status. Een onderliggend collectief wordt apart getoond; indirecte deelnemers zijn herkenbaar. Cycli worden geweigerd.
- **Klanten & collectieven** in de objectkaart toont de bestaande hoofdklant en aanvullende verantwoordelijkheden: gezamenlijk verantwoordelijk, beheerder of opdrachtgever. Aanvullende klantdossiers tonen die objecten in een afzonderlijke lijst, niet in hun commerciële objectscope.
- **Kaart & terrein** behoudt overzicht, alleen bekijken en wijzigen. Een terreinregel aanwijzen of met het toetsenbord focussen markeert het betreffende vlak en brengt dit in beeld, zonder de selectie te wijzigen.
- Een nieuw gekozen gebouw dat bij een collectief hoort geeft een bevestigingsvoorstel om het object daarin onder te brengen. Een gebouw dat al bij een ander object hoort vereist bij een nieuwe gedeelde selectie een bevestigd bedrijfsverzamelgebouw. De alternatieve keuze voor gezamenlijke verantwoordelijkheid opent het bestaande object in een nieuw tabblad, zodat het kaartconcept behouden blijft.
- Vanuit de opgeslagen collectiefkaart biedt **Gebouw onderbrengen** een bestaand/nieuw klantobject of een bedrijfsverzamelgebouw. Een objectkoppeling voegt de gekozen opgeslagen bronselectie toe aan het object en behoudt diens overige gebouwen en terrein. Eerst opslaan is verplicht als de collectiefkaart nog een concept bevat.
- Dossieronderdelen bevatten getypeerde registraties voor taken, beveiligingsplan, modules, handboek, plattegrondlinks, waarschuwingsadressen, relaties, sleutels en installaties. Collectieftaken blijven **concept en niet-operationeel**. Bestaande oude collectieftaken blijven alleen-lezen zichtbaar; er worden geen planningstaken aangemaakt.

Een gebouw zonder BAG-koppeling blijft een expliciete gebruikersselectie. Er wordt geen Mapbox-contour of tijdelijke feature-id opgeslagen. De browser kan opgeslagen punten binnen hetzelfde zichtbare 3D-gebouw herkennen en om bevestiging vragen; nabijheid alleen bewijst geen gedeeld gebouw. Na bevestiging delen de betrokken selecties een canonieke gebouwkoppeling. Als de kaartbron geen eenduidige herkenning geeft, is expliciet koppelen via de dossiers nodig.

## Gegevens en API

`Collectief` krijgt een aparte optionele `manager_customer_id`, hiërarchie en eigen kaartvelden. Bestaande `customer_id` en `object_ids` blijven onaangetast als legacy/commerciële gegevens. Oude deelnemers worden zichtbaar gehouden, niet stilzwijgend commercieel gemigreerd.

Nieuwe entiteiten (alleen service-role CRUD, RLS gesloten):

| Entiteit | Verantwoordelijkheid |
| --- | --- |
| `CollectiveMembership` | Gedateerde deelname object–collectief |
| `ObjectCustomerResponsibility` | Gedateerde klantrol bij hetzelfde object |
| `PhysicalBuilding` | Canonieke BAG-identiteit of expliciete niet-BAG-selectie |
| `BuildingDossierLink` | Relatie tussen gebouw en object-/collectiefdossier |
| `CollectiveDossierRecord` | Getypeerde, niet-operationele dossierregistratie |
| `CollectiveMapGeometryRevision` | Afgeschermde historische geometrie |
| `CollectiveDossierEvent` | Veilige auditsamenvatting, actor en tijdstip |
| `CollectiveMutationReceipt` | Idempotency/herstel zonder ruwe dossierinhoud |

`customerPlatformApi/entry.ts` integreert `collectiveDossier.ts` en de bestaande kaartvalidatie. Nieuwe reads: `list_collective_dossiers`, `get_collective_dossier`, `get_object_collective_context`, `list_building_associations`, `list_customer_shared_objects`. Nieuwe writes: `create_collective_dossier`, `update_collective_dossier`, `upsert_collective_membership`, `upsert_object_customer_responsibility`, `upsert_collective_dossier_record`, `confirm_building_association`.

De bestaande kaartacties accepteren óf `collective_id`, óf `customer_id` plus `object_id`; gemengde scope wordt geweigerd. Alle wijzigingen vereisen een beheerder, `expected_version` en `idempotency_key`. De kaartvalidatie blijft server-side, inclusief BAG-resolutie, afstand, geometrie en limieten. Adreswijzigingen behouden historische geometrie en zetten de configuratie op `needs_review`.

Reverse gebouwkoppelingen valideren de voorgenomen objectkaart vóór het aanmaken van relaties. Verzoeken gebruiken de bestaande globale mutatiereservering; geslaagde deelstappen worden bij een herhaling herkend. Dit is herstelbaar uitvoeren, geen algemene database-transactie. Na onzekere netwerkfouten moet hetzelfde verzoek met dezelfde sleutel worden herhaald, niet opnieuw als een andere handeling worden ingestuurd. Audit/herstel bevat alleen identifiers, aantallen en samenvattingen; geometrie staat uitsluitend in kaartrecords en private revisies.

De reservering gebruikt de bestaande eerste-klantcoördinator. Er hoeft geen beherende klant gekozen te zijn, maar in een volledig lege installatie moet eerst minstens één klantrecord bestaan. Geen fictieve beheerder of klant wordt aangemaakt.

## Bewust nog niet geactiveerd

Geen factuurverdeling, financiële percentages, automatische taaktoewijzing per klant, rapportagedeling, sleutelovererving, portaaltoegang, geofencing of mobiele collectiefweergave. De nieuwe klantrollen hebben expliciet `billing_enabled`, `report_access_enabled` en `key_access_enabled` op `false`. Een plattegrondregistratie is nog geen interactieve indeling in verhuureenheden. Deze vervolgstappen vereisen afzonderlijke bevoegdheden, geldigheidsdata, commerciële afspraken en tests.

Bestaande echte dossiers worden niet automatisch omgezet. Maak voor het beschreven bedrijventerrein het collectief aan, koppel het bestaande portiersobject en voeg de huurdersobjecten toe. Controleer daarna per gedeeld gebouw de expliciete groepering. Daarmee blijven de bestaande receptietaken intact.

## Base44-overdracht / uitvoerprompt

Neem uitsluitend de collectievenfeature uit deze GitHub-commit over. Synchroniseer alle bovengenoemde nieuwe entiteiten met gesloten RLS, de uitgebreide `Collectief`-entiteit, `customerPlatformApi/entry.ts` én de relatieve module `collectiveDossier.ts`. Gebruik de bijgewerkte pagina `src/pages/Collectief.jsx`, de componenten in `src/components/collectief`, de objectkaartintegratie en `CustomerSharedObjects`. Verbreed geen bestaande klant-/contractqueries en pas geen iOS- of mobiele API-bestanden aan. Bewaar oude taken, primaire klantkoppelingen en opgeslagen geometrie.

Controleer na publicatie in een testdossier:

1. Collectief met en zonder beheerder; gebied zonder huisnummer; onderliggend collectief; poging tot een cyclus wordt geweigerd.
2. Object aan meerdere collectieven, aanvullende klant en beëindigde/toekomstige deelname. Aanvullende klant verschijnt niet automatisch als factuurbetaler.
3. BAG-gebouw in een collectief selecteren vanuit een ander klantobject: bevestigingsvoorstel, annuleren zonder koppeling, bevestigen met behouden objectdata.
4. Twee afzonderlijke objecten op hetzelfde gebouw: nieuw of bestaand bedrijfsverzamelgebouw vereist. Test ook expliciet bevestigde niet-BAG-selecties.
5. Vanuit collectief een gebouw aan een object toevoegen, stale versie afwijzen, herhalen na netwerkfout zonder dubbele groep/leden/revisies.
6. Terreinhover/focus in kaartviewer én editor; bestaande dag/nacht-, camera- en terreinbewerkfuncties blijven werken.
7. Twee gelijktijdige kaartwijzigingen, PDOK-uitval en locatieherziening: geen stil overschrijven of verloren contouren.
8. Dossierregistraties en logboek controleren; geen ruwe coördinaten, sleutelinstructies of geometrie in audit/herstel. Niet-adminverzoeken blijven geweigerd.
9. Bestaande objectplanning, contractactivatie en prijsberekening blijven ongewijzigd; collectieftaken verschijnen niet in de operationele planning.

Een GitHub-push is geen bewijs van Base44-publicatie. Voer na synchronisatie **Publish** uit en controleer de bovenstaande routes met een ingelogde beheerder. Zonder die probe blijft de livewerking ongeverifieerd.
