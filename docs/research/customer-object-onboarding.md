# Klantobjecten: onderzoek en onboardingbesluit

Onderzoeksdatum: 31 juli 2026

## Besluit

Een klant is de juridische en commerciële relatie. Een object is de fysieke
operationele locatie. De objectwizard in het klantdossier maakt daarom alleen
een klein `concept` aan met:

- klantrelatie (vast vanuit het geopende dossier);
- herkenbare objectnaam;
- objecttype;
- adres en, wanneer gevonden, PDOK-coördinaten en BAG-identiteit;

De objectcode wordt altijd server-side gegenereerd. Regio, alternatieve codes
en andere classificaties worden later op de objectpagina aangevuld.

Alle verdere gegevens worden pas na aanmaken onder de tabs van de objectpagina
ingericht. Zo heeft ieder object eerst een stabiel ID en kunnen gevoelige,
versieerbare en één-op-veelgegevens een eigen lifecycle, autorisatie en audit
krijgen.

## Eerdere LOQ-referenties

De bestaande workspace-onderzoeken zijn opnieuw gecontroleerd:

- `Reference/SequriX/README.md`: objectnaam/code, regio, adres en GPS vormen de
  basis. Sleutels, installaties, checkpoints, waarschuwingsadressen,
  documenten, ontvangers en meldingen zijn afzonderlijke objectonderdelen.
- `Reference/Secure-it/README.md`: klant/objectinstructies, documenten,
  planning, restricties en politieaanmeldingen hebben elk een eigen proces en
  zichtbaarheid.
- `Reference/Secusoft/README.md`: eerst opdrachtgever, daarna een minimale
  opdracht/werklocatie; standaarddiensten, instructies en planning volgen in de
  verdere inrichting.
- `Reference/WebappLandscape/FUNCTION-MATRIX.md` en
  `Reference/WebappLandscape/deep-dives/02-security-operations.md`: postorders,
  checkpoints, bewijs, rapportreview en klantpublicatie mogen niet als simpele
  velden op een object worden samengevoegd.

## Actuele primaire bronnen

- [Secure-IT CRM](https://www.secure-it.nl/hoe-werkt-het-/crm/): meerdere
  objecten per klant; documenten, installaties, instructies, restricties,
  politieaanmeldingen, scanpunten, sleutels, waarschuwingsadressen en zones zijn
  objectgebonden vervolgmodules.
- [SequriX objectbeveiliging](https://www.sequrix.com/nl/product/objectbeveiliging/)
  en [alarmopvolging](https://www.sequrix.com/nl/product/alarmopvolging/): het
  object is de context voor uitvoering, terwijl codes en operationele
  informatie gericht worden afgeschermd.
- [Secusoft klantenportaal](https://www.secusoft.nl/klantenportaal-ptf1069):
  rechten en instructies worden per klantlogin en object/werklocatie ingericht.
- [TrackTik Creating Sites](https://support.tracktik.com/hc/en-us/articles/360059270314-Creating-Sites)
  en [Manage Sites](https://support.tracktik.com/hc/en-us/articles/1500000786682-Manage-Sites):
  identiteit en locatie worden eerst vastgelegd; geocodering, dispatch,
  planning en sitefuncties worden daarna beheerd.
- [TrackTik Guarding Suite](https://support.tracktik.com/hc/en-us/articles/35845546479255-Tracktik-Guarding-Suite-QuickLinks-Manual):
  postorders, checkpoints, tours, geofencing en rapportage zijn afzonderlijke
  siteconfiguraties.
- [GuardsPro post sites](https://support.guardspro.com/hc/en-us/articles/29334526380443-How-to-add-post-site-on-the-Back-Office-Dashboard):
  de eerste sitecreate gebruikt vooral klant, naam en adres; orders, documenten,
  taken, tours en rapportages volgen later.
- [Kadaster BAG](https://www.kadaster.nl/zakelijk/registraties/basisregistraties/bag):
  de Nederlandse basisregistratie voor officiële adressen en gebouwen.

## Bewust niet in de eerste wizard

- alarm-, schakel-, kluis- en toegangscodes;
- sleutels, sleutelbossen en sleutelhouders;
- PAC-, installatie- en meldkamergegevens;
- waarschuwingsadressen en escalatievolgorde;
- postorders, noodplannen en werkinstructies;
- documenten, plattegronden en publicatierechten;
- checkpoints, scanmiddelen, interne locaties en rondes;
- medewerkersrestricties en kwalificaties;
- contractregels, tarieven, taken en planning;
- rapportagetemplates, ontvangers en klantportaaltoegang.

## UX- en veiligheidsregels

- De objectcode wordt server-side uniek gemaakt wanneer de gebruiker niets
  invult.
- Een retry gebruikt dezelfde idempotency key en maakt nooit bewust een tweede
  object.
- Een vergelijkbare naam of hetzelfde adres vereist een expliciete
  duplicaatbevestiging.
- Een handmatig adres mag als concept worden bewaard, maar krijgt het
  aandachtspunt `Locatie controleren` en verschijnt niet op de mobiele kaart.
- Een nieuw object is altijd `concept`; activatie is een latere, expliciete
  beslissing.
- De tabel toont alleen veilige samenvattingsdata. Codes, sleutels en ruwe
  instructies verschijnen er nooit.
- Contractdiensten worden afgeleid uit contractregels en worden niet als
  waarheid op het fysieke object gekopieerd.
- De hele tabelrij is klikbaar en toetsenbordbedienbaar en opent de bestaande
  deeplink `/Objects?id={objectId}`.
