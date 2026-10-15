# Bijdragen aan Uncensored

Bedankt voor je interesse in Uncensored. Bugreports, ideeën, documentatie en
codebijdragen zijn welkom.

## Lokaal opzetten

1. Installeer Node.js 18 of nieuwer.
2. Installeer de afhankelijkheden:

   ```powershell
   cd C:\Uncensored\extension
   npm install
   cd ..\server
   npm install
   ```

3. Maak `server\.env` aan op basis van `server\.env.example`.
4. Bouw de extensie met `cd C:\Uncensored\extension; npm run build`.
5. Start de backend met `cd C:\Uncensored\server; npm start`.
6. Laad de map `C:\Uncensored\extension` als unpacked extension in Chrome.

## Wijzigingen controleren

Voer voor een pull request minimaal de relevante controles uit:

```powershell
cd C:\Uncensored\extension
npm run build
cd ..\server
node --check server.js
```

Beschrijf in de pull request wat je hebt getest en vermeld bekende beperkingen.
Houd pull requests klein en gericht. Voeg waar mogelijk documentatie en
reproductiestappen toe.

## Issues en pull requests

Zoek eerst of een issue al bestaat. Gebruik voor nieuwe meldingen de
bijbehorende issue-sjablonen. Pull requests worden het liefst geopend tegen
`master` en moeten duidelijk maken welk probleem ze oplossen.
