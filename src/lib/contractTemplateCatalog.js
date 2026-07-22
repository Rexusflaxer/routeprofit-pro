export const CAO_PARTICULIERE_BEVEILIGING_KEY = "cao_particuliere_beveiliging";

export const PB_FULLTIME_STANDARD_TEMPLATE_ID = "pb_fulltime_standard_v1";
export const PB_PARTTIME_STANDARD_TEMPLATE_ID = "pb_parttime_fixed_standard_v1";
export const PB_PARTTIME_GROWTH_STANDARD_TEMPLATE_ID = "pb_parttime_growth_standard_v1";
export const PB_MIN_MAX_STANDARD_TEMPLATE_ID = "pb_min_max_standard_v1";
export const PB_ZERO_HOURS_STANDARD_TEMPLATE_ID = "pb_zero_hours_standard_v1";
export const PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE_ID = "pb_article_14_internship_standard_v1";
export const PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE_ID = "pb_bbl_employment_standard_v1";

const PB_FULLTIME_CONTRACT_MODEL_ALIASES = new Set([
  "fulltime",
  "fulltime_employment",
  "fulltime_fixed",
  "fulltime_indefinite",
]);

const PB_PARTTIME_CONTRACT_MODEL_ALIASES = new Set([
  "parttime",
  "parttime_employment",
  "parttime_fixed",
  "parttime_indefinite",
]);

const PB_PARTTIME_GROWTH_CONTRACT_MODEL_ALIASES = new Set([
  "parttime_growth",
  "parttime_growth_employment",
]);

const PB_MIN_MAX_CONTRACT_MODEL_ALIASES = new Set([
  "min_max",
  "min_max_employment",
  "min_max_fixed",
  "min_max_indefinite",
]);

const PB_ZERO_HOURS_CONTRACT_MODEL_ALIASES = new Set([
  "zero_hours",
  "zero_hours_employment",
  "call_employment",
  "call_fixed",
  "call_indefinite",
  "call_agreement",
]);

const PB_ARTICLE_14_INTERNSHIP_CONTRACT_MODEL_ALIASES = new Set([
  "internship",
  "internship_fixed",
  "article_14_internship",
]);

const PB_BBL_EMPLOYMENT_CONTRACT_MODEL_ALIASES = new Set([
  "bbl",
  "bbl_employment",
  "bbl_fixed",
]);

export const PB_CAO_FUNCTION_GROUP_OPTIONS = [
  { value: "objectbeveiliger_receptionist", label: "Objectbeveiliger / receptionist" },
  { value: "mobiel_surveillant", label: "Mobiel surveillant" },
  { value: "winkelsurveillant", label: "Winkelsurveillant" },
  { value: "brandwacht", label: "Brandwacht" },
  { value: "geld_waardetransporteur", label: "Geld- en waardetransporteur" },
  { value: "centralist", label: "Centralist" },
  { value: "non_security_staff", label: "Niet-operationele functie" },
];

export const PB_CAO_FUNCTION_LEVEL_OPTIONS = [
  { value: "aspirant", label: "Aspirant" },
  { value: "a", label: "Functie A" },
  { value: "b", label: "Functie B" },
  { value: "c", label: "Functie C" },
  { value: "d", label: "Functie D" },
  { value: "e", label: "Functie E" },
  { value: "leidinggevend", label: "Afwijkend leidinggevend (controleren)" },
  { value: "not_applicable", label: "Niet van toepassing" },
];

const PB_SALARY_SCALE_BY_FUNCTION_LEVEL = {
  aspirant: 2,
  a: 3,
  b: 4,
  c: 5,
  d: 6,
  e: 7,
};

export function pbSalaryScaleForFunctionLevel(functionLevel) {
  return PB_SALARY_SCALE_BY_FUNCTION_LEVEL[functionLevel] || null;
}

const PB_FUNCTION_GROUP_BY_FUNCTION = {
  objectbeveiliger: "objectbeveiliger_receptionist",
  receptionist: "objectbeveiliger_receptionist",
  receptie: "objectbeveiliger_receptionist",
  surveillant: "objectbeveiliger_receptionist",
  bedrijfssurveillant: "objectbeveiliger_receptionist",
  mobiel_surveillant: "mobiel_surveillant",
  alarmopvolging: "mobiel_surveillant",
  winkelsurveillant: "winkelsurveillant",
  brandwacht: "brandwacht",
  geld_waardetransporteur: "geld_waardetransporteur",
  waardetransport_chauffeur: "geld_waardetransporteur",
  waardetransport_bijrijder: "geld_waardetransporteur",
  centralist: "centralist",
  centralist_pac: "centralist",
  centralist_vtc: "centralist",
  videosurveillant: "centralist",
  toezichthouder: "centralist",
  evenementenbeveiliger: "objectbeveiliger_receptionist",
  horecabeveiliger: "objectbeveiliger_receptionist",
  host: "non_security_staff",
  binnendienst: "non_security_staff",
  planner: "non_security_staff",
  roostermaker: "non_security_staff",
  operationeel_coordinator: "non_security_staff",
  operationeel_manager: "non_security_staff",
  administratief_medewerker: "non_security_staff",
  financieel_administratief: "non_security_staff",
  salarisadministrateur: "non_security_staff",
  hr_medewerker: "non_security_staff",
  hr_manager: "non_security_staff",
  accountmanager: "non_security_staff",
  sales_manager: "non_security_staff",
  kwaliteitsmanager: "non_security_staff",
  compliance_manager: "non_security_staff",
  directie: "non_security_staff",
};

export function suggestPbCaoFunctionGroup(functionValue) {
  return PB_FUNCTION_GROUP_BY_FUNCTION[functionValue] || "";
}

export function pbFunctionGroupsForFunctions(functionValues = []) {
  return [...new Set((functionValues || []).map(suggestPbCaoFunctionGroup).filter(Boolean))];
}

