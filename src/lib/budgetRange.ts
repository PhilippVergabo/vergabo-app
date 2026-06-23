// Mirror von vergabo/lib/budgetRange.ts — Anbieter sehen NUR die grobe
// Budget-Klasse (Basis: budget_bis), nie die exakte Kostenschaetzung des
// Auftraggebers. Wettbewerblich/vergaberechtlich bewusst so.
export function budgetRange(budget: number): string {
  if (budget <= 10000) return 'bis 10.000 €'
  if (budget <= 25000) return '10.000 – 25.000 €'
  if (budget <= 50000) return '25.000 – 50.000 €'
  if (budget <= 100000) return '50.000 – 100.000 €'
  return 'über 100.000 €'
}
