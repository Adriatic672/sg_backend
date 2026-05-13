import rateLimit from 'express-rate-limit';
import { Request } from 'express';

export const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 1000,
    message: { status: 429, message: 'Too many requests, please try again later.' },
});

// Stricter limiter for financial mutation endpoints (withdrawal, transfer).
// Keyed by userId when authenticated, falling back to IP.
export const financialLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,   // 5-minute window
    max: 10,                    // 10 attempts per window
    keyGenerator: (req: Request) => {
        const user = (req as any).user;
        return user?.userId || user?.user_id || req.ip || 'unknown';
    },
    message: { status: 429, message: 'Too many financial requests. Please wait a few minutes before trying again.' },
    standardHeaders: true,
    legacyHeaders: false,
});
