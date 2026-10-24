export type RouteCategory =
  | 'conversation'
  | 'workspace_read'
  | 'small_change'
  | 'engineering'
  | 'clarify_or_authorize';

export type RouteProfile = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

export type RouteRisk = 'low' | 'medium' | 'high';

export type RouteNeed = 'workspace' | 'write' | 'terminal' | 'network';

export interface RouteDecision {
  category: RouteCategory;
  profile: RouteProfile;
  confidence: number; // 0..1
  targets: string[]; // paths or symbols mentioned, resolved against the workspace
  needs: RouteNeed[];
  risk: RouteRisk;
  clarification?: string; // one focused question, only for clarify_or_authorize
  reason: string;
}

export function validateRouteDecision(obj: unknown): RouteDecision {
  if (!obj || typeof obj !== 'object') {
    throw new Error('RouteDecision must be a non-null object');
  }

  const d = obj as Partial<RouteDecision>;

  const validCategories: RouteCategory[] = [
    'conversation',
    'workspace_read',
    'small_change',
    'engineering',
    'clarify_or_authorize',
  ];
  if (!d.category || !validCategories.includes(d.category)) {
    throw new Error(`Invalid RouteDecision.category: ${d.category}`);
  }

  const validProfiles: RouteProfile[] = ['S1', 'S2', 'S3', 'S4', 'S5'];
  if (!d.profile || !validProfiles.includes(d.profile)) {
    throw new Error(`Invalid RouteDecision.profile: ${d.profile}`);
  }

  const confidence = typeof d.confidence === 'number' ? Math.max(0, Math.min(1, d.confidence)) : 0.8;
  const targets = Array.isArray(d.targets) ? d.targets.map(String) : [];
  const needs = Array.isArray(d.needs) ? (d.needs as RouteNeed[]) : [];
  const risk: RouteRisk = d.risk === 'high' || d.risk === 'medium' ? d.risk : 'low';
  const reason = typeof d.reason === 'string' && d.reason.trim().length > 0 ? d.reason.trim() : 'Route selected by RequestRouter';

  return {
    category: d.category,
    profile: d.profile,
    confidence,
    targets,
    needs,
    risk,
    clarification: typeof d.clarification === 'string' ? d.clarification.trim() : undefined,
    reason,
  };
}
