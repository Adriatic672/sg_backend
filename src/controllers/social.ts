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
router.post('/callback', applyJWTConditionally, socialCallback);
router.get('/callback', socialCallbackGet);
router.get('/oauth2redirect', handleOAuth2Redirect);

// New route for Instagram username connection (RapidAPI)
router.post('/connect-instagram', applyJWTConditionally, connectInstagramUsername);

async function handleOAuth2Redirect(req: Request, res: Response) {
    try {
        console.log('=== OAUTH2REDIRECT GET ===');
        console.log('Query:', req.query);

        const code = req.query.code;
        const error = req.query.error;
        const state = req.query.state;

        if (error) {
            console.error('OAuth error:', error);
            return res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connecting...</title>
<style>
body { font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
.container { text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
.spinner { border: 4px solid #f3f3f3; border-top: 4px solid #1877f2; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="container">
<div class="spinner"></div>
<p>Connecting your account...</p>
</div>
<script>
setTimeout(function() {
window.location.href = '${process.env.APP_DEEP_LINK || 'socialgems://app.socialgems.me'}/oauth2redirect?error=${encodeURIComponent(error as string)}';
}, 500);
</script>
</body>
</html>
`);
        }

        if (!code) {
            return res.status(400).json({ error: 'No code provided' });
        }

        console.log('Sending success redirect with code');
        
        return res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connecting...</title>
<style>
body { font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
.container { text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
.spinner { border: 4px solid #f3f3f3; border-top: 4px solid #1877f2; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="container">
<div class="spinner"></div>
<p>Completing login...</p>
</div>
<script>
console.log('Redirecting to app with code...');
window.location.href = '${process.env.APP_DEEP_LINK || 'socialgems://app.socialgems.me'}/oauth2redirect?code=${code}&state=${state}';
</script>
</body>
</html>
`);
    } catch (error: any) {
        console.error('OAuth2 redirect error:', error);
        return res.status(500).send(`
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
<p>Error: ${error.message}</p>
<script>
window.location.href = '${process.env.APP_DEEP_LINK || 'socialgems://app.socialgems.me'}/oauth2redirect?error=${encodeURIComponent(error.message)}';
</script>
</body>
</html>
`);
    }
}

async function socialCallbackGet(req: Request, res: Response) {
    try {
        console.log('=== OAUTH CALLBACK GET ===');
        console.log('Query:', req.query);
        
        const code = req.query.code;
        const state = req.query.state;
        
        if (!code) {
            return res.status(400).json({ error: 'No code provided' });
        }
        
        // Call the callback handler with the code - it will load state from DB
        const result = await socialModel.socialCallback({
            auth_code: code,
            state: state,
            site_name: 'tiktok'
        });
        
        console.log('Social callback result:', result);
        
        // Return JSON for Flutter to handle
        res.json({
            success: true,
            code: code,
            state: state,
            result: result
        });
    } catch (error: any) {
        console.error('OAuth callback error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}


async function initSocial(req: Request, res: Response) {
    try {
        console.log('=== OAUTH INIT REQUEST ===');
        console.log('Platform:', req.params.platform);
        console.log('User ID:', req.body.userId);
        console.log('==========================');
        
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

// New endpoint for connecting Instagram via username (RapidAPI)
async function connectInstagramUsername(req: Request, res: Response) {
    try {
        console.log('=== CONNECT INSTAGRAM REQUEST ===');
        console.log('Body:', req.body);
        console.log('Query:', req.query);
        
        const userId = req.body.userId || req.query.userId;
        const username = req.body.username;
        
        console.log('User ID:', userId);
        console.log('Username:', username);
        
        if (!username) {
            return res.status(400).json({ message: 'Username is required' });
        }
        
        const result = await socialModel.connectInstagramWithUsername(userId, username);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

 

export default router;
