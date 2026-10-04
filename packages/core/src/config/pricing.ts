import { PricingTable } from '../types/usage.js';

/**
 * Standard centralized pricing table (USD per 1M tokens)
 * Derived from official OpenAI and Google Gemini pricing benchmarks.
 */
export const DEFAULT_PRICING_TABLE: PricingTable = {
  // OpenAI Models
  'gpt-4o': {
    inputPerMillion: 2.50,
    outputPerMillion: 10.00,
  },
  'gpt-4o-mini': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
  },
  'o1': {
    inputPerMillion: 15.00,
    outputPerMillion: 60.00,
  },
  'o1-mini': {
    inputPerMillion: 3.00,
    outputPerMillion: 12.00,
  },
  'o3-mini': {
    inputPerMillion: 1.10,
    outputPerMillion: 4.40,
  },

  // Google Gemini Models
  'gemini-2.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.00,
  },
  'gemini-2.5-flash': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
  },
  'gemini-1.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.00,
  },
  'gemini-1.5-flash': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
  },
};

/**
 * Calculate estimated cost in USD based on input and output tokens and model name.
 */
export function calculateEstimatedCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  customPricing?: PricingTable
): number {
  const table = customPricing || DEFAULT_PRICING_TABLE;
  const pricing = table[model] || {
    // Fallback baseline for unknown models
    inputPerMillion: 1.00,
    outputPerMillion: 3.00,
  };

  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion;

  // Round to 6 decimal places
  return Math.round(cost * 1_000_000) / 1_000_000;
}
