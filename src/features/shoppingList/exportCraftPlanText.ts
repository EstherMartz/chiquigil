import type { CraftPlan } from './buildCraftPlan';

/**
 * Renders the whole craft plan as a plain-text list, one `Nx Name` per line,
 * in Craft → Gather → Buy order. Quantities are the item amounts needed (the
 * craft bucket uses output qty, not synthesis count), so the list reads like a
 * Teamcraft-style material dump you can paste anywhere.
 */
export function exportCraftPlanText(plan: CraftPlan, nameById: Map<number, string>): string {
  const name = (id: number) => nameById.get(id) ?? `Item #${id}`;
  const lines: string[] = [];
  for (const [id, c] of plan.craft) lines.push(`${c.qty}x ${name(id)}`);
  for (const [id, g] of plan.gather) lines.push(`${g.qty}x ${name(id)}`);
  for (const [id, qty] of plan.buy) lines.push(`${qty}x ${name(id)}`);
  return lines.join('\n');
}
