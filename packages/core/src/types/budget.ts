import { RouteProfile } from './route.js';

export interface RouteBudget {
  profile: RouteProfile;
  timeoutMs: number;
  maxTokens: number;
  maxModelCalls: number;
  maxToolCalls: number;
}

export const ROUTE_BUDGETS: Record<RouteProfile, RouteBudget> = {
  S1: {
    profile: 'S1',
    timeoutMs: 10_000,
    maxTokens: 4_000,
    maxModelCalls: 2,
    maxToolCalls: 0,
  },
  S2: {
    profile: 'S2',
    timeoutMs: 15_000,
    maxTokens: 8_000,
    maxModelCalls: 3,
    maxToolCalls: 5,
  },
  S3: {
    profile: 'S3',
    timeoutMs: 90_000,
    maxTokens: 16_000,
    maxModelCalls: 15,
    maxToolCalls: 20,
  },
  S4: {
    profile: 'S4',
    timeoutMs: 300_000,
    maxTokens: 32_000,
    maxModelCalls: 30,
    maxToolCalls: 40,
  },
  S5: {
    profile: 'S5',
    timeoutMs: 5_000,
    maxTokens: 2_000,
    maxModelCalls: 1,
    maxToolCalls: 0,
  },
};
