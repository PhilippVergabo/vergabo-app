// Mirror von vergabo/lib/budgetRange.ts — Anbieter sehen NUR die grobe
// Budget-Klasse (Basis: budget_bis), nie die exakte Kostenschaetzung des
// Auftraggebers. Wettbewerblich/vergaberechtlich bewusst so.
//
// Zwischen Zahl und Euro-Zeichen steht ein geschuetztes Leerzeichen (U+00A0 —
// sieht aus wie ein normales, ist keines): Zahl und
// Einheit duerfen nie auf zwei Zeilen fallen (DIN 5008). Im Web stand das
// Euro-Zeichen sonst allein in der zweiten Zeile der Budget-Karte (Tester,
// 08.09.2026) — auf dem Telefon ist die Karte noch schmaler. Die Leerzeichen um
// den Gedankenstrich bleiben normal, dort darf umbrochen werden.
export function budgetRange(budget: number): string {
  if (budget <= 10000) return 'bis 10.000 €'
  if (budget <= 25000) return '10.000 – 25.000 €'
  if (budget <= 50000) return '25.000 – 50.000 €'
  if (budget <= 100000) return '50.000 – 100.000 €'
  return 'über 100.000 €'
}
