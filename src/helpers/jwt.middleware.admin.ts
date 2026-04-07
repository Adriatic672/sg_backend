import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import { setItem, getItem } from "../helpers/connectRedis";
config();
const JWT_SECRET: any = process.env.JWT_SECRET;

export class JWTMiddlewareAdmin {
    static verifyToken(req: Request, res: Response, next: NextFunction) {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).send({ message: "No authorization header provided." });
        }

        const parts = authHeader.split(' ');

        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).send({ message: "Token format is 'Bearer <token>'." });
        }

        const token = parts[1];

        jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
            if (err) {
              //  return res.status(401).send({ message: "Unauthorized." });
            }
            console.log(`decoded`, decoded)
            req.body.userId = decoded.user_id;
            const role = decoded.role || "user"
            if (role != "admin") {
               // return res.status(401).send({ message: "Unauthorized  user role" });
            }

            next();
        });
    }
}
