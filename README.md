# Vergabo App

Anbieter-App zu [Vergabo](https://www.vergabo.de) — Ausschreibungen finden, Angebote abgeben, Nachweise verwalten.

**Stack:** Expo SDK 54 (CNG/managed, kein committed `ios/`/`android/`), Expo Router, Supabase, Web-API auf www.vergabo.de.

**Auslieferung:** Nur iOS / TestFlight (Pilotphase). Kein App-Store-/Play-Store-Upload.

## Setup

```bash
npm install
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_*, EXPO_PUBLIC_API_URL
npx expo start
```

Typen prüfen: `npx tsc --noEmit` · Lint: `npm run lint`

## Verteilung

Details und Fallstricke: **`CLAUDE.md`**. Kurzfassung:

| Änderung | Weg |
|---|---|
| Nur JS/TS/Styles/Assets | `eas update --branch production --message "…"` |
| Native Dep, Plugin, SDK | `git pull` → `eas build --platform ios --profile production` → prüfen → `eas submit` |

`runtimeVersion` nutzt Fingerprint-Policy. Nach nativem Build den OTA-Kanal neu bespielen. `eas.json`-Änderungen (z. B. `ascAppId`) verschieben den Fingerprint — nicht mitten in einem OTA-Zyklus.

## Architektur (kurz)

- **Supabase:** Auth, RLS-scoped Reads (Aufträge, Bewerbungen, Eigenerklärungen, …)
- **Web-API** (`authedFetch`): Login/Captcha, Angebots-Submit, Admin, Datei-Verifikation, bid-sichere Auftragsdaten
- **Nie direkt lesen:** `budget_von`, `budget_bis`, `haushaltsstelle`, `kostenschaetzung` — über `src/lib/auftragOeffentlich.ts`

## Doppelt gehaltene Regeln (vs. Web-Repo)

Beim Anfassen im Web (`../vergabo`) hier gegenprüfen:

| App | Web |
|---|---|
| `src/lib/labels.ts` | `lib/verfahren.ts`, `lib/gewerke.ts` |
| `src/lib/bewerbung.ts` (`EINHEITEN`) | `lib/einheiten.ts` |
| `src/lib/eigenerklarungTypen.ts` | `lib/eigenerklarungTypen.ts` |
| `src/lib/nachweisGueltigkeit.ts` | `lib/nachweisGueltigkeit.ts` |

## EAS

- Projekt-ID: `36bb5ba6-6445-4ae5-ac40-0c9785b538c9`
- Owner: `vergabo`
- Bundle-ID: `de.vergabo.app`