export const PB_FULLTIME_STANDARD_TEMPLATE_BODY = [
  "ARBEIDSOVEREENKOMST",
  "Fulltime dienstverband - CAO Particuliere Beveiliging",
  "",
  "Partijen",
  "Werkgever: {$bedrijf_statutaire_naam}, gevestigd aan {$bedrijf_adres_volledig}, ingeschreven bij de Kamer van Koophandel onder nummer {$bedrijf_kvk}, rechtsgeldig vertegenwoordigd door {$bedrijf_vertegenwoordiger_naam} in de functie van {$bedrijf_vertegenwoordiger_functie}, hierna: werkgever;",
  "",
  "Werknemer: {$medewerker_juridische_volledige_naam}, geboren op {$medewerker_geboortedatum} te {$medewerker_geboorteplaats}, wonende aan {$medewerker_adres_volledig}, hierna: werknemer;",
  "",
  "Werkgever en werknemer worden hierna gezamenlijk aangeduid als partijen en komen het volgende overeen.",
  "",
  "Artikel 1 - Indiensttreding en duur",
  "1.1 Werknemer treedt met ingang van {$contract_startdatum} bij werkgever in dienst.",
  "1.2 {$contract_duur_bepaling}",
  "1.3 {$contract_aanzegtermijn_bepaling}",
  "",
  "Artikel 2 - Toepasselijke cao",
  "2.1 Op deze arbeidsovereenkomst zijn de huidige en toekomstige bepalingen van de {$cao_naam} van toepassing, voor zover werkgever en werknemer onder de werkingssfeer daarvan vallen.",
  "2.2 Dwingend recht en bepalingen uit de toepasselijke cao waarvan niet ten nadele van werknemer mag worden afgeweken, gaan voor op strijdige bepalingen in deze arbeidsovereenkomst.",
  "2.3 Voor een niet-operationele functie blijven de uitzonderingen uit artikel 3 van de {$cao_naam} van toepassing. De gekozen functie- en loonindeling bepaalt daarom welke cao-onderdelen voor werknemer gelden.",
  "",
  "Artikel 3 - Proeftijd",
  "3.1 {$contract_proeftijd_bepaling}",
  "",
  "Artikel 4 - Functie, werkzaamheden en werkplek",
  "4.1 De overeengekomen inzetbare functies zijn: {$functie_lijst}.",
  "4.2 {$contract_functie_indeling_bepaling}",
  "4.3 Werknemer verricht de werkzaamheden die bij de overeengekomen functie of functies horen en andere redelijke werkzaamheden die passen bij opleiding, ervaring, bevoegdheden, vakbekwaamheid en cao-indeling.",
  "4.4 Werknemer wordt niet ingezet voor werkzaamheden waarvoor de vereiste toestemming, legitimatie, opleiding, certificering of wettelijke bevoegdheid ontbreekt.",
  "4.5 {$contract_werkplek_bepaling}",
  "4.6 Als werknemer structureel andere werkzaamheden gaat verrichten, leggen partijen de gewijzigde functie en eventuele gevolgen voor de cao-indeling schriftelijk vast.",
  "",
  "Artikel 5 - Arbeidsduur, rooster en werktijden",
  "5.1 {$contract_arbeidsduur_bepaling}",
  "5.2 Werkgever stelt het rooster vast met inachtneming van de {$cao_naam}, de Arbeidstijdenwet en de daarin opgenomen regels over aankondiging, wijziging, rust en vrije tijd.",
  "5.3 Werknemer kan, voor zover passend bij de functie en binnen de toepasselijke regels, worden ingeroosterd op wisselende dagen en tijden, waaronder avond-, nacht-, weekend- en feestdagdiensten.",
  "5.4 Een wijziging van de structurele arbeidsduur wordt schriftelijk vastgelegd.",
  "",
  "Artikel 6 - Beloning",
  "6.1 {$contract_loonindeling_bepaling}",
  "6.2 {$contract_basisuurloon_bepaling}",
  "6.3 {$contract_loonperiode_bepaling}",
  "6.4 Toeslagen voor bijzondere uren, feestdagen, overwerk, functiewaarneming en overige vergoedingen worden toegekend volgens de {$cao_naam} en de feitelijke werkzaamheden.",
  "6.5 Wijzigingen in loon, schaal, periodiek of basisuurloon worden toegepast volgens de geldende cao en loontabel en blijken uit de loonstrook of een afzonderlijke schriftelijke of elektronische mededeling.",
  "",
  "Artikel 7 - Vakantie, vakantiebijslag en verlof",
  "7.1 {$contract_vakantie_bepaling}",
  "7.2 Werknemer ontvangt 8% vakantiebijslag over het daarvoor geldende bruto jaarloon. Opbouw en uitbetaling vinden plaats volgens de {$cao_naam} en de wet.",
  "7.3 Opname, verval en uitbetaling van vakantie-uren en overige verlofrechten worden toegepast volgens de wet en de {$cao_naam}.",
  "",
  "Artikel 8 - Pensioen en verzekering",
  "8.1 Werknemer neemt deel aan de regeling van {$pensioenregeling_naam}, voor zover de verplichtstelling en het pensioenreglement op werknemer van toepassing zijn.",
  "8.2 Werkgever houdt de werknemersbijdrage in voor zover dit volgens het pensioenreglement, de wet en de {$cao_naam} is toegestaan.",
  "8.3 Werkgever draagt zorg voor de collectieve ongevallenverzekering die de {$cao_naam} voorschrijft.",
  "",
  "Artikel 9 - Ziekte en re-integratie",
  "9.1 Werknemer meldt arbeidsongeschiktheid tijdig volgens het geldende verzuimprotocol.",
  "9.2 Tijdens arbeidsongeschiktheid gelden de wettelijke regels, de {$cao_naam} en redelijke controle- en re-integratievoorschriften van werkgever.",
  "9.3 Loondoorbetaling en re-integratieverplichtingen worden vastgesteld volgens de wet en de {$cao_naam}.",
  "",
  "Artikel 10 - Wpbr-toestemming, legitimatie en vakbekwaamheid",
  "10.1 {$contract_wpbr_bepaling}",
  "10.2 Werknemer informeert werkgever direct over feiten of omstandigheden die de vereiste toestemming, betrouwbaarheid, legitimatie, vakbekwaamheid of inzetbaarheid kunnen beïnvloeden.",
  "10.3 {$contract_wpbr_gevolgen_bepaling}",
  "10.4 Werknemer staakt de betrokken werkzaamheden direct en levert het legitimatiebewijs en andere Wpbr-gebonden middelen op eerste verzoek bij werkgever in.",
  "",
  "Artikel 11 - Instructies, integriteit en veilige uitvoering",
  "11.1 Werknemer voert de werkzaamheden zorgvuldig, integer, betrouwbaar en professioneel uit en volgt redelijke bedrijfs-, veiligheids-, locatie- en objectinstructies op.",
  "11.2 Werknemer verricht geen werkzaamheden onder invloed van alcohol, drugs of andere middelen die een veilige en betrouwbare uitvoering kunnen beïnvloeden.",
  "11.3 Werknemer meldt incidenten, belangenconflicten en veiligheids- of integriteitsrisico's direct bij werkgever.",
  "",
  "Artikel 12 - Geheimhouding, privacy en informatiebeveiliging",
  "12.1 Werknemer houdt alle niet-openbare informatie geheim waarvan werknemer door het werk kennisneemt en waarvan de vertrouwelijke aard bekend is of redelijkerwijs duidelijk behoort te zijn.",
  "12.2 Daaronder valt in ieder geval bedrijfs-, klant-, personeels-, object-, alarm-, beeld-, transport-, onderzoeks- en systeeminformatie die werknemer via de functie, opdrachtgever, locatie of gebruikte systemen ontvangt.",
  "12.3 Werknemer gebruikt deze informatie uitsluitend voor het werk, deelt haar alleen met bevoegde personen die haar voor hun taak nodig hebben en gebruikt uitsluitend door werkgever goedgekeurde systemen en communicatiemiddelen.",
  "12.4 Werknemer meldt verlies, onbevoegde toegang, verkeerde verzending of een mogelijk datalek direct bij {$meldpunt_privacy_datalekken}.",
  "12.5 De geheimhoudingsplicht blijft na het einde van de arbeidsovereenkomst gelden zolang de informatie niet rechtmatig openbaar is geworden. Zij beperkt geen wettelijk toegestane melding bij een bevoegde instantie, vakbond, juridisch adviseur of meldpunt voor misstanden.",
  "",
  "Artikel 13 - Bedrijfsmiddelen",
  "13.1 Werknemer gebruikt verstrekte uniformen, legitimatiebewijzen, sleutels, passen, apparatuur, voertuigen, documenten, accounts en andere bedrijfsmiddelen zorgvuldig en volgens de instructies van werkgever.",
  "13.2 Verlies, diefstal, beschadiging of onbevoegd gebruik wordt direct gemeld.",
  "13.3 Werknemer geeft alle bedrijfsmiddelen op eerste verzoek en uiterlijk bij het einde van het dienstverband terug. Schade of kosten worden alleen verhaald voor zover wet en cao dit toelaten.",
  "",
  "Artikel 14 - Scholing",
  "14.1 Scholing die werkgever op grond van wet of cao verplicht moet aanbieden, wordt kosteloos aangeboden en geldt als arbeidstijd voor zover de wet of de {$cao_naam} dit voorschrijft.",
  "14.2 Voor een niet-verplichte opleiding kunnen partijen uitsluitend in een afzonderlijke, rechtsgeldige studiekostenovereenkomst aanvullende afspraken maken.",
  "",
  "Artikel 15 - Nevenwerkzaamheden",
  "15.1 Werknemer meldt nevenwerkzaamheden vooraf als deze kunnen leiden tot overtreding van arbeids- en rusttijden, een veiligheids- of integriteitsrisico, belangenverstrengeling, strijd met wettelijke voorschriften of risico voor vertrouwelijke informatie.",
  "15.2 Werkgever beperkt nevenwerkzaamheden alleen als daarvoor een objectieve reden bestaat en deelt die reden aan werknemer mee.",
  "",
  "Artikel 16 - Einde van de arbeidsovereenkomst",
  "16.1 {$contract_opzegtermijn_bepaling}",
  "16.2 De arbeidsovereenkomst eindigt van rechtswege op de dag waarop werknemer de AOW-gerechtigde leeftijd bereikt, tenzij partijen daarna rechtsgeldig voortzetten.",
  "16.3 Bij het einde van het dienstverband werkt werknemer mee aan een zorgvuldige overdracht en levert werknemer alle bedrijfsmiddelen en vertrouwelijke informatie in.",
  "",
  "Artikel 17 - Bedrijfsregelingen en slotbepalingen",
  "17.1 Bedrijfsregelingen en protocollen gelden alleen voor zover zij op werknemer van toepassing zijn en aan werknemer zijn verstrekt of toegankelijk zijn gemaakt. Wet, cao en deze arbeidsovereenkomst gaan voor bij strijdigheid.",
  "17.2 Wijzigingen van deze arbeidsovereenkomst worden schriftelijk of elektronisch aantoonbaar vastgelegd, tenzij wet of cao anders bepaalt.",
  "17.3 Als een bepaling nietig, vernietigbaar of niet afdwingbaar is, blijven de overige bepalingen gelden. Partijen vervangen de betrokken bepaling zo nodig door een rechtsgeldige bepaling die het doel zoveel mogelijk benadert.",
  "17.4 Op deze arbeidsovereenkomst is Nederlands recht van toepassing.",
  "",
  "Ondertekening",
  "Aldus overeengekomen en ondertekend te {$contract_ondertekeningsplaats} op {$contract_ondertekeningsdatum}.",
  "",
  "Voor werkgever:",
  "{$bedrijf_vertegenwoordiger_naam}",
  "{$bedrijf_vertegenwoordiger_functie}",
  "Handtekening: ______________________________",
  "",
  "Werknemer:",
  "{$medewerker_juridische_volledige_naam}",
  "Handtekening: ______________________________",
].join("\n");

export const PB_PARTTIME_STANDARD_TEMPLATE_BODY = PB_FULLTIME_STANDARD_TEMPLATE_BODY
  .replace(
    "Fulltime dienstverband - CAO Particuliere Beveiliging",
    "Parttime dienstverband - CAO Particuliere Beveiliging",
  )
  .replace(
    "Artikel 5 - Arbeidsduur, rooster en werktijden",
    "Artikel 5 - Arbeidsduur, vast parttimemodel, rooster en werktijden",
  );

export const PB_PARTTIME_GROWTH_STANDARD_TEMPLATE_BODY = PB_FULLTIME_STANDARD_TEMPLATE_BODY
  .replace(
    "Fulltime dienstverband - CAO Particuliere Beveiliging",
    "Parttime groeimodel - CAO Particuliere Beveiliging",
  )
  .replace(
    "Artikel 5 - Arbeidsduur, rooster en werktijden",
    "Artikel 5 - Arbeidsduur, groeimodel, rooster en werktijden",
  );

