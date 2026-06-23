export interface PlanLimits {
  maxWebsites: number;
  historyDays: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free:       { maxWebsites: 1,        historyDays: 7 },
  pro:        { maxWebsites: 3,        historyDays: 90 },
  enterprise: { maxWebsites: Infinity, historyDays: 365 },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS['free']!;
}
