const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/g, // OpenAI-style keys
  /AIza[0-9A-Za-z_-]{30,}/g,  // Google API keys
  /Bearer\s+[a-zA-Z0-9_.-]{20,}/gi, // Bearer tokens
  /(api[_-]?key["':\s=]+)([a-zA-Z0-9_-]{16,})/gi, // Generic API key assignments
  /(password["':\s=]+)(["'][^"']+["']|[^\s,]+)/gi, // Generic passwords
];

/**
 * Redacts known secret patterns from strings.
 */
export function sanitizeString(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let sanitized = text;

  // Mask OpenAI keys
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{20,}/g, (match) => {
    return `${match.slice(0, 4)}...[REDACTED]...${match.slice(-4)}`;
  });

  // Mask Google API keys
  sanitized = sanitized.replace(/AIza[0-9A-Za-z_-]{30,}/g, (match) => {
    return `${match.slice(0, 4)}...[REDACTED]...${match.slice(-4)}`;
  });

  // Mask Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+([a-zA-Z0-9_\-\.]{8,})/gi, 'Bearer [REDACTED]');

  return sanitized;
}

/**
 * Deeply sanitizes any JavaScript object or primitive to prevent secret leaking in logs or error traces.
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return sanitizeString(obj) as unknown as T;
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('key') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('auth')
    ) {
      if (typeof value === 'string' && value.length > 6) {
        result[key] = `${value.slice(0, 3)}...[REDACTED]...${value.slice(-3)}`;
        continue;
      }
    }
    result[key] = sanitizeObject(value);
  }
  return result as T;
}

/**
 * Safely masks a stored API key for UI display (e.g. sk-••••••••1a2b).
 * Never exposes full key values.
 */
export function maskKey(key?: string): string | null {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    return null;
  }
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}
