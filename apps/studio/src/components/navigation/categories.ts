import { CORE_CATEGORIES } from '@hattoriai/poney-core'

const LABELS: Record<string, string> = {
  overview: 'Overview',
  behavior: 'Behavior',
  data: 'Data',
  structure: 'Structure',
  capabilities: 'Capabilities',
}

/** Category names; extension categories are shown in sentence case. */
export function categoryLabel(category: string) {
  return LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ')
}

/** Core categories first, in their fixed order, then extension categories. */
export function orderCategories(categories: string[]) {
  const core = CORE_CATEGORIES.filter((c) => categories.includes(c))
  const rest = categories.filter((c) => !(CORE_CATEGORIES as readonly string[]).includes(c)).sort()
  return [...core, ...rest]
}