export const PB_MIN_MAX_STANDARD_TEMPLATE_BODY = PB_FULLTIME_STANDARD_TEMPLATE_BODY
  .replace(
    "Fulltime dienstverband - CAO Particuliere Beveiliging",
    "Min-maxcontract - CAO Particuliere Beveiliging",
  )
  .replace(
    [
      "Artikel 5 - Arbeidsduur, rooster en werktijden",
      "5.1 {$contract_arbeidsduur_bepaling}",
      "5.2 Werkgever stelt het rooster vast met inachtneming van de {$cao_naam}, de Arbeidstijdenwet en de daarin opgenomen regels over aankondiging, wijziging, rust en vrije tijd.",
      "5.3 Werknemer kan, voor zover passend bij de functie en binnen de toepasselijke regels, worden ingeroosterd op wisselende dagen en tijden, waaronder avond-, nacht-, weekend- en feestdagdiensten.",
      "5.4 Een wijziging van de structurele arbeidsduur wordt schriftelijk vastgelegd.",
    ].join("\n"),
    [
      "Artikel 5 - Arbeidsduur, min-maxmodel en oproepen",
      "5.1 {$contract_arbeidsduur_bepaling}",
      "5.2 {$contract_oproepvoorwaarden_bepaling}",
      "5.3 Werkgever roept werknemer ten minste vier kalenderdagen voor aanvang schriftelijk of elektronisch op en vermeldt datum, begin- en eindtijd, locatie en werkzaamheden.",
      "5.4 Bij een oproep korter dan vier kalenderdagen voor aanvang is werknemer niet verplicht te werken. Werknemer kan een dergelijke oproep wel vrijwillig aanvaarden.",
      "5.5 Trekt werkgever de oproep binnen vier kalenderdagen voor aanvang geheel of gedeeltelijk in of wijzigt werkgever binnen die termijn de tijdstippen, dan behoudt werknemer het recht op loon over de oorspronkelijke oproep voor zover wet en cao dat bepalen.",
      "5.6 Per afzonderlijke oproep ontvangt werknemer ten minste drie uur loon, ook als minder dan drie uur is gewerkt, voor zover de wettelijke drie-urenregel van toepassing is.",
      "5.7 Na iedere periode van twaalf maanden als oproepkracht doet werkgever binnen de wettelijke termijn schriftelijk of elektronisch een aanbod voor een vaste arbeidsomvang op basis van de gemiddelde arbeidsomvang in de voorafgaande twaalf maanden. Bij afwijzing wordt na een volgende periode van twaalf maanden opnieuw een aanbod gedaan.",
      "5.8 Werknemer kan daarnaast volgens de {$cao_naam} schriftelijk verzoeken om aanpassing van de arbeidsduur wanneer sprake is van een regelmatig en structureel arbeidspatroon. Een wijziging ontstaat niet automatisch en wordt schriftelijk vastgelegd.",
    ].join("\n"),
  )
  .replace(
    [
      "Artikel 6 - Beloning",
      "6.1 {$contract_loonindeling_bepaling}",
      "6.2 {$contract_basisuurloon_bepaling}",
      "6.3 {$contract_loonperiode_bepaling}",
      "6.4 Toeslagen voor bijzondere uren, feestdagen, overwerk, functiewaarneming en overige vergoedingen worden toegekend volgens de {$cao_naam} en de feitelijke werkzaamheden.",
      "6.5 Wijzigingen in loon, schaal, periodiek of basisuurloon worden toegepast volgens de geldende cao en loontabel en blijken uit de loonstrook of een afzonderlijke schriftelijke of elektronische mededeling.",
    ].join("\n"),
    [
      "Artikel 6 - Beloning en toeslagen",
      "6.1 {$contract_loonindeling_bepaling}",
      "6.2 {$contract_basisuurloon_bepaling}",
      "6.3 {$contract_loonperiode_bepaling}",
      "6.4 Werkgever vermeldt op de loonstrook dat sprake is van een oproepovereenkomst en specificeert garantie-uren, aanvullende uren en toeslagen afzonderlijk.",
      "6.5 Uren boven de garantie-uren worden betaald volgens de {$cao_naam}. Uren boven 152 uur per loonperiode gelden als overuren; werknemer kan niet zonder instemming worden verplicht meer dan 144 uur per loonperiode te werken.",
      "6.6 Een oproepkracht ontvangt geen verschuivingstoeslag voor zover de {$cao_naam} dit bepaalt.",
      "6.7 Voor arbeid op een in de {$cao_naam} aangewezen feestdag ontvangt de oproepkracht een toeslag van 100% van het basisuurloon. Voor dezelfde uren worden geen looncomponenten gestapeld die de cao voor oproepkrachten uitsluit.",
      "6.8 Overige toeslagen en vergoedingen worden uitsluitend toegekend voor zover de {$cao_naam} en de feitelijke werkzaamheden daarop aanspraak geven.",
    ].join("\n"),
  )
  .replace(
    [
      "Artikel 7 - Vakantie, vakantiebijslag en verlof",
      "7.1 {$contract_vakantie_bepaling}",
      "7.2 Werknemer ontvangt 8% vakantiebijslag over het daarvoor geldende bruto jaarloon. Opbouw en uitbetaling vinden plaats volgens de {$cao_naam} en de wet.",
      "7.3 Opname, verval en uitbetaling van vakantie-uren en overige verlofrechten worden toegepast volgens de wet en de {$cao_naam}.",
    ].join("\n"),
    [
      "Artikel 7 - Vakantie, vakantiebijslag en verlof",
      "7.1 {$contract_vakantie_bepaling}",
    ].join("\n"),
  )
  .replace(
    "9.3 Loondoorbetaling en re-integratieverplichtingen worden vastgesteld volgens de wet en de {$cao_naam}.",
    "9.3 Loondoorbetaling en re-integratieverplichtingen worden vastgesteld volgens de wet en de {$cao_naam}. Bij een min-maxcontract wordt daarbij ten minste uitgegaan van de garantie-uren en de geldende wettelijke minimumwaarborgen.\n9.4 Voor reeds vastgestelde oproepen en een mogelijk structureel hogere gemiddelde arbeidsomvang wordt afzonderlijk beoordeeld welke loonaanspraak uit wet en cao voortvloeit.",
  );

export const PB_ZERO_HOURS_STANDARD_TEMPLATE_BODY = PB_FULLTIME_STANDARD_TEMPLATE_BODY
  .replace(
    "Fulltime dienstverband - CAO Particuliere Beveiliging",
    "Nulurencontract - CAO Particuliere Beveiliging",
  )
  .replace(
    [
      "Artikel 5 - Arbeidsduur, rooster en werktijden",
      "5.1 {$contract_arbeidsduur_bepaling}",
      "5.2 Werkgever stelt het rooster vast met inachtneming van de {$cao_naam}, de Arbeidstijdenwet en de daarin opgenomen regels over aankondiging, wijziging, rust en vrije tijd.",
      "5.3 Werknemer kan, voor zover passend bij de functie en binnen de toepasselijke regels, worden ingeroosterd op wisselende dagen en tijden, waaronder avond-, nacht-, weekend- en feestdagdiensten.",
      "5.4 Een wijziging van de structurele arbeidsduur wordt schriftelijk vastgelegd.",
    ].join("\n"),
    [
      "Artikel 5 - Nulurenovereenkomst, beschikbaarheid en oproepen",
      "5.1 {$contract_arbeidsduur_bepaling}",
      "5.2 {$contract_oproepvoorwaarden_bepaling}",
      "5.3 Werkgever roept werknemer ten minste vier kalenderdagen voor aanvang schriftelijk of elektronisch op en vermeldt datum, begin- en eindtijd, locatie en werkzaamheden.",
      "5.4 Bij een oproep korter dan vier kalenderdagen voor aanvang is werknemer niet verplicht te werken. Werknemer kan een dergelijke oproep wel vrijwillig aanvaarden.",
      "5.5 Trekt werkgever de oproep binnen vier kalenderdagen voor aanvang geheel of gedeeltelijk in of wijzigt werkgever binnen die termijn de tijdstippen, dan behoudt werknemer het recht op loon over de oorspronkelijke oproep voor zover wet en cao dat bepalen.",
      "5.6 Per afzonderlijke oproep ontvangt werknemer ten minste drie uur loon, ook als minder dan drie uur is gewerkt.",
      "5.7 Na iedere periode van twaalf maanden als oproepkracht doet werkgever binnen de wettelijke termijn schriftelijk of elektronisch een aanbod voor een vaste arbeidsomvang op basis van de gemiddelde arbeidsomvang in de voorafgaande twaalf maanden. Bij afwijzing wordt na een volgende periode van twaalf maanden opnieuw een aanbod gedaan.",
      "5.8 Werknemer behoudt het recht zich te beroepen op het wettelijke rechtsvermoeden van arbeidsomvang en kan volgens de {$cao_naam} schriftelijk om aanpassing van de arbeidsduur verzoeken bij een regelmatig en structureel arbeidspatroon. Een wijziging ontstaat niet automatisch en wordt schriftelijk vastgelegd.",
    ].join("\n"),
  )
  .replace(
    [
      "Artikel 6 - Beloning",
      "6.1 {$contract_loonindeling_bepaling}",
      "6.2 {$contract_basisuurloon_bepaling}",
      "6.3 {$contract_loonperiode_bepaling}",
      "6.4 Toeslagen voor bijzondere uren, feestdagen, overwerk, functiewaarneming en overige vergoedingen worden toegekend volgens de {$cao_naam} en de feitelijke werkzaamheden.",
      "6.5 Wijzigingen in loon, schaal, periodiek of basisuurloon worden toegepast volgens de geldende cao en loontabel en blijken uit de loonstrook of een afzonderlijke schriftelijke of elektronische mededeling.",
    ].join("\n"),
    [
      "Artikel 6 - Beloning en toeslagen",
      "6.1 {$contract_loonindeling_bepaling}",
      "6.2 {$contract_basisuurloon_bepaling}",
      "6.3 {$contract_loonperiode_bepaling}",
      "6.4 Werkgever vermeldt op de loonstrook dat sprake is van een oproepovereenkomst en specificeert de gewerkte en anderszins loongerechtigde uren en toeslagen afzonderlijk.",
      "6.5 Partijen sluiten het recht op loon bij niet-werken in deze standaardovereenkomst niet uit. Of en over welke uren loon is verschuldigd, wordt bepaald door de wet, de {$cao_naam}, vastgestelde oproepen en een eventueel aantoonbaar structureel arbeidspatroon.",
      "6.6 Werknemer kan niet zonder instemming worden verplicht meer dan 144 uur per loonperiode te werken. Uren boven 152 uur per loonperiode gelden als overuren volgens de {$cao_naam}.",
      "6.7 Een oproepkracht ontvangt geen verschuivingstoeslag voor zover de {$cao_naam} dit bepaalt.",
      "6.8 Voor arbeid op een in de {$cao_naam} aangewezen feestdag ontvangt de oproepkracht een toeslag van 100% van het basisuurloon. Voor dezelfde uren worden geen looncomponenten gestapeld die de cao voor oproepkrachten uitsluit.",
      "6.9 Overige toeslagen en vergoedingen worden uitsluitend toegekend voor zover de {$cao_naam} en de feitelijke werkzaamheden daarop aanspraak geven.",
    ].join("\n"),
  )
  .replace(
    [
      "Artikel 7 - Vakantie, vakantiebijslag en verlof",
      "7.1 {$contract_vakantie_bepaling}",
      "7.2 Werknemer ontvangt 8% vakantiebijslag over het daarvoor geldende bruto jaarloon. Opbouw en uitbetaling vinden plaats volgens de {$cao_naam} en de wet.",
      "7.3 Opname, verval en uitbetaling van vakantie-uren en overige verlofrechten worden toegepast volgens de wet en de {$cao_naam}.",
    ].join("\n"),
    [
      "Artikel 7 - Vakantie, vakantiebijslag en verlof",
      "7.1 {$contract_vakantie_bepaling}",
    ].join("\n"),
  )
  .replace(
    "9.3 Loondoorbetaling en re-integratieverplichtingen worden vastgesteld volgens de wet en de {$cao_naam}.",
    "9.3 Is werknemer arbeidsongeschikt tijdens een reeds vastgestelde oproep, dan worden de loonaanspraak en re-integratieverplichtingen vastgesteld volgens de wet en de {$cao_naam}.\n9.4 Buiten reeds vastgestelde oproepen worden eventuele loonaanspraken beoordeeld aan de hand van de wet, de {$cao_naam} en een mogelijk aantoonbaar structureel arbeidspatroon. Deze overeenkomst bevat geen algemene uitsluiting van loondoorbetaling bij ziekte.",
  );

