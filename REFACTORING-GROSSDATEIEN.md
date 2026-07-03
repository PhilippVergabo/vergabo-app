# Refactoring-Plan: Groß-Datei-Aufteilung (App)

Vorbereitet 2026-07-04 (Analyse-Stand: Commit `d96b253`). Zwei Etappen, je eigener
Commit; nach jeder: `npx tsc --noEmit` + manueller Smoke-Test auf dem Gerät.
Grundregel: reines Verschieben, KEINE Verhaltensänderung, identisches Rendering.

## Etappe 1 — Angebots-Sektionen (bewerben.tsx 709 Z. + bearbeiten.tsx 782 Z.)

Die beiden Screens teilen ~80 % der Logik. Statt zwei getrennter Aufteilungen:
gemeinsame Sektions-Komponenten unter `src/components/angebot/`:

| Neu | Quelle (bearbeiten / bewerben) | Props |
|---|---|---|
| `NachweisSektion.tsx` | 428–523 / 369–452 (fast identisch) | kriterien, nachweisProfilMatch, nachweisDateien, setNachweisDateien, optional vorhandenUpload |
| `VerpflichtungenSektion.tsx` | 525–572 / 454–501 (identisch) | verpflichtungen, bestaetigt, offen + Setter; optional bestehend (nur bearbeiten) |
| `AnhaengeSektion.tsx` | 614–633 / 543–562 (identisch) | anhaenge, setAnhaenge (+ dateiWaehlen aus lib/bewerbung) |
| `KalkulationSektion.tsx` | 403–426 / 345–367 | hatLv, lvPositionen, lvPreise, positionen + Setter |

In den Screens bleiben: Laden (unterschiedliche Quellen), handleSubmit
(POST vs. PATCH — NICHT zusammenlegen), Success-/Loading-Phasen, Bindefrist-
Warnung, Basis-Textfelder (Ausführungszeitraum/Beschreibung/Referenzen dürfen
optional als 5. Komponente `BasisFelder.tsx`, wenn Props schmal bleiben).
Ziel: beide Screens < 400 Zeilen.

Smoke-Test: Angebot abgeben (mit Nachweis-Upload + LV) UND Angebot bearbeiten
(bestehende Nachweise sichtbar, Speichern) auf dem Gerät.

## Etappe 2 — admin.tsx (612 Z.)

| Neu | Quelle | Hinweis |
|---|---|---|
| `src/components/admin/NachweisBadge.tsx` | 121–132 | pure |
| `src/components/admin/NachweisListe.tsx` | 414–457 | nur tab==='anbieter'; Props: dokumente, offen, laedt, onToggle |
| `src/components/admin/AdminKarte.tsx` | 388–494 | Props: item, tab, busy, Callbacks + Nachweis-Props |

NICHT trennen: 2FA-Phase-Machine (117–204) + MFA-UI (318–355) — sicherheits-
kritisch, bleibt zentral im Screen; ebenso TAB_CONFIG + setVerifiziert/ladeListe.
Ziel: admin.tsx ~400 Zeilen.

Smoke-Test: Admin öffnen → 2FA → beide Tabs, Nachweise aufklappen + Datei öffnen,
verifizieren/sperren.
