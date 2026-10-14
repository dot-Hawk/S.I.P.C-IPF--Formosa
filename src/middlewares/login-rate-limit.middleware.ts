import { type Request, type RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export interface LoginRateLimitOptions {
  windowMs: number;
  maxFailuresPerIp: number;
  maxFailuresPerAccount: number;
}

const DEFAULT_OPTIONS: LoginRateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  maxFailuresPerIp: 30,
  maxFailuresPerAccount: 5,
};

const MAX_EMAIL_KEY_LENGTH = 254;

function clientIp(req: Request): string {
  return ipKeyGenerator(req.ip ?? "unknown");
}

function accountKey(req: Request): string {
  const email = req.body?.email;
  const normalized = typeof email === "string" ? email.trim().toLowerCase().slice(0, MAX_EMAIL_KEY_LENGTH) : "";
  return `${clientIp(req)}|${normalized}`;
}

// Only failed attempts count (successful logins are skipped), so legitimate use is never throttled.
// Two layers: a generous per-IP cap against credential stuffing across many emails, and a strict
// per-IP+email cap against guessing one account's password. The account key includes the IP so an
// attacker cannot lock a legitimate user out from another address.
export function createLoginRateLimiters(
  options: LoginRateLimitOptions = DEFAULT_OPTIONS,
): RequestHandler[] {
  const common = {
    windowMs: options.windowMs,
    standardHeaders: "draft-7" as const,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: ((_req, res) => {
      res.status(429).json({ message: "Too many failed login attempts, please try again later" });
    }) satisfies RequestHandler,
  };

  const perIp = rateLimit({ ...common, limit: options.maxFailuresPerIp, keyGenerator: clientIp });
  const perAccount = rateLimit({
    ...common,
    limit: options.maxFailuresPerAccount,
    keyGenerator: accountKey,
  });

  return [perIp, perAccount];
}