export const PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE_BODY = [
  "STAGEOVEREENKOMST",
  "BOL / re-integratie - CAO Particuliere Beveiliging",
  "",
  "Partijen",
  "Stagebedrijf: {$bedrijf_statutaire_naam}, gevestigd aan {$bedrijf_adres_volledig}, ingeschreven bij de Kamer van Koophandel onder nummer {$bedrijf_kvk}, rechtsgeldig vertegenwoordigd door {$bedrijf_vertegenwoordiger_naam} in de functie van {$bedrijf_vertegenwoordiger_functie}, hierna: stagebedrijf;",
  "",
  "Stagiair: {$medewerker_juridische_volledige_naam}, geboren op {$medewerker_geboortedatum} te {$medewerker_geboorteplaats}, wonende aan {$medewerker_adres_volledig}, hierna: stagiair;",
  "",
  "Instelling: {$stage_instelling_naam}, gevestigd aan {$stage_instelling_adres}, rechtsgeldig vertegenwoordigd door {$stage_instelling_vertegenwoordiger_naam} in de functie van {$stage_instelling_vertegenwoordiger_functie}, hierna: instelling;",
  "",
  "Stagebedrijf, stagiair en instelling worden hierna gezamenlijk aangeduid als partijen en komen het volgende overeen.",
  "",
  "Artikel 1 - Aard, doel en route van de stage",
  "1.1 Deze overeenkomst is een stageovereenkomst en geen arbeidsovereenkomst. Partijen beogen geen arbeidsovereenkomst tot stand te brengen.",
  "1.2 Het hoofddoel is dat stagiair onder begeleiding relevante kennis, vaardigheden en praktijkervaring als beveiliger opdoet. Leren en het behalen van de overeengekomen leerdoelen staan centraal.",
  "1.3 Stagiair wordt niet als reguliere arbeidskracht ingezet, vervangt geen werknemer en draagt niet zelfstandig de verantwoordelijkheid voor een volledige beveiligingsfunctie of personeelsbezetting.",
  "1.4 Op deze stage is artikel 14 van de {$cao_naam}, versie {$cao_versie}, van toepassing. Naast artikel 14 geldt voor stagiair uitsluitend hoofdstuk 3 van die cao, voor zover de stage en werkzaamheden onder de werkingssfeer daarvan vallen.",
  "1.5 {$stage_route_bepaling}",
  "",
  "Artikel 2 - Duur",
  "2.1 {$stage_duur_bepaling}",
  "2.2 De stage wordt uitsluitend voor bepaalde tijd aangegaan. Verlenging vereist voorafgaande schriftelijke instemming van alle partijen en een nieuwe controle op opleiding of maatregel, cao, Wpbr, legitimatie en overige regelgeving.",
  "2.3 Een verlenging mag niet worden gebruikt om stagiair structureel als reguliere arbeidskracht in te zetten.",
  "",
  "Artikel 3 - Opleiding, stageopdracht en leerdoelen",
  "3.1 De stage wordt uitgevoerd in het kader van {$stage_opleiding_naam}.",
  "3.2 De stageopdracht en overeengekomen werkzaamheden zijn: {$stage_opdracht_omschrijving}.",
  "3.3 De leerdoelen zijn: {$stage_leerdoelen}.",
  "3.4 De instelling blijft verantwoordelijk voor de onderwijs- of re-integratiecontext en beoordeelt samen met het stagebedrijf of de werkzaamheden aansluiten op de route, opdracht en leerdoelen.",
  "3.5 Wijzigingen in opdracht of leerdoelen worden vooraf schriftelijk afgestemd tussen stagiair, praktijkopleider en instelling.",
  "",
  "Artikel 4 - Werkzaamheden, functies en werkplek",
  "4.1 {$stage_werkzaamheden_bepaling}",
  "4.2 {$stage_werkplek_bepaling}",
  "4.3 Stagiair verricht uitsluitend werkzaamheden die passen bij de opleiding, leerdoelen, begeleiding, vergunningcontext en geldige bevoegdheden.",
  "4.4 Bij meerdere praktijkfuncties blijven de werkzaamheden onderdeel van één geïntegreerde stageopdracht. Stagiair vervult niet gelijktijdig zelfstandig meerdere volledige functies.",
  "",
  "Artikel 5 - Begeleiding en praktijkopleider",
  "5.1 {$stage_begeleiding_bepaling}",
  "5.2 De praktijkopleider geeft duidelijke instructies, controleert de uitvoering en grijpt in wanneer veiligheid, bevoegdheid, integriteit of leerkwaliteit dat vereist.",
  "5.3 Stagiair volgt de redelijke aanwijzingen van de praktijkopleider en de begeleider van de instelling op.",
  "5.4 Wanneer de vereiste één-op-éénbegeleiding op een stagedag niet kan worden geboden, verricht stagiair die dag geen operationele beveiligingswerkzaamheden.",
  "",
  "Artikel 6 - Stageomvang, rooster en werktijden",
  "6.1 {$stage_werktijden_bepaling}",
  "6.2 De planning houdt rekening met onderwijsactiviteiten, evaluaties, reistijd, veiligheid, leeftijd en de noodzakelijke begeleiding.",
  "6.3 Stagiair is niet verplicht buiten de overeengekomen en rechtmatig geplande stagedagen en tijdvakken aanwezig te zijn, tenzij partijen vooraf met een incidentele wijziging instemmen.",
  "",
  "Artikel 7 - Bovenformatieve inzet en herkenbaarheid",
  "7.1 Het stagebedrijf zet stagiair boven de personeelssterkte in. Stagiair telt niet mee voor de minimale, contractuele of operationeel vereiste personeelsbezetting.",
  "7.2 Stagiair wordt niet ingezet in plaats van een gediplomeerde of anderszins volledig bevoegde medewerker.",
  "7.3 Het stagebedrijf brengt de inzet of aanwezigheid van stagiair niet als beveiligingsarbeid of personeelsinzet aan een klant of opdrachtgever in rekening.",
  "7.4 Stagiair wordt in het rooster opgenomen met de herkenbare status 'stagiair'. Voor zover een uniform wordt gedragen, staat daarop duidelijk zichtbaar de aanduiding 'stagiair'.",
  "",
  "Artikel 8 - Wpbr, legitimatie en inzetbaarheid",
  "8.1 {$stage_wpbr_bepaling}",
  "8.2 Stagiair neemt geen zelfstandige operationele beslissing en verricht geen handeling buiten de opleiding, bevoegdheid, begeleiding of Wpbr-status.",
  "8.3 Het stagebedrijf bewaakt de geldigheid van toestemming, opleidingsverklaring, legitimatie, certificaten en overige vereisten. Stagiair meldt direct wanneer een vereist document ontbreekt, verloopt of wordt ingetrokken.",
  "8.4 Het ontbreken of vervallen van een vereiste schort de betrokken werkzaamheden op en leidt niet automatisch tot beëindiging van deze overeenkomst. Partijen beoordelen eerst een passende aanpassing of rechtmatige beëindiging.",
  "",
  "Artikel 9 - Evaluatie en voortgang",
  "9.1 {$stage_evaluatie_bepaling}",
  "9.2 De evaluatie ziet ten minste op leerdoelen, vakbekwaamheid, veiligheid, integriteit, begeleiding, aanwezigheid en geschiktheid van de praktijkwerkzaamheden.",
  "9.3 Bij onvoldoende voortgang beoordelen partijen eerst of aanpassing van begeleiding, werkzaamheden of leerdoelen mogelijk en verantwoord is.",
  "",
  "Artikel 10 - Stagevergoeding en onkosten",
  "10.1 {$stage_vergoeding_bepaling}",
  "10.2 Een stagevergoeding is geen loon voor reguliere productieve arbeid en geeft het stagebedrijf niet het recht stagiair als werknemer of zelfstandige arbeidskracht in te zetten.",
  "10.3 Partijen beoordelen vooraf of een vergoeding gevolgen kan hebben voor een uitkering, subsidie, voorziening of re-integratiemaatregel.",
  "",
  "Artikel 11 - Veiligheid, gedrag en integriteit",
  "11.1 Het stagebedrijf zorgt voor een veilige en sociaal veilige stageomgeving en verstrekt noodzakelijke instructies, beschermingsmiddelen en informatie.",
  "11.2 Stagiair volgt redelijke veiligheids-, object-, toegangs-, meldkamer-, privacy-, integriteits- en calamiteiteninstructies op.",
  "11.3 Stagiair verricht geen activiteiten onder invloed van alcohol, drugs of andere middelen die een veilige of betrouwbare uitvoering kunnen beïnvloeden.",
  "11.4 Stagiair meldt onveilige situaties, incidenten, bijna-ongevallen, belangenconflicten en integriteitsrisico's direct bij de praktijkopleider.",
  "",
  "Artikel 12 - Geheimhouding, privacy en informatiebeveiliging",
  "12.1 Stagiair houdt tijdens en na de stage alle niet-openbare informatie geheim waarvan de vertrouwelijke aard bekend is of redelijkerwijs duidelijk behoort te zijn.",
  "12.2 Daaronder valt bedrijfs-, klant-, personeels-, object-, alarm-, beeld-, transport-, onderzoeks- en systeeminformatie die stagiair via de functie, opdrachtgever, locatie of gebruikte systemen ontvangt.",
  "12.3 Stagiair gebruikt deze informatie uitsluitend voor de stageopdracht, deelt haar alleen met bevoegde personen die haar voor hun taak nodig hebben en gebruikt uitsluitend goedgekeurde systemen en communicatiemiddelen.",
  "12.4 Verlies, onbevoegde toegang, verkeerde verzending of een mogelijk datalek wordt direct gemeld bij {$meldpunt_privacy_datalekken} en de praktijkopleider.",
  "12.5 De geheimhoudingsplicht beperkt geen wettelijk toegestane melding bij de instelling, een bevoegde instantie, juridisch adviseur of meldpunt voor misstanden.",
  "",
  "Artikel 13 - Bedrijfsmiddelen",
  "13.1 Stagiair gebruikt verstrekte uniformen, legitimatiebewijzen, sleutels, passen, apparatuur, voertuigen, documenten en accounts zorgvuldig en uitsluitend voor de stage.",
  "13.2 Verlies, diefstal, beschadiging of onbevoegd gebruik wordt direct gemeld.",
  "13.3 Alle middelen worden op verzoek en uiterlijk bij het einde van de stage teruggegeven. Schade of kosten worden alleen verhaald voor zover dit rechtens is toegestaan.",
  "",
  "Artikel 14 - Afwezigheid, verzekering en aansprakelijkheid",
  "14.1 Stagiair meldt ziekte, verhindering en hervatting zo spoedig mogelijk bij de praktijkopleider en de instelling volgens de geldende meldprocedure.",
  "14.2 Afwezigheid geeft geen recht op loon. Gevolgen voor vergoeding, uitkering, voortgang, stageomvang en leerdoelen volgen uit deze overeenkomst en de onderliggende praktijkovereenkomst of maatregel.",
  "14.3 {$stage_verzekering_bepaling}",
  "14.4 Aansprakelijkheid wordt beoordeeld volgens de wet en de omstandigheden, waaronder instructies, begeleiding, leeftijd, verzekering en de aard van de stage. Stagiair is niet zonder meer aansprakelijk voor alle directe of indirecte schade.",
  "",
  "Artikel 15 - Beëindiging en afronding",
  "15.1 {$stage_beeindiging_bepaling}",
  "15.2 Bij beëindiging werken partijen mee aan een zorgvuldige afronding, eindbeoordeling en afwikkeling van bedrijfsmiddelen en vertrouwelijke informatie.",
  "15.3 Het stagebedrijf verstrekt, indien passend bij de route, een beoordeling of verklaring over de uitgevoerde stage en behaalde leerdoelen.",
  "15.4 Dit artikel vormt geen ontslagregeling voor een arbeidsovereenkomst.",
  "",
  "Artikel 16 - Bijlagen en rangorde",
  "16.1 De volgende bijlagen maken onderdeel uit van deze overeenkomst: {$stage_bijlagen_lijst}.",
  "16.2 Bij BOL maken de geldige praktijkovereenkomst en het onderwijs- of leerplan onderdeel uit van het stagedossier. Bij re-integratie maken het besluit, plan, de toestemming en toepasselijke voorwaarden van de instelling daarvan onderdeel uit.",
  "16.3 Dwingend recht gaat voor. Daarna geldt de voor de route verplichte officiële overeenkomst of toestemming, vervolgens deze stageovereenkomst en daarna de overige bijlagen.",
  "",
  "Artikel 17 - Slotbepalingen en ondertekening",
  "17.1 Wijzigingen zijn alleen geldig wanneer zij schriftelijk of elektronisch aantoonbaar door de vereiste partijen zijn vastgelegd.",
  "17.2 Op deze overeenkomst is Nederlands recht van toepassing. Partijen bespreken een geschil eerst gezamenlijk voordat zij zich tot een bevoegde instantie of rechter wenden.",
  "17.3 Iedere partij verklaart een exemplaar van deze overeenkomst en de bijlagen te hebben ontvangen.",
  "17.4 {$stage_minderjarigheid_bepaling}",
  "",
  "Aldus overeengekomen en ondertekend te {$contract_ondertekeningsplaats} op {$contract_ondertekeningsdatum}.",
  "",
  "Voor het stagebedrijf:",
  "{$bedrijf_vertegenwoordiger_naam}, {$bedrijf_vertegenwoordiger_functie}",
  "Handtekening: ______________________________",
  "",
  "Stagiair:",
  "{$medewerker_juridische_volledige_naam}",
  "Handtekening: ______________________________",
  "",
  "Voor de instelling:",
  "{$stage_instelling_vertegenwoordiger_naam}, {$stage_instelling_vertegenwoordiger_functie}",
  "Handtekening: ______________________________",
  "",
  "Wettelijke vertegenwoordiger indien vereist:",
  "{$stage_wettelijke_vertegenwoordiger_naam}",
  "Handtekening: ______________________________",
].join("\n");

