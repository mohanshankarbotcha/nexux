import crypto from 'node:crypto';
import { Request } from 'express';

let inMemoryToken: string | null = null;

export function getOrCreateApiToken(): string {
  if (process.env.NEXUS_API_TOKEN && process.env.NEXUS_API_TOKEN.trim().length > 0) {
    return process.env.NEXUS_API_TOKEN.trim();
  }
  if (!inMemoryToken) {
    inMemoryToken = crypto.randomBytes(32).toString('hex');
  }
  return inMemoryToken;
}

export function setApiToken(token: string): void {
  inMemoryToken = token;
  process.env.NEXUS_API_TOKEN = token;
}

/**
 * Validates request token in constant time using crypto.timingSafeEqual
 */
export function validateRequestToken(req: Request): boolean {
  const expectedToken = getOrCreateApiToken();

  // Check headers: X-Nexus-Token or Authorization: Bearer <token>
  let suppliedToken: string | undefined = req.headers['x-nexus-token'] as string | undefined;

  if (!suppliedToken && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      suppliedToken = parts[1];
    }
  }

  // Also support query param for SSE streams (GET /events)
  if (!suppliedToken && req.query && typeof req.query.token === 'string') {
    suppliedToken = req.query.token;
  }

  if (!suppliedToken) {
    return false;
  }

  const expectedBuf = Buffer.from(expectedToken, 'utf8');
  const suppliedBuf = Buffer.from(suppliedToken.trim(), 'utf8');

  if (expectedBuf.length !== suppliedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}
