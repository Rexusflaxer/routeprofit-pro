# Adreskeuze: volledige resultaten en exacte huisnummers

## Aanleiding en bevindingen — 9 september 2026

Bij het aanmaken van een klantobject verscheen **Dr. Jan van Breemenlaan 2,
8191LA Wapenveld** niet. `lookupService/search_address` haalde uitsluitend vijf
resultaten op via de vrije PDOK-geocoder. De gedeelde `AddressAutocomplete`
kapte antwoorden bovendien af op acht. De absolute keuzelijst stond binnen
`overflow-hidden`-panelen en kon daardoor worden afgesneden.

De openbare PDOK-controle bevestigde 75 adresvarianten bij dit huisnummer en
deze postcode. Nummer 2 zonder toevoeging bestaat met nummeraanduiding
`0246200000001915`, maar stond achteraan in de oude zoekvolgorde. Meer rijen
alleen is dus niet genoeg: exacte matches moeten vóór paginering voorrang
krijgen.

## Werking

- Gebruik de PDOK **suggest**-service voor autocomplete, met `fq=type:adres`.
  Geef adresdelen, BAG-identiteit en `centroide_ll` expliciet op via `fl`, zodat
  de bestaande selectie in één aanvraag de volledige kaartlocatie behoudt.
- Geef exacte matches extra gewicht via
  `qf=exacte_match^20 suggest^0.5 huisnummer^0.5 huisletter^0.5 huisnummertoevoeging^0.5`.
  Een expliciet ingevoerde toevoeging blijft onderdeel van de zoekopdracht;
  nummer 2 wordt niet als alternatief voor een gekozen 2b-2 opgeslagen.
- Toon twintig resultaten per pagina. `Meer adressen` voegt een volgende
  pagina toe. De server begrenst `limit` tot vijftig en `offset` tot 10.000;
  zoekopdrachten blijven maximaal 300 tekens. `score`, natuurlijke sortering,
  weergavenaam en id bepalen samen een stabiele volgorde.
- Render de keuzelijst via de bestaande niet-modale Radix-popover/portal,
  met begrensde hoogte en scrollen. Formulierpanelen mogen de lijst niet
  afsnijden. Pijltjestoetsen, Enter en Escape ondersteunen adreskeuze zonder muis.
  Wiel- en aanraakscroll blijven binnen de popover: een omringende dialoog mag
  de geportalde adreslijst niet als geblokkeerde achtergrond behandelen. De
  achtergrond van de dialoog blijft wel vergrendeld.
- Houd laden, geen resultaat en een storing uit elkaar. Verouderde antwoorden
  mogen na typen, selecteren of sluiten de oude keuzelijst niet heropenen.
- Adreszoeken in een gepinde Base44-preview gebruikt de actuele functions-client
  met dezelfde authenticatie. Andere lookupacties blijven ongewijzigd. Er wordt
  niet via een onbeveiligde entiteitroute naar adres-/klantdossiers geschreven.

Handmatig getypte tekst is nog steeds **ongeverifieerd**. De juiste kaartlocatie
komt uit een expliciet geselecteerd adres met geldige coördinaten. De wizard
blijft minimaal; er wordt geen testobject of fictief adres automatisch aangemaakt.

## Contract

`lookupService` behoudt actie `search_address` en alle bestaande suggestievelden.
De optionele requestvelden zijn `limit` en `offset`; aanvullend retourneert de
server `total`, `has_more` en `next_offset` naast `suggestions`. Afwijkende
PDOK-responsen en timeouts geven een veilige fout, geen fictieve lege lijst of
coördinaten op 0,0. Entiteiten, objectaanmaakrechten, iOS en `mobileApi` veranderen
niet.

## Verificatie en bronnen

Met de gewijzigde lokale handler en echte openbare PDOK-responsen is gecontroleerd:

- `Dr. Jan van Breemenlaan 2` → nummer 2 zonder toevoeging bovenaan;
- `8191LA 2` → hetzelfde BAG-adres bovenaan;
- het volledige adres inclusief postcode en Wapenveld → hetzelfde resultaat;
- alle 75 adressen bereikbaar in vier pagina's: 20, 20, 20 en 15, zonder dubbele
  BAG-adres-id's;
- aparte PDOK-probes voor `2b-2` en `2b-10` behouden de gevraagde toevoeging.

Bron: [officiële PDOK Locatieserver-documentatie](https://github.com/PDOK/locatieserver/wiki/API-Locatieserver),
met de suggest-service, `fl`, `qf`, `rows` en `start`. De providerprobes bewijzen
de zoekuitkomst, niet dat de Base44-app al is gepubliceerd.

Lokale verificatie: 12 gerichte testsuites, 232 tests geslaagd; gerichte ESLint
en de webbuild geslaagd. De tests gebruiken ook echte Dialog/Popover-primitives
om selectie, wiel- en aanraakscroll binnen een modaal formulier te controleren.
De build meldde de ontbrekende lokale `VITE_BASE44_APP_ID`; dit is een
compilecontrole, geen ingelogde runtimecontrole. Er was geen aangesloten browser
beschikbaar voor visuele controle, Editor Publish of een ingelogde live-herhaling.

## Nederlandse Base44-overdracht

Synchroniseer de wijziging in `base44/functions/lookupService/entry.ts` en
`src/components/ui-custom/AddressAutocomplete.jsx`, inclusief de gerichte tests
`lookupAddressBackend.test.js` en `AddressAutocomplete.test.jsx`. Publiceer de
frontend én lookupfunctie samen. Behoud de overige KvK-, kenteken- en
IBAN/BIC-handlers, alle klantkoppelingen en de bestaande geocodingstatusregels.

Controleer na publicatie met een ingelogde gebruiker:

1. Open Nieuw object in het klantdossier. Typ het genoemde adres zonder
   toevoeging, selecteer nummer 2 en controleer de adresdelen en kaartlocatie.
2. Scroll met muis/trackpad en laad vervolgpagina's; de lijst blijft binnen het
   zichtbare scherm, ook onderaan een wizard of in een dialoog.
3. Selecteer een resultaat met toevoeging en daarna hetzelfde huisnummer zonder
   toevoeging. Er mag geen oude toevoeging of oude kaartpositie achterblijven.
4. Gebruik pijltjestoetsen/Enter, sluit met Escape/Tab en test snel wisselende
   zoekopdrachten. Late antwoorden mogen geen oude selectie terugzetten.
5. Test een lege zoekuitkomst, een providerstoring en opnieuw proberen, ook bij
   het laden van een volgende pagina. Bestaande resultaten blijven behouden.
6. Controleer de gedeelde adresvelden in objectprofiel, collectief en klantformulier.
   Een losse handmatige tekst blijft ongeverifieerd; er wordt niets automatisch
   opgeslagen of op de kaart geactiveerd.