export const PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE_BODY = PB_FULLTIME_STANDARD_TEMPLATE_BODY
  .replace(
    "Fulltime dienstverband - CAO Particuliere Beveiliging",
    "Leerarbeidsovereenkomst (BBL) - CAO Particuliere Beveiliging",
  )
  .replace(
    [
      "Artikel 10 - Wpbr-toestemming, legitimatie en vakbekwaamheid",
      "10.1 {$contract_wpbr_bepaling}",
      "10.2 Werknemer informeert werkgever direct over feiten of omstandigheden die de vereiste toestemming, betrouwbaarheid, legitimatie, vakbekwaamheid of inzetbaarheid kunnen beïnvloeden.",
      "10.3 {$contract_wpbr_gevolgen_bepaling}",
      "10.4 Werknemer staakt de betrokken werkzaamheden direct en levert het legitimatiebewijs en andere Wpbr-gebonden middelen op eerste verzoek bij werkgever in.",
    ].join("\n"),
    [
      "Artikel 10 - BBL, praktijkovereenkomst en Wpbr",
      "10.1 {$bbl_leerroute_bepaling}",
      "10.2 {$bbl_praktijkovereenkomst_bepaling}",
      "10.3 {$contract_wpbr_bepaling}",
      "10.4 Werknemer informeert werkgever direct over feiten of omstandigheden die de opleiding, praktijkovereenkomst, toestemming, betrouwbaarheid, legitimatie, vakbekwaamheid of inzetbaarheid kunnen beïnvloeden.",
      "10.5 {$contract_wpbr_gevolgen_bepaling}",
      "10.6 Ontbreekt of vervalt uitsluitend een opleidings- of praktijkdocument dat niet de Wpbr-toestemming betreft, dan zet werkgever werknemer niet in voor werkzaamheden waarvoor dat document nodig is en beoordelen partijen voortzetting of aanpassing van opleiding, werk en praktijkovereenkomst volgens wet en cao.",
    ].join("\n"),
  )
  .replace(
    [
      "Artikel 14 - Scholing",
      "14.1 Scholing die werkgever op grond van wet of cao verplicht moet aanbieden, wordt kosteloos aangeboden en geldt als arbeidstijd voor zover de wet of de {$cao_naam} dit voorschrijft.",
      "14.2 Voor een niet-verplichte opleiding kunnen partijen uitsluitend in een afzonderlijke, rechtsgeldige studiekostenovereenkomst aanvullende afspraken maken.",
    ].join("\n"),
    [
      "Artikel 14 - Opleiding en scholing",
      "14.1 Werkgever stelt werknemer in staat de BBL-opleiding, praktijklessen, examens en overeengekomen schoolmomenten te volgen volgens de praktijkovereenkomst en de {$cao_naam}.",
      "14.2 Scholing die werkgever op grond van wet, cao of de overeengekomen leerroute verplicht moet aanbieden, wordt kosteloos aangeboden en geldt als arbeidstijd voor zover de wet of de {$cao_naam} dit voorschrijft.",
      "14.3 Voor een niet-verplichte opleiding kunnen partijen uitsluitend in een afzonderlijke, rechtsgeldige studiekostenovereenkomst aanvullende afspraken maken.",
    ].join("\n"),
  );

