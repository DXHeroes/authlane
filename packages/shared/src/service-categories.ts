/**
 * The one vocabulary a connectable thing is filed under.
 *
 * There used to be two, and they did not agree: the MCP preset registry had eight values keyed on
 * what a server does, while the hosted connect widget carried its own six-value list hardcoded in
 * a component. A service could therefore be `engineering` in one place and `development` in the
 * other, and nothing in the type system noticed. This list is the superset both now import, so a
 * category assigned in `integrations/<id>/config.yaml` is the same category the widget filters on.
 *
 * Ordering is the order a picker should offer them in: the categories most end users connect first.
 */
export const SERVICE_CATEGORIES = [
  'communication',
  'productivity',
  'crm',
  'engineering',
  'storage',
  'finance',
  'design',
  'infrastructure',
  'observability',
  'security',
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

const serviceCategorySet = new Set<string>(SERVICE_CATEGORIES);

export function isServiceCategory(value: unknown): value is ServiceCategory {
  return typeof value === 'string' && serviceCategorySet.has(value);
}
