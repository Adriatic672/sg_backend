
import rateLimit from 'express-rate-limit';

export const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 5 minutes
    max: 1000, // limit each IP to 100 requests per windowMs
    message: "Too many requests, please try again later."
});