export const CONTRACT_TEMPLATE_PLACEHOLDERS = [
  { key: "bedrijf_statutaire_naam", label: "Juridische bedrijfsnaam", source: "Bedrijfsprofiel" },
  { key: "bedrijf_handelsnaam", label: "Handelsnaam", source: "Bedrijfsprofiel" },
  { key: "bedrijf_rechtsvorm", label: "Rechtsvorm", source: "Bedrijfsprofiel" },
  { key: "bedrijf_adres_volledig", label: "Volledig bedrijfsadres", source: "Bedrijfsprofiel" },
  { key: "bedrijf_kvk", label: "KvK-nummer", source: "Bedrijfsprofiel" },
  { key: "bedrijf_btw_nummer", label: "Btw-nummer", source: "Bedrijfsprofiel" },
  { key: "bedrijf_email", label: "E-mailadres bedrijf", source: "Bedrijfsprofiel" },
  { key: "bedrijf_telefoon", label: "Telefoonnummer bedrijf", source: "Bedrijfsprofiel" },
  { key: "bedrijf_vertegenwoordiger_naam", label: "Naam vertegenwoordiger", source: "Contractwizard" },
  { key: "bedrijf_vertegenwoordiger_functie", label: "Functie vertegenwoordiger", source: "Contractwizard" },
  { key: "medewerker_juridische_volledige_naam", label: "Juridische volledige naam medewerker", source: "Medewerkerprofiel" },
  { key: "medewerker_juridische_voornamen", label: "Juridische voornamen medewerker", source: "Medewerkerprofiel" },
  { key: "medewerker_volledige_naam", label: "Volledige naam medewerker (compatibiliteit)", source: "Medewerkerprofiel" },
  { key: "medewerker_voornaam", label: "Roepnaam medewerker", source: "Medewerkerprofiel" },
  { key: "medewerker_achternaam", label: "Achternaam medewerker", source: "Medewerkerprofiel" },
  { key: "medewerker_geboortedatum", label: "Geboortedatum", source: "Medewerkerprofiel" },
  { key: "medewerker_geboorteplaats", label: "Geboorteplaats", source: "Medewerkerprofiel" },
  { key: "medewerker_adres_volledig", label: "Volledig adres medewerker", source: "Medewerkerprofiel" },
  { key: "medewerker_email", label: "E-mailadres medewerker", source: "Medewerkerprofiel" },
  { key: "medewerker_telefoon", label: "Telefoonnummer medewerker", source: "Medewerkerprofiel" },
  { key: "cao_naam", label: "Naam toepasselijke cao", source: "CAO-keuze" },
  { key: "cao_versie", label: "CAO-versie", source: "CAO-configuratie" },
  { key: "cao_functiegroep", label: "CAO-functiegroep", source: "Contractwizard" },
  { key: "cao_functieniveau", label: "CAO-functieniveau", source: "Contractwizard" },
  { key: "salarisschaal", label: "Salarisschaal", source: "Loontabel" },
  { key: "periodiek", label: "Periodiek", source: "Loontabel" },
  { key: "bruto_uurloon", label: "Bruto uurloon", source: "Loontabel" },
  { key: "bruto_salaris_per_loonperiode", label: "Bruto salaris per loonperiode", source: "Afgeleid" },
  { key: "contract_startdatum", label: "Startdatum", source: "Contractwizard" },
  { key: "contract_einddatum", label: "Einddatum", source: "Contractwizard" },
  { key: "contract_einddatum_of_onbepaalde_tijd", label: "Einddatum of tekst onbepaalde tijd", source: "Afgeleid" },
  { key: "contract_duursoort", label: "Bepaalde of onbepaalde tijd", source: "Afgeleid" },
  { key: "contract_duur_omschrijving", label: "Leesbare contractduur", source: "Afgeleid" },
  { key: "contract_duur_bepaling", label: "Volledige looptijdbepaling", source: "Slim afgeleid" },
  { key: "contract_aanzegtermijn_bepaling", label: "Aanzegbepaling", source: "Slim afgeleid" },
  { key: "contract_proeftijd_bepaling", label: "Proeftijdbepaling", source: "Slim afgeleid" },
  { key: "contract_opzegtermijn_bepaling", label: "Opzegbepaling", source: "Slim afgeleid" },
  { key: "contract_arbeidsduur_bepaling", label: "Arbeidsduurbepaling", source: "Slim afgeleid" },
  { key: "contract_oproepvoorwaarden_bepaling", label: "Beschikbaarheid en oproepwijze", source: "Slim afgeleid" },
  { key: "contract_functie_indeling_bepaling", label: "Functie- en loonindeling", source: "Slim afgeleid" },
  { key: "contract_werkplek_bepaling", label: "Werkplek en werkgebied", source: "Contractwizard" },
  { key: "contract_beloning_bepaling", label: "Beloningsbepaling (compatibiliteit)", source: "Slim afgeleid" },
  { key: "contract_loonindeling_bepaling", label: "Schaal- en periodiekindeling", source: "Slim afgeleid" },
  { key: "contract_basisuurloon_bepaling", label: "Bruto basisuurloon in euro's", source: "Slim afgeleid" },
  { key: "contract_loonperiode_bepaling", label: "Betaalperiode van het loon", source: "Slim afgeleid" },
  { key: "contract_vakantie_bepaling", label: "Vakantiebepaling", source: "Slim afgeleid" },
  { key: "contract_wpbr_bepaling", label: "Wpbr-bepaling", source: "Slim afgeleid" },
  { key: "contract_wpbr_gevolgen_bepaling", label: "Gevolgen ontbreken Wpbr-toestemming", source: "Slim afgeleid" },
  { key: "hoofdfunctie", label: "Automatisch afgeleide hoofdfunctie", source: "Slim afgeleid" },
  { key: "functie_lijst", label: "Alle overeengekomen functies", source: "Contractwizard" },
  { key: "nevenfuncties_lijst", label: "Aanvullende functies", source: "Contractwizard" },
  { key: "contracturen_per_week", label: "Contracturen per week", source: "Contractwizard" },
  { key: "contracturen_per_periode", label: "Contracturen per loonperiode", source: "Afgeleid" },
  { key: "pensioenregeling_naam", label: "Pensioenregeling", source: "CAO-configuratie" },
  { key: "meldpunt_privacy_datalekken", label: "Meldpunt privacy en datalekken", source: "Bedrijfsprofiel" },
  { key: "contract_ondertekeningsplaats", label: "Plaats ondertekening", source: "Contractwizard" },
  { key: "contract_ondertekeningsdatum", label: "Datum ondertekening", source: "Contractwizard" },
  { key: "stage_instelling_naam", label: "Naam onderwijs- of re-integratie-instelling", source: "Stagewizard" },
  { key: "stage_instelling_adres", label: "Adres onderwijs- of re-integratie-instelling", source: "Stagewizard" },
  { key: "stage_instelling_vertegenwoordiger_naam", label: "Vertegenwoordiger instelling", source: "Stagewizard" },
  { key: "stage_instelling_vertegenwoordiger_functie", label: "Functie vertegenwoordiger instelling", source: "Stagewizard" },
  { key: "stage_instelling_email", label: "E-mailadres instelling", source: "Stagewizard" },
  { key: "stage_opleiding_naam", label: "Opleiding of re-integratietraject", source: "Stagewizard" },
  { key: "stage_bpv_kenmerk", label: "POK/BPV-kenmerk", source: "Stagewizard" },
  { key: "stage_leerbedrijf_erkenningsnummer", label: "SBB-erkenningsnummer leerbedrijf", source: "Stagewizard" },
  { key: "stage_route_referentie", label: "Referentie routebesluit of toestemming", source: "Stagewizard" },
  { key: "stage_opdracht_omschrijving", label: "Stageopdracht en werkzaamheden", source: "Stagewizard" },
  { key: "stage_leerdoelen", label: "Leerdoelen", source: "Stagewizard" },
  { key: "stage_praktijkopleider_naam", label: "Naam praktijkopleider", source: "Stagewizard" },
  { key: "stage_instellingsbegeleider_naam", label: "Begeleider vanuit instelling", source: "Stagewizard" },
  { key: "stage_uren_per_week", label: "Stage-uren per week", source: "Stagewizard" },
  { key: "stage_werktijden", label: "Stagedagen en tijdvakken", source: "Stagewizard" },
  { key: "stage_evaluatie_afspraken", label: "Evaluatiemomenten en werkwijze", source: "Stagewizard" },
  { key: "stage_vergoeding_bedrag", label: "Stagevergoeding", source: "Stagewizard" },
  { key: "stage_vergoeding_periode", label: "Periode stagevergoeding", source: "Stagewizard" },
  { key: "stage_onkostenregeling", label: "Onkostenregeling stage", source: "Stagewizard" },
  { key: "stage_verzekering_omschrijving", label: "Verzekeringen tijdens stage", source: "Stagewizard" },
  { key: "stage_bijlagen_lijst", label: "Bijlagen bij stageovereenkomst", source: "Stagewizard" },
  { key: "stage_wettelijke_vertegenwoordiger_naam", label: "Wettelijke vertegenwoordiger minderjarige", source: "Stagewizard" },
  { key: "stage_route_bepaling", label: "Routebepaling BOL of re-integratie", source: "Slim afgeleid" },
  { key: "stage_duur_bepaling", label: "Volledige stageduurbepaling", source: "Slim afgeleid" },
  { key: "stage_werkzaamheden_bepaling", label: "Stagewerkzaamheden en functies", source: "Slim afgeleid" },
  { key: "stage_werkplek_bepaling", label: "Stageplaats en werkgebied", source: "Slim afgeleid" },
  { key: "stage_begeleiding_bepaling", label: "Praktijkbegeleiding", source: "Slim afgeleid" },
  { key: "stage_werktijden_bepaling", label: "Stageomvang en werktijden", source: "Slim afgeleid" },
  { key: "stage_evaluatie_bepaling", label: "Evaluatiebepaling", source: "Slim afgeleid" },
  { key: "stage_vergoeding_bepaling", label: "Stagevergoeding en onkosten", source: "Slim afgeleid" },
  { key: "stage_wpbr_bepaling", label: "Wpbr-bepaling voor stagiair", source: "Slim afgeleid" },
  { key: "stage_verzekering_bepaling", label: "Verzekering tijdens stage", source: "Slim afgeleid" },
  { key: "stage_beeindiging_bepaling", label: "Beëindiging stage", source: "Slim afgeleid" },
  { key: "stage_minderjarigheid_bepaling", label: "Bepaling minderjarige stagiair", source: "Slim afgeleid" },
  { key: "bbl_onderwijsinstelling_naam", label: "Onderwijsinstelling BBL", source: "Contractwizard" },
  { key: "bbl_opleiding_naam", label: "BBL-opleiding", source: "Contractwizard" },
  { key: "bbl_praktijkovereenkomst_kenmerk", label: "Kenmerk praktijkovereenkomst BBL", source: "Contractwizard" },
  { key: "bbl_leerbedrijf_erkenningsnummer", label: "SBB-erkenningsnummer BBL", source: "Contractwizard" },
  { key: "bbl_praktijkopleider_naam", label: "Praktijkopleider BBL", source: "Contractwizard" },
  { key: "bbl_leerroute_bepaling", label: "BBL-leerroute", source: "Slim afgeleid" },
  { key: "bbl_praktijkovereenkomst_bepaling", label: "BBL-praktijkovereenkomst", source: "Slim afgeleid" },
  { key: "exporteerdatum", label: "Exportdatum", source: "Systeem" },
];

const PLACEHOLDER_KEYS = new Set(CONTRACT_TEMPLATE_PLACEHOLDERS.map(item => item.key));

export const PB_FULLTIME_REQUIRED_PLACEHOLDERS = [
  "bedrijf_statutaire_naam",
  "bedrijf_adres_volledig",
  "bedrijf_kvk",
  "bedrijf_vertegenwoordiger_naam",
  "bedrijf_vertegenwoordiger_functie",
  "medewerker_juridische_volledige_naam",
  "medewerker_geboortedatum",
  "medewerker_geboorteplaats",
  "medewerker_adres_volledig",
  "cao_naam",
  "contract_startdatum",
  "contract_duur_bepaling",
  "contract_aanzegtermijn_bepaling",
  "contract_proeftijd_bepaling",
  "contract_opzegtermijn_bepaling",
  "contract_arbeidsduur_bepaling",
  "contract_functie_indeling_bepaling",
  "contract_werkplek_bepaling",
  "contract_loonindeling_bepaling",
  "contract_basisuurloon_bepaling",
  "contract_loonperiode_bepaling",
  "contract_vakantie_bepaling",
  "contract_wpbr_bepaling",
  "contract_wpbr_gevolgen_bepaling",
  "functie_lijst",
  "pensioenregeling_naam",
  "meldpunt_privacy_datalekken",
  "contract_ondertekeningsplaats",
  "contract_ondertekeningsdatum",
];

export const PB_PARTTIME_REQUIRED_PLACEHOLDERS = [...PB_FULLTIME_REQUIRED_PLACEHOLDERS];
export const PB_PARTTIME_GROWTH_REQUIRED_PLACEHOLDERS = [...PB_FULLTIME_REQUIRED_PLACEHOLDERS];
export const PB_MIN_MAX_REQUIRED_PLACEHOLDERS = [
  ...PB_FULLTIME_REQUIRED_PLACEHOLDERS,
  "contract_oproepvoorwaarden_bepaling",
];
export const PB_ZERO_HOURS_REQUIRED_PLACEHOLDERS = [
  ...PB_FULLTIME_REQUIRED_PLACEHOLDERS,
  "contract_oproepvoorwaarden_bepaling",
];
export const PB_ARTICLE_14_INTERNSHIP_REQUIRED_PLACEHOLDERS = [
  "bedrijf_statutaire_naam",
  "bedrijf_adres_volledig",
  "bedrijf_kvk",
  "bedrijf_vertegenwoordiger_naam",
  "bedrijf_vertegenwoordiger_functie",
  "medewerker_juridische_volledige_naam",
  "medewerker_geboortedatum",
  "medewerker_geboorteplaats",
  "medewerker_adres_volledig",
  "cao_naam",
  "cao_versie",
  "stage_instelling_naam",
  "stage_instelling_adres",
  "stage_instelling_vertegenwoordiger_naam",
  "stage_instelling_vertegenwoordiger_functie",
  "stage_opleiding_naam",
  "stage_opdracht_omschrijving",
  "stage_leerdoelen",
  "stage_route_bepaling",
  "stage_duur_bepaling",
  "stage_werkzaamheden_bepaling",
  "stage_werkplek_bepaling",
  "stage_begeleiding_bepaling",
  "stage_werktijden_bepaling",
  "stage_evaluatie_bepaling",
  "stage_vergoeding_bepaling",
  "stage_wpbr_bepaling",
  "stage_verzekering_bepaling",
  "stage_beeindiging_bepaling",
  "stage_bijlagen_lijst",
  "stage_minderjarigheid_bepaling",
  "meldpunt_privacy_datalekken",
  "contract_ondertekeningsplaats",
  "contract_ondertekeningsdatum",
];
export const PB_BBL_EMPLOYMENT_REQUIRED_PLACEHOLDERS = [
  ...PB_FULLTIME_REQUIRED_PLACEHOLDERS,
  "bbl_leerroute_bepaling",
  "bbl_praktijkovereenkomst_bepaling",
];

