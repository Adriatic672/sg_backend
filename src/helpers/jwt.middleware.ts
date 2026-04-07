import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import { setItem, getItem } from "../helpers/connectRedis";
import Model from './model';
config();
const JWT_SECRET: any = process.env.JWT_SECRET;

export class JWTMiddleware {



    static verifyTokenAccess(req: Request, res: Response, next: NextFunction) {
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
                return res.status(401).send({ message: "Unauthorized." });
            }
            console.log(`decoded`, decoded)
            req.body.userId = decoded.user_id;
            req.body.username = req.body.username || decoded.user_id;
            const type = decoded.type
            if (type != "refresh") {
                return res.status(401).send({ message: "Invalid refresh token" });
            }

            next();
        });
    }


    static verifyTemporaryToken(req: Request, res: Response, next: NextFunction) {
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
                return res.status(401).send({ message: "Unauthorized." });
            }
            req.body.userId = decoded.user_id;
            const role = decoded.role || "user"
            if (role != "brand") {
                //  return res.status(401).send({ message: "Unauthorized  user role" });
            }
            req.body.username = req.body.username || decoded.username;

            const type = decoded.type
            if (type != "temporary") {
                return res.status(401).send({ message: "Invalid temporary token" });
            }



            next();
        });
    }

    static verifyBrandToken(req: Request, res: Response, next: NextFunction) {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).send({ message: "No authorization header provided." });
        }

        const parts = authHeader.split(' ');

        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).send({ message: "Token format is 'Bearer <token>'." });
        }

        const token = parts[1];

        jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
            if (err) {
                return res.status(401).send({ message: "Unauthorized." });
            }
            req.body.userId = decoded.user_id;
            req.body.role = decoded.role;
            req.body.agentId = decoded.agentId;
            req.body.type = decoded.type;
            const type = decoded.type

            const role = decoded.role || "user"

            if (role == 'agent') {
                req.body.agentId = decoded.agentId;
            }

            if (role != "brand" && role != "agent") {
                return res.status(401).send({ message: "User not allowed to access this resource" });
            }
            req.body.username = req.body.username || decoded.username;

            if (type != "access" && type != "temporary") {
                return res.status(401).send({ message: "Invalid access token" });
            }

            if (req.body.userId && req.body.userId.length > 2) {
                const deleteAccounts: any = await new Model().callQuerySafe(`select * from deleted_users where user_id=?`, [req.body.userId])
                if (deleteAccounts.length > 0) {
                    return res.status(401).send({ message: "User is deactivated" });
                }
            }



            next();
        });
    }

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

        jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
            if (err) {
                return res.status(401).send({ message: "Unauthorized." });
            }
            console.log(`decoded`, decoded)
            const userId = decoded.user_id
            req.body.userId = userId;
            req.body.username = req.body.username || decoded.username;
            req.body.role = decoded.role;
            req.body.agentId = decoded.agentId;
            req.body.type = decoded.type;



            const role = decoded.role
            if (role != "user") {
                //   return res.status(401).send({ message: "Unauthorized  user role" });
            }



            const type = decoded.type
            if (type != "access" && type != "temporary") {
                return res.status(401).send({ message: "Invalid access token" });
            }


            if (req.body.userId && req.body.userId.length > 2) {
                const deleteAccounts: any = await new Model().callQuerySafe(`select * from deleted_users where user_id=?`, [req.body.userId])
                if (deleteAccounts.length > 0) {
                    return res.status(401).send({ message: "User is deactivated" });
                }
            }

            /*
            const userInfo = await getItem(`jwt_${userId}`);
            if (!userInfo) {
                return res.status(401).send({ message: "Token has been revoked" });
            }
                */

            next();
        });
    }
}
