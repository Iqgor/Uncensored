# Bijdragen aan Uncensored

Bedankt voor je interesse in Uncensored. Bugreports, ideeën, documentatie en
codebijdragen zijn welkom.

## Lokaal opzetten

1. Installeer Node.js 20 (LTS) of nieuwer.
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

Voer voor een pull request minimaal dezelfde controles uit als in CI:

```powershell
cd C:\Uncensored\extension
npm ci
npm run build
cd ..\server
npm ci
node --check server.js
cd ..\
node --check extension\background.js
node --check extension\content-source.js
node --check extension\popup.js
git diff --exit-code -- extension/content.js
```

Beschrijf in de pull request wat je hebt getest en vermeld bekende beperkingen.
Houd pull requests klein en gericht. Voeg waar mogelijk documentatie en
reproductiestappen toe.

## Releasepakket

Releases worden opgebouwd door GitHub Actions via tags in de vorm `vX.Y.Z`. De
workflow valideert dat `extension/manifest.json` dezelfde versie bevat en uploadt
zowel een unpacked extensiemap als een zip-artefact met die versie.

## Issues en pull requests

Zoek eerst of een issue al bestaat. Gebruik voor nieuwe meldingen de
bijbehorende issue-sjablonen. Pull requests worden het liefst geopend tegen
`master` en moeten duidelijk maken welk probleem ze oplossen.