export function isKnownContractTemplatePlaceholder(key) {
  return PLACEHOLDER_KEYS.has(String(key || "").trim());
}

export function getContractTemplatePlaceholderDefinition(key) {
  return CONTRACT_TEMPLATE_PLACEHOLDERS.find(item => item.key === key) || null;
}

export const PB_FULLTIME_STANDARD_TEMPLATE = {
  id: PB_FULLTIME_STANDARD_TEMPLATE_ID,
  version: 4,
  name: "Fulltime dienstverband - CAO Particuliere Beveiliging",
  description: "Fulltime basismodel voor situaties waarin de CAO Particuliere Beveiliging daadwerkelijk van toepassing is, met slimme looptijd-, proeftijd-, arbeidsduur-, vakantie-, Wpbr- en opzegbepalingen.",
  template_type: "employment_contract",
  cao_key: CAO_PARTICULIERE_BEVEILIGING_KEY,
  contract_model: "fulltime_employment",
  body: PB_FULLTIME_STANDARD_TEMPLATE_BODY,
  required_placeholders: PB_FULLTIME_REQUIRED_PLACEHOLDERS,
  legal_basis: {
    cao_label: "CAO Particuliere Beveiliging 18 december 2024 tot en met 27 december 2026",
    cao_version: "Versie 3 - juli 2026",
    valid_from: "2024-12-18",
    valid_until: "2026-12-27",
    reviewed_at: "2026-07-22",
    applicability_note: "De vergunning bepaalt niet zelfstandig de cao. De werkingssfeer omvat volgens artikel 2 in beginsel ND/HND als Wpbr artikel 3 sub a, PAC, PGW en VTC, met cao-uitzonderingen voor onder meer bepaalde evenementen- en horecabeveiliging. BD, HBD en POB vallen niet alleen op grond van hun vergunning onder deze cao.",
    sources: [
      "https://www.beveiligingsbranche.nl/wp-content/uploads/CAO-PB-18-dec-2024-27-dec-2026-versie-3-juli-2026-.pdf",
      "https://www.beveiligingsbranche.nl/v-personeelswijzer/",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/arbeidsovereenkomst-en-cao/wat-staat-er-in-een-arbeidsovereenkomst",
      "https://www.justis.nl/producten/particuliere-beveiliging-en-recherche/wat-is-de-wet-particuliere-beveiligingsorganisaties-en-recherchebureaus-wpbr",
      "https://www.justis.nl/producten/particuliere-beveiliging-en-recherche/toestemming-medewerkers",
      "https://www.justis.nl/producten/particuliere-beveiliging-en-recherche/toestemming-leidinggevenden",
      "https://wetten.overheid.nl/BWBR0008973/#Paragraaf3_Artikel7",
      "https://uitspraken.rechtspraak.nl/details?id=ECLI:NL:GHDHA:2021:1084",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/arbeidsovereenkomst-en-cao/wat-is-het-verschil-tussen-een-tijdelijk-contract-en-een-vast-contract",
    ],
  },
};

export const PB_PARTTIME_STANDARD_TEMPLATE = {
  id: PB_PARTTIME_STANDARD_TEMPLATE_ID,
  version: 4,
  name: "Parttime dienstverband - CAO Particuliere Beveiliging",
  description: "Parttime basismodel volgens het vaste model van de CAO Particuliere Beveiliging. De overeengekomen uren gelden per loonperiode van vier weken; oproep-, min-max- en groeimodellen vallen buiten deze template.",
  template_type: "employment_contract",
  cao_key: CAO_PARTICULIERE_BEVEILIGING_KEY,
  contract_model: "parttime_employment",
  body: PB_PARTTIME_STANDARD_TEMPLATE_BODY,
  required_placeholders: PB_PARTTIME_REQUIRED_PLACEHOLDERS,
  legal_basis: {
    ...PB_FULLTIME_STANDARD_TEMPLATE.legal_basis,
    reviewed_at: "2026-07-22",
    applicability_note: `${PB_FULLTIME_STANDARD_TEMPLATE.legal_basis.applicability_note} Deze preset past uitsluitend bij het vaste parttimemodel uit artikel 11; het groeimodel en oproepovereenkomsten vereisen een eigen template.`,
  },
};

export const PB_PARTTIME_GROWTH_STANDARD_TEMPLATE = {
  id: PB_PARTTIME_GROWTH_STANDARD_TEMPLATE_ID,
  version: 4,
  name: "Parttime groeimodel - CAO Particuliere Beveiliging",
  description: "Parttime basismodel volgens het groeimodel van de CAO Particuliere Beveiliging. De contracturen staan vast per loonperiode van vier weken; inzet boven die uren blijft gebonden aan rooster-, instemmings-, meeruren-, overwerk- en minurenregels.",
  template_type: "employment_contract",
  cao_key: CAO_PARTICULIERE_BEVEILIGING_KEY,
  contract_model: "parttime_growth",
  body: PB_PARTTIME_GROWTH_STANDARD_TEMPLATE_BODY,
  required_placeholders: PB_PARTTIME_GROWTH_REQUIRED_PLACEHOLDERS,
  legal_basis: {
    ...PB_FULLTIME_STANDARD_TEMPLATE.legal_basis,
    reviewed_at: "2026-07-22",
    applicability_note: `${PB_FULLTIME_STANDARD_TEMPLATE.legal_basis.applicability_note} Deze preset past uitsluitend bij het parttime groeimodel uit artikel 11. Het vaste parttimemodel, min-maxcontract en overige oproepovereenkomsten vereisen een eigen template.`,
  },
};

export const PB_MIN_MAX_STANDARD_TEMPLATE = {
  id: PB_MIN_MAX_STANDARD_TEMPLATE_ID,
  version: 4,
  name: "Min-maxcontract - CAO Particuliere Beveiliging",
  description: "Min-maxmodel volgens de CAO Particuliere Beveiliging, met garantie-uren en een maximale oproepomvang per loonperiode van vier weken, vaste beschikbaarheidsafspraken en slimme oproepregels.",
  template_type: "employment_contract",
  cao_key: CAO_PARTICULIERE_BEVEILIGING_KEY,
  contract_model: "min_max_employment",
  body: PB_MIN_MAX_STANDARD_TEMPLATE_BODY,
  required_placeholders: PB_MIN_MAX_REQUIRED_PLACEHOLDERS,
  legal_basis: {
    ...PB_FULLTIME_STANDARD_TEMPLATE.legal_basis,
    reviewed_at: "2026-07-22",
    applicability_note: `${PB_FULLTIME_STANDARD_TEMPLATE.legal_basis.applicability_note} Deze preset is uitsluitend bedoeld voor een oproepovereenkomst in de vorm van een min-maxcontract. Minimum en maximum worden per loonperiode van vier weken vastgelegd; een minimum van nul hoort bij een nulurenmodel en gelijke minimum- en maximumuren horen bij een vaste arbeidsomvang.`,
    sources: [
      ...PB_FULLTIME_STANDARD_TEMPLATE.legal_basis.sources,
      "https://www.beveiligingsbranche.nl/wp-content/uploads/240724-Pers.wijzer-Arbeidsovereenkomst_oproep_minmax.pdf",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/arbeidsovereenkomst-en-cao/welke-contracten-zijn-er-voor-oproepkrachten",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/arbeidsovereenkomst-en-cao/krijg-ik-als-oproepkracht-ook-loon-als-ik-maar-1-of-2-uur-heb-gewerkt",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/ziekteverzuim-van-het-werk/krijg-ik-als-oproepkracht-ook-loon-als-ik-ziek-ben",
      "https://zoek.officielebekendmakingen.nl/stb-2026-205.html",
      "https://zoek.officielebekendmakingen.nl/stb-2026-206.html",
    ],
  },
};

export const PB_ZERO_HOURS_STANDARD_TEMPLATE = {
  id: PB_ZERO_HOURS_STANDARD_TEMPLATE_ID,
  version: 4,
  name: "Nulurencontract - CAO Particuliere Beveiliging",
  description: "Nulurenmodel volgens de CAO Particuliere Beveiliging, zonder vaste, minimum- of garantie-uren en met vaste beschikbaarheidsafspraken, slimme oproepregels en een veilige standaard zonder loonuitsluiting.",
  template_type: "employment_contract",
  cao_key: CAO_PARTICULIERE_BEVEILIGING_KEY,
  contract_model: "call_employment",
  body: PB_ZERO_HOURS_STANDARD_TEMPLATE_BODY,
  required_placeholders: PB_ZERO_HOURS_REQUIRED_PLACEHOLDERS,
  legal_basis: {
    ...PB_FULLTIME_STANDARD_TEMPLATE.legal_basis,
    reviewed_at: "2026-07-22",
    applicability_note: `${PB_FULLTIME_STANDARD_TEMPLATE.legal_basis.applicability_note} Deze preset is uitsluitend bedoeld voor een nulurenovereenkomst zonder vaste, minimum-, maximum- of garantie-uren. Een voorovereenkomst, min-maxcontract of contract met vaste arbeidsomvang vereist een ander model. De standaard sluit het recht op loon bij niet-werken niet uit. De vakantieclausule past de cao-betaling van 9,24% alleen toe voor zover artikel 59 lid 3 werkgever en werknemer rechtsgeldig bindt en waarborgt anders de toepasselijke vakantieopbouw en opname.`,
    sources: [
      ...PB_FULLTIME_STANDARD_TEMPLATE.legal_basis.sources,
      "https://www.beveiligingsbranche.nl/wp-content/uploads/240724-Pers.wijzer-Arbeidsovereenkomst_oproep_nulurencontract.pdf",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/arbeidsovereenkomst-en-cao/welke-contracten-zijn-er-voor-oproepkrachten",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/arbeidsovereenkomst-en-cao/krijg-ik-als-oproepkracht-ook-loon-als-ik-maar-1-of-2-uur-heb-gewerkt",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/ziekteverzuim-van-het-werk/krijg-ik-als-oproepkracht-ook-loon-als-ik-ziek-ben",
      "https://zoek.officielebekendmakingen.nl/stb-2026-205.html",
      "https://zoek.officielebekendmakingen.nl/stb-2026-206.html",
    ],
  },
};

