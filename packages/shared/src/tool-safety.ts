import type { ToolAccessPolicy, ToolAnnotations, ToolRisk } from './types.js';

export function getToolRisk(annotations: ToolAnnotations): ToolRisk {
  if (annotations.destructiveHint) return 'destructive';
  return annotations.readOnlyHint ? 'read' : 'write';
}

export function isToolAllowed(annotations: ToolAnnotations, policy: ToolAccessPolicy): boolean {
  return policy === 'full' || (annotations.readOnlyHint && !annotations.destructiveHint);
}
