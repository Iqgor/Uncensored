# Uncensored - Nieuws Samenvatter

[![Status: MVP](https://img.shields.io/badge/status-MVP-orange.svg)](https://github.com/Iqgor/Uncensored/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Een open-source Chrome-extensie die nieuwsartikelen uitleest en met behulp van
AI terugbrengt tot een korte samenvatting en kernpunten. Het project is een
vroege MVP en staat open voor feedback, bugreports en bijdragen.

> **Let op:** de eerste release is bedoeld voor lokaal gebruik. Er is nog geen
> gehoste productie-backend en de extensie is nog niet gepubliceerd in de
> Chrome Web Store.

## Lokaal starten

1. Installeer Node.js 18 of nieuwer.
2. Installeer de extensie-afhankelijkheden en bouw het content script:

   ```powershell
   cd C:\Uncensored\extension
   npm install
   npm run build
   ```

3. Start de lokale server:

   ```powershell
   cd C:\Uncensored\server
   npm start
   ```

4. Open in Chrome `chrome://extensions`.
5. Zet **Developer mode** aan.
6. Kies **Load unpacked** en selecteer `C:\Uncensored\extension`.
7. Open een nieuwsartikel en klik op de extensie.

De server gebruikt Gemini voor samenvattingen. Voeg API-sleutels nooit toe aan
de extensie zelf; gebruik daarvoor altijd de backend.

De extensie gebruikt Mozilla Readability om advertenties, navigatie en andere
niet-relevante paginaonderdelen beter van de artikeltekst te scheiden. Bij
pagina's waarop Readability geen artikel vindt, blijft een eenvoudige fallback
beschikbaar.

## Rate limiting en logging

De backend beperkt standaard het aantal samenvattingen tot 10 aanvragen per IP
per minuut. Pas dit lokaal aan met:

```text
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10
```

Elke aanvraag wordt als één JSON-regel gelogd met methode, route, status,
clientadres en duur. Artikeltekst, samenvattingen en API-sleutels worden niet
gelogd. De limiter gebruikt geheugen en is bedoeld voor de lokale MVP; voor
productie zijn gedeelde opslag, authenticatie en een privacybeleid nodig.

## Privacy

De extensie leest alleen de tekst van de actieve pagina wanneer de gebruiker
op **Artikel Samenvatten** klikt. De tekst wordt naar de lokale backend gestuurd
en vervolgens doorgestuurd naar Google Gemini om de samenvatting te genereren.
De huidige MVP gebruikt geen database. De backend houdt alleen tijdelijke
rate-limitdata in geheugen bij; de extensie gebruikt daarnaast een lokale
cache voor samenvattingen, zoals hieronder beschreven.

De serverlog bevat uitsluitend technische gegevens: HTTP-methode, route,
statuscode, verwerkingstijd en clientadres. Artikeltekst, AI-uitvoer en
API-sleutels worden niet gelogd. Google Gemini verwerkt de doorgestuurde tekst
volgens de voorwaarden en het privacybeleid van de gekozen Google-dienst.

De extensie bewaart samenvattingen maximaal 7 dagen lokaal in Chrome. De
cache wordt gekoppeld aan de pagina-URL, de uitgelezen artikeltekst en het
aantal kernpunten. Een gewijzigde artikelpagina of een andere samenvattingslengte
maakt daarom automatisch een nieuwe samenvatting.

Gebruik deze lokale MVP niet voor vertrouwelijke of gevoelige teksten. Voor
publieke productieversies moeten bewaartermijnen, gebruikersinformatie,
gegevensverwijdering en de gekozen hosting- en AI-verwerkers formeel worden
vastgelegd in een volledig privacybeleid.

## Volgende logische stappen

- Testen op dynamische pagina's, paywalls en pagina's zonder artikeltekst.

## Gemini configureren

Maak in `C:\Uncensored\server` een bestand met de naam `.env`, gebaseerd op
[.env.example](server/.env.example):

```text
GEMINI_API_KEY=jouw-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash-lite
PORT=8787
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10
```

Installeer daarna eenmalig de backend-afhankelijkheden:

```powershell
cd C:\Uncensored\server
npm install
npm start
```

De server gebruikt standaard `gemini-3.5-flash-lite`. Deel of commit `.env` of de
API-key nooit. Het bestand wordt door `.gitignore` uitgesloten.

## Samenvattingslengte

In de extensie kun je kiezen tussen 2, 4 of 6 kernpunten. De gekozen lengte
wordt naar de backend gestuurd en door Gemini exact aangehouden.

Na het samenvatten kun je de samenvatting naar het klembord kopiëren, opnieuw
laten genereren of het originele artikel openen. De knop **Opnieuw proberen**
blijft ook beschikbaar wanneer het samenvatten mislukt.

## Taal

Gemini detecteert automatisch de taal van het artikel. De titel, samenvatting
en kernpunten worden in dezelfde taal gegenereerd als de bron.

## Productie-mockup

Om de extensie in productie te stylen zonder Gemini-output te gebruiken, zet je
op de backend `NODE_ENV=production`. Het endpoint retourneert dan een vaste
voorbeeldsamenvatting met titel, tekst en kernpunten. In development blijft
`NODE_ENV=development` de standaard en wordt de echte Gemini-flow gebruikt.

## Meewerken

Ideeën, bugreports en pull requests zijn welkom. Lees eerst
[CONTRIBUTING.md](CONTRIBUTING.md) voor de lokale setup en de verwachtingen voor
bijdragen. Gebruik de issue-sjablonen voor gerichte bugreports en feature
requests.

## Release

De huidige stabiele MVP-release is
[v0.1.0](https://github.com/Iqgor/Uncensored/releases/tag/v0.1.0).
