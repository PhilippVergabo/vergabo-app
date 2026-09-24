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

## ⚠️ Doppelt gehaltene Regeln — Abgleich mit dem Web-Repo

Mehrere fachliche Regeln liegen **zweimal** vor: einmal im Web (`../vergabo`),
einmal hier. Das ist gewollt (die App soll ohne Netz rechnen können), läuft aber
still auseinander — beim Abgleich am 11.09.2026 waren vier Stellen veraltet,
darunter eine rechtlich relevante Verfahrensbezeichnung.

| Hier | Gegenstück im Web | Worauf achten |
|---|---|---|
| `src/lib/labels.ts` → `verfahrenLabel` | `lib/verfahren.ts` | Bezeichnung hängt an der **Leistungsart**: „Freihändige Vergabe" (VOB/A) vs. „Verhandlungsvergabe" (UVgO) |
| `src/lib/bewerbung.ts` → `EINHEITEN` | `lib/einheiten.ts` | Liste UND Reihenfolge — die App schaltet per Tippen durch |
| `src/lib/eigenerklarungTypen.ts` | `lib/eigenerklarungTypen.ts` | Neue Typen, `pflicht`/`kannAblaufen`/`belegbar` |
| `src/lib/nachweisGueltigkeit.ts` | `lib/nachweisGueltigkeit.ts` | Warnfenster (30 Tage), Statusnamen, Hinweistexte |
| `src/lib/labels.ts` → `GEWERK_LABELS` | `lib/gewerke.ts` | Schlüssel und Labels |

**Beim Anfassen einer dieser Dateien im Web immer hier gegenprüfen.** Ein
schneller Abgleich:

```bash
diff ../vergabo/lib/eigenerklarungTypen.ts src/lib/eigenerklarungTypen.ts
```

⛔ **Die interne Kalkulation liest die App NIE direkt** (seit 21.09.2026).
`budget_von`, `budget_bis`, `haushaltsstelle` und `kostenschaetzung` in
`auftraege` sind die Kalkulation der Vergabestelle — `budget_bis` ist meist die
exakte Summe der Kostenschätzung, nicht die veröffentlichte Stufe. Das
Sicherheits-Audit des Web-Repos entzieht dem Browser diese Spalten
(`../vergabo/docs/sicherheits-audit-migrationen.sql`, Schritt 2), und ein
fehlendes Spaltenrecht lässt in Postgres die **ganze** Abfrage scheitern, nicht
nur die Spalte. Die App las bis zu diesem Tag `budget_bis` (Startliste,
Auftragsdetail) und `kostenschaetzung` (Angebot abgeben/bearbeiten) direkt — nach
dem Entzug wären genau diese Bildschirme tot gewesen. Seither:

- Budgetstufe über `/api/auftrag/budgetstufen` (eine Anfrage für die ganze Liste),
- Auftrag + Positionsvorlage **ohne Preise** über `/api/auftrag/bieteransicht/[id]`,

beides gekapselt in `src/lib/auftragOeffentlich.ts`. Die eigene Kopie
`src/lib/budgetRange.ts` ist entfallen — die Stufen gibt es nur noch im Web, eine
doppelt gehaltene Regel weniger. **Wer eine neue Abfrage auf `auftraege`
schreibt, fordert keine dieser vier Spalten an.**

⚠️ **Eine Push-Nachricht ohne Gegenstück in der App ist auch Drift.** Am
11.09.2026 gefunden: Der Cron verschickt „📄 Nachweis läuft bald ab – bitte
aktualisieren Sie ihn", die App las `eigenerklarungen.gueltig_bis` aber gar
nicht. Der Betrieb bekam die Benachrichtigung, öffnete die App und fand keine
Stelle, an der stand, **welcher** Nachweis gemeint war. Die Nachweisliste zeigt
die Gültigkeit jetzt an (nur Anzeige, gesetzt wird sie im Browser). **Beim
Anlegen eines neuen Benachrichtigungstyps im Web mitdenken, ob die App zeigen
kann, worum es geht** — sie empfängt jede In-App-Benachrichtigung als Push.

⚠️ **„Eigenerklärung ohne Datei" ist überall derselbe Sonderfall — an drei Stellen.** Ein angehakter Nachweis ohne hochgeladenes Dokument kann von niemandem geprüft werden; die Erklärung selbst ist der Nachweis. Deshalb: `components/admin/NachweisBadge.tsx` (`istOffenerNachweis` — kein Badge „in Prüfung", keine Freigabe-Knöpfe, nicht mitgezählt), `src/app/eigenerklarungen.tsx` (Anbieter-Sicht: „✓ bestätigt" statt „⏳ in Prüfung" — sonst wartet der Betrieb auf einen Zustand, der nie eintritt; seit 24.09.2026), und im Web `/api/app-admin/anbieter` (`.not('dateiname','is',null)` bei der Zählung) plus `/api/app-admin/eigenerklarungen` (Feld `pruefung_noetig`). **Wer eine dieser Stellen anfasst, prüft die anderen mit.**

⚠️ **Beim Ersetzen einer Datei leert die App `gueltig_bis`.** Das Datum gehörte
zum alten Dokument; stehen zu lassen hieße, die neue Police mit der Laufzeit der
alten zu beschriften. Die App kann kein Datum erfassen (dafür bräuchte es einen
Datepicker) — kein Datum ist ehrlicher als ein falsches, und die Anzeige sagt
„nicht hinterlegt (im Browser ergänzbar)". **Wer der App das Erfassen beibringt,
nimmt diese Zeile mit heraus.**

⚠️ **Nicht jede Web-Änderung gehört in die App.** Archiv-Ansicht und
Admin-Abrechnung gibt es hier bewusst nicht — das ist nicht portierter
Funktionsumfang, kein Drift. Unterschieden wird danach, ob **dieselbe Regel**
zwei Antworten gibt (Drift, gehört abgeglichen) oder ob eine Funktion schlicht
fehlt (Produktentscheidung).
