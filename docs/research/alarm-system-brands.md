# Merkcatalogus alarmsystemen

Onderzoeksdatum: 4 augustus 2026

## Besluit

De installatiewizard gebruikt voor alarmsystemen een gecontroleerde catalogus van professionele merken die in Nederland en Europa regelmatig worden aangetroffen. De merknaam op de fysieke centrale is leidend. Productlijnen, voormalige namen en veelgebruikte schrijfwijzen zijn alleen zoek- en compatibiliteitsaliassen.

| Oude invoer | Canonieke merkoptie | Reden |
| --- | --- | --- |
| Ajax | Ajax Systems | Officiële organisatienaam; `Ajax` blijft als compatibiliteitsalias herkenbaar. |
| Alphatronics UNii | UNii | Alphatronics is het bedrijf achter UNii; UNii is de zichtbare systeemnaam. |
| Aritech ATS | Aritech | ATS en Advisor Advanced zijn productfamilies. |
| Honeywell Galaxy | Honeywell | Galaxy Flex en Galaxy Dimension zijn productfamilies. |
| Jablotron / Satel / Risco | JABLOTRON / SATEL / RISCO | Officiële schrijfwijze van de merken. |
| Vanderbilt SPC | Vanderbilt (legacy) of acre Security | De fysieke legacybranding blijft Vanderbilt; nieuwe SPC-positionering valt onder acre Security. |
| Bosch intrusion | Bosch (installed base) of Radionix | Bestaande Bosch-systemen blijven herkenbaar; Radionix is het nieuwe intrusionmerk van KEENFINITY. |

Een bestaande opgeslagen alias wordt niet stil herschreven wanneer een gebruiker alleen onderhouds- of codegegevens wijzigt. Nieuwe keuzes slaan wel de canonieke waarde op. Een onbekend merk blijft via `Ander merk` mogelijk. Als handmatige invoer overeenkomt met een bekende alias, vraagt de wizard om de officiële merkoptie te kiezen.

## UX- en datarichtlijnen

- Zoek op merk, productfamilie en historische alias; sla alleen de gekozen merkwaarde op.
- Toon actuele/ondersteunde merken apart van oudere of overgenomen merken.
- Houd logo's lokaal zodat de wizard niet afhankelijk is van externe tracking, hotlinks of beschikbaarheid.
- Gebruik transparante PNG's in een neutrale vaste tegel, zonder het merk te hertekenen of partnerstatus te suggereren.
- Behoud een tekstfallback als een asset onverwacht niet kan worden geladen.
- Registreer per asset bron, ophaaldatum en SHA-256 in `public/installation-brand-logos/alarm-system/manifest.json`.
- Gebruik de beeldmerken alleen ter identificatie van apparatuur. Controleer merkvoorwaarden opnieuw voordat logo's in publieke marketing of een klantportaal worden gebruikt.

## Primaire bronnen

- [Ajax Systems](https://ajax.systems/)
- [UNii over Alphatronics en UNii](https://unii-security.com/en/about-us/)
- [Aritech](https://aritech.com.au/)
- [Honeywell Galaxy](https://buildings.honeywell.com/gb/en/brands/our-brands/security/products/intruder-detection-systems/galaxy)
- [acre Security over de intrusion-branding](https://acresecurity.com/blog/acre-adopts-acre-intrusion-branding-to-boost-clarity-and-cohesion-in-product-lineup)
- [KEENFINITY over de introductie van Radionix](https://www.keenfinity-group.com/gb/en/news/press-room/keenfinity-launches-radionix-as-its-new-intrusion-systems-brand/)
- [Siemens Siveillance Intrusion](https://www.siemens.com/en-us/partners/buildings/consultants/planner-sales-consulting/building-security-planning/)
- [Johnson Controls beveiligingsmerken](https://www.johnsoncontrols.com/residential-and-smart-home/wired-and-wireless-security-systems)
- [Eaton Scantronic/i-on](https://www.eaton.com/gb/en-gb/catalog/safety-security-and-emergency-communications/wired-expandable-security-control-panels.html)
- [CCV BORG-E elektronische alarmering](https://hetccv.nl/keurmerken/inbraakbeveiliging/borg/documenten/)

De volledige logoherkomst staat naast de assets in de manifest- en README-bestanden. De catalogus is bewust geen wereldwijde uitputtende handelsmerkenlijst; de professionele NL/EU-dekking en handmatige fallback voorkomen dat een zeldzaam of nieuw merk het werkproces blokkeert.