export const PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE = {
  id: PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE_ID,
  version: 4,
  name: "Stageovereenkomst (BOL / re-integratie) - CAO Particuliere Beveiliging",
  description: "Stageovereenkomst voor relevante praktijkervaring als beveiliger via BOL, UWV-proefplaatsing, een re-integratiemaatregel of tweede spoor. Dit is geen arbeidsovereenkomst en niet geschikt voor BBL of een algemene kantoorstage.",
  template_type: "employment_contract",
  legal_document_type: "internship_agreement",
  is_employment_agreement: false,
  party_role_scheme: "stage_company_intern_institution",
  learning_route_scope: "article_14_internship",
  supports_fixed_term_only: true,
  supports_bbl: false,
  supports_general_office_internship: false,
  cao_key: CAO_PARTICULIERE_BEVEILIGING_KEY,
  contract_model: "internship",
  body: PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE_BODY,
  required_placeholders: PB_ARTICLE_14_INTERNSHIP_REQUIRED_PLACEHOLDERS,
  legal_basis: {
    ...PB_FULLTIME_STANDARD_TEMPLATE.legal_basis,
    reviewed_at: "2026-07-22",
    applicability_note: "Uitsluitend voor relevante praktijkervaring als beveiliger volgens artikel 14 CAO PB via BOL, een UWV-proefplaatsing van maximaal twee maanden, een andere re-integratiemaatregel of tweede spoor. Stagiair wordt bovenformatief, niet doorbelast, in het rooster en dagelijks 1-op-1 begeleid ingezet en is herkenbaar als stagiair. Alleen hoofdstuk 3 van de cao geldt naast artikel 14. BBL is een arbeidsovereenkomst en vereist de afzonderlijke BBL-template plus een praktijkovereenkomst.",
    sources: [
      "https://www.beveiligingsbranche.nl/wp-content/uploads/CAO-PB-18-dec-2024-27-dec-2026-versie-3-juli-2026-.pdf",
      "https://zoek.officielebekendmakingen.nl/stcrt-2024-2109.html",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/middelbaar-beroepsonderwijs/moet-ik-stage-lopen-als-ik-een-mbo-opleiding-volg",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/minimumloon/minimumloon-stage",
      "https://www.s-bb.nl/bedrijven/wat-is-een-leerbedrijf/verschil-bol-en-bbl/",
      "https://www.justis.nl/producten/particuliere-beveiliging-en-recherche/opleidingseisen",
      "https://www.justis.nl/producten/particuliere-beveiliging-en-recherche/toestemming-medewerkers/legitimatiebewijs",
      "https://www.uwv.nl/nl/voordelen-regelingen-werkgevers/proefplaatsing",
    ],
  },
};

export const PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE = {
  id: PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE_ID,
  version: 5,
  name: "Leerarbeidsovereenkomst (BBL) - CAO Particuliere Beveiliging",
  description: "Arbeidsovereenkomst voor bepaalde tijd voor een aspirant-beveiliger in de beroepsbegeleidende leerweg. De werknemer ontvangt loon en sluit daarnaast met school en erkend leerbedrijf een afzonderlijke praktijkovereenkomst.",
  template_type: "employment_contract",
  legal_document_type: "employment_agreement",
  is_employment_agreement: true,
  party_role_scheme: "employer_employee",
  learning_route_scope: "bbl",
  supports_fixed_term_only: true,
  cao_key: CAO_PARTICULIERE_BEVEILIGING_KEY,
  contract_model: "bbl_employment",
  body: PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE_BODY,
  required_placeholders: PB_BBL_EMPLOYMENT_REQUIRED_PLACEHOLDERS,
  legal_basis: {
    ...PB_FULLTIME_STANDARD_TEMPLATE.legal_basis,
    reviewed_at: "2026-07-22",
    applicability_note: "Uitsluitend voor BBL: een arbeidsovereenkomst met loon voor een aspirant in combinatie met een afzonderlijke praktijkovereenkomst tussen werknemer, erkend leerbedrijf en onderwijsinstelling. Deze universele standaardpreset wordt alleen voor bepaalde tijd aangeboden en de einddatum moet worden afgestemd op de praktijkovereenkomst. Een BBL-arbeidsovereenkomst voor onbepaalde tijd is niet categorisch verboden, maar vereist aanvullende afspraken over voortzetting na het einde van de opleiding en valt daarom buiten deze standaardpreset. Niet gebruiken voor een BOL-stage, proefplaatsing of andere artikel-14-stage.",
    sources: [
      ...PB_FULLTIME_STANDARD_TEMPLATE.legal_basis.sources,
      "https://www.rijksoverheid.nl/vraag-en-antwoord/middelbaar-beroepsonderwijs/moet-ik-stage-lopen-als-ik-een-mbo-opleiding-volg",
      "https://www.rijksoverheid.nl/vraag-en-antwoord/arbeidsovereenkomst-en-cao/wanneer-verandert-mijn-tijdelijke-arbeidscontract-in-een-vast-contract",
      "https://www.s-bb.nl/bedrijven/wat-is-een-leerbedrijf/verschil-bol-en-bbl/",
      "https://www.justis.nl/producten/particuliere-beveiliging-en-recherche/opleidingseisen",
    ],
  },
};

function templateContextValue(form = {}) {
  return [
    form.contract_model,
    form.employment_contract_model,
    form.employment_model_scope,
  ].map(value => String(value || "").trim().toLowerCase()).find(Boolean) || "";
}

export function isPbFulltimeStandardTemplateContext(form = {}) {
  if (form.template_type !== PB_FULLTIME_STANDARD_TEMPLATE.template_type) return false;
  if (form.cao_key !== PB_FULLTIME_STANDARD_TEMPLATE.cao_key) return false;

  return PB_FULLTIME_CONTRACT_MODEL_ALIASES.has(templateContextValue(form));
}

export function isPbParttimeStandardTemplateContext(form = {}) {
  if (form.template_type !== PB_PARTTIME_STANDARD_TEMPLATE.template_type) return false;
  if (form.cao_key !== PB_PARTTIME_STANDARD_TEMPLATE.cao_key) return false;

  return PB_PARTTIME_CONTRACT_MODEL_ALIASES.has(templateContextValue(form));
}

export function isPbParttimeGrowthStandardTemplateContext(form = {}) {
  if (form.template_type !== PB_PARTTIME_GROWTH_STANDARD_TEMPLATE.template_type) return false;
  if (form.cao_key !== PB_PARTTIME_GROWTH_STANDARD_TEMPLATE.cao_key) return false;

  return PB_PARTTIME_GROWTH_CONTRACT_MODEL_ALIASES.has(templateContextValue(form));
}

export function isPbMinMaxStandardTemplateContext(form = {}) {
  if (form.template_type !== PB_MIN_MAX_STANDARD_TEMPLATE.template_type) return false;
  if (form.cao_key !== PB_MIN_MAX_STANDARD_TEMPLATE.cao_key) return false;

  return PB_MIN_MAX_CONTRACT_MODEL_ALIASES.has(templateContextValue(form));
}

export function isPbZeroHoursStandardTemplateContext(form = {}) {
  if (form.template_type !== PB_ZERO_HOURS_STANDARD_TEMPLATE.template_type) return false;
  if (form.cao_key !== PB_ZERO_HOURS_STANDARD_TEMPLATE.cao_key) return false;

  return PB_ZERO_HOURS_CONTRACT_MODEL_ALIASES.has(templateContextValue(form));
}

export function isPbArticle14InternshipStandardTemplateContext(form = {}) {
  if (form.template_type !== PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE.template_type) return false;
  if (form.cao_key !== PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE.cao_key) return false;
  return PB_ARTICLE_14_INTERNSHIP_CONTRACT_MODEL_ALIASES.has(templateContextValue(form));
}

export function isPbBblEmploymentStandardTemplateContext(form = {}) {
  if (form.template_type !== PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE.template_type) return false;
  if (form.cao_key !== PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE.cao_key) return false;
  return PB_BBL_EMPLOYMENT_CONTRACT_MODEL_ALIASES.has(templateContextValue(form));
}

export function getStandardContractTemplatePresetById(id) {
  const normalizedId = String(id || "").trim();
  if (normalizedId === PB_FULLTIME_STANDARD_TEMPLATE_ID) return PB_FULLTIME_STANDARD_TEMPLATE;
  if (normalizedId === PB_PARTTIME_STANDARD_TEMPLATE_ID) return PB_PARTTIME_STANDARD_TEMPLATE;
  if (normalizedId === PB_PARTTIME_GROWTH_STANDARD_TEMPLATE_ID) return PB_PARTTIME_GROWTH_STANDARD_TEMPLATE;
  if (normalizedId === PB_MIN_MAX_STANDARD_TEMPLATE_ID) return PB_MIN_MAX_STANDARD_TEMPLATE;
  if (normalizedId === PB_ZERO_HOURS_STANDARD_TEMPLATE_ID) return PB_ZERO_HOURS_STANDARD_TEMPLATE;
  if (normalizedId === PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE_ID) return PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE;
  if (normalizedId === PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE_ID) return PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE;
  return null;
}

export function getStandardContractTemplatePreset(form = {}) {
  if (isPbFulltimeStandardTemplateContext(form)) return PB_FULLTIME_STANDARD_TEMPLATE;
  if (isPbParttimeStandardTemplateContext(form)) return PB_PARTTIME_STANDARD_TEMPLATE;
  if (isPbParttimeGrowthStandardTemplateContext(form)) return PB_PARTTIME_GROWTH_STANDARD_TEMPLATE;
  if (isPbMinMaxStandardTemplateContext(form)) return PB_MIN_MAX_STANDARD_TEMPLATE;
  if (isPbZeroHoursStandardTemplateContext(form)) return PB_ZERO_HOURS_STANDARD_TEMPLATE;
  if (isPbArticle14InternshipStandardTemplateContext(form)) return PB_ARTICLE_14_INTERNSHIP_STANDARD_TEMPLATE;
  if (isPbBblEmploymentStandardTemplateContext(form)) return PB_BBL_EMPLOYMENT_STANDARD_TEMPLATE;
  return null;
}
