@AGENTS.md

# Vergabo-App — Verteilung & Releases

Anbieter-App zu Vergabo (Expo SDK 54, CNG/managed — es gibt bewusst **keine**
`ios/`- oder `android/`-Ordner, der native Code wird beim Build erzeugt).

## Wie die App zu den Nutzern kommt

- **Nur iOS, nur TestFlight.** Es gab bisher **keinen** Store-Upload (weder App
  Store noch Play Store). Stand: Pilotphase 2026.
- EAS-Projekt-ID: `36bb5ba6-6445-4ae5-ac40-0c9785b538c9`, Owner `vergabo`.

## Zwei Wege, eine Änderung auszuliefern

**1. OTA-Update (der Normalfall)** — für alles, was nur JS/TypeScript, Styles
oder Assets betrifft:

```bash
eas update --branch production --message "Kurzbeschreibung"
```

Landet bei installierten Builds beim nächsten App-Start. Kein TestFlight, keine
Wartezeit, kein Zutun der Tester.

**2. Nativer Build** — nur nötig, wenn sich der native Unterbau ändert: neue
Native-Dependency, SDK-Upgrade, Änderung an `app.json`-Plugins/Icons/Berechtigungen.

⚠️ **Vor dem Build IMMER den aktuellen Stand holen** — `eas build` baut aus dem
lokalen HEAD. Wird gebaut, bevor ein gemergter PR lokal angekommen ist, entsteht
ein Build aus dem alten Stand (schon passiert: ein Build ohne `expo-updates`,
kompletter TestFlight-Zyklus umsonst).

```bash
git pull
npm install                      # falls sich Dependencies geändert haben
eas build --platform ios --profile production
```

**Nach dem Build den tatsächlich gebauten Stand gegenprüfen**, bevor submitten:

```bash
eas build:list --limit 1 --json --non-interactive | \
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s)[0];console.log('commit',b.gitCommitHash?.slice(0,7),'| runtime',b.runtimeVersion,'| channel',b.channel)})"
```

- `gitCommitHash` muss der erwartete Stand sein (nicht der von vor dem Merge).
- `runtimeVersion` und `channel` dürfen **nicht** `undefined` sein — sonst wurde
  ohne `expo-updates`/Kanal gebaut, der Build kann kein OTA empfangen.
- Die Runtime muss zu der des OTA-Kanals passen (`eas update:list --branch production`).
  Lokal nachrechenbar: `npx expo-updates fingerprint:generate --platform ios`.

Erst wenn das stimmt:

```bash
eas submit --platform ios --latest
```

## Warum das automatisch richtig entschieden wird

`app.json` nutzt `runtimeVersion: { policy: "fingerprint" }`. Die Runtime-Version
wird aus dem tatsächlichen nativen Projektzustand berechnet. Ändert sich nichts
Natives, bleibt der Fingerprint gleich und das OTA-Update passt garantiert. Ändert
sich etwas Natives, ändert sich der Fingerprint — alte Builds bekommen das Update
dann gar nicht erst, statt daran zu zerbrechen.

**Daraus folgt:** Nach einem nativen Build muss auch der OTA-Kanal neu bespielt
werden, sonst laufen alte und neue Builds auf unterschiedlichen Fingerprints
auseinander.

Kanäle sind in `eas.json` an die Build-Profile gebunden (`production`, `preview`).

⚠️ **Der Fingerprint umfasst mehr als nur nativen Code** — u. a. `eas.json`, Teile
der `package.json`-`scripts`, `app.json` und die installierten Native-Module. Wer
z. B. das `lint`-Skript ändert oder eine Dependency hinzufügt, verschiebt womöglich
die `runtimeVersion`. Dann brauchen laufende OTA-Updates einen frischen Build als
Partner. Faustregel: Build + OTA-Beweis abschließen, **bevor** solche Änderungen
gemergt werden — nicht mittendrin. Nachrechnen mit
`npx expo-updates fingerprint:generate --platform ios`.

## Fallstricke

- `npm run lint` (= `expo lint`) **funktioniert** — ESLint ist eingerichtet
  (`eslint` + `eslint-config-expo` in den devDependencies, Flat-Config in
  `eslint.config.js`). Nach frischem Checkout `npm install` nicht vergessen.
  Historischer Fallstrick: Fehlt ESLint, schreibt `expo lint` beim Fehlschlag
  ungefragt `eslint` + `eslint-config-expo` in die `package.json`, ohne sie zu
  installieren — so entstandene Zeilen nie committen. Neue Lint-Dev-Deps immer
  via `npx expo install -- --save-dev <pkg>` (wählt SDK-kompatible Versionen).
- ⚠️ **`eas submit --non-interactive` verlangt `ascAppId` in der `eas.json` — nicht einfach eintragen.** Die `eas.json` fließt in den Fingerprint ein: Ein nachträglicher Eintrag verschiebt die `runtimeVersion` und **koppelt den bereits gebauten Build vom OTA-Kanal ab** (geprüft am 30.08.2026: `4ff8dc27…` → `bb02aa4d…`). Entweder interaktiv submitten (`eas submit --platform ios --latest`) oder den Eintrag zusammen mit dem **nächsten** nativen Build vornehmen, wenn der Fingerprint ohnehin neu berechnet wird. App-Store-Connect-ID: `6796830894`.
- Typprüfung geht: `npx tsc --noEmit`.
- Das Web-Backend (`/api/*` auf www.vergabo.de) ist ein **eigenes Repo**
  (`../vergabo`). Änderungen an API-Verträgen immer auf beiden Seiten denken —
  und beachten, dass alte App-Builds noch lange im Umlauf sind.
