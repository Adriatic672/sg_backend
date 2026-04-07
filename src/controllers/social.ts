import express, { Request, Response } from 'express';
import SocialModel from '../models/social.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';

const router = express.Router();
const socialModel = new SocialModel();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
    JWTMiddleware.verifyToken(req, res, next);
};



router.get('/init/:platform', applyJWTConditionally, initSocial);
router.post('/disconnect/:platform', applyJWTConditionally, disconnectSocial);
router.post('/callback',applyJWTConditionally, socialCallback);


async function initSocial(req: Request, res: Response) {
    try {
        const result = await socialModel.initSocial(req.params.platform, req.body.userId);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function disconnectSocial(req: Request, res: Response) {

    try {
        const result = await socialModel.disconnectSocial(req.params.platform, req.body.userId);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function socialCallback(req: Request, res: Response) {
    try {
        const result = await socialModel.socialCallback(req.body);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}


async function initXAuth(req: Request, res: Response) {
    try {
        const result = await socialModel.initXAuth(req.body.userId || req.query.userId);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function xCallback(req: Request, res: Response) {
    try {
        const result = await socialModel.handleXCallback(req.query.code as string, req.query.state as string);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function refreshXToken(req: Request, res: Response) {
    try {
        const result = await socialModel.refreshXToken(req.body.refresh_token);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

 
async function initInstagramAuth(req: Request, res: Response) {
    try {
        const result = await socialModel.initInstagramAuth(req.body.userId || req.query.userId);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function instagramCallback(req: Request, res: Response) {
    try {
        const result = await socialModel.handleInstagramCallback(req.query.code as string, req.query.state as string);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function refreshInstagramToken(req: Request, res: Response) {
    try {
        const result = await socialModel.refreshInstagramToken(req.body.refresh_token);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

 

export default router;
