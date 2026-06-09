import express, { Request, Response } from 'express';
import SocialModel from '../models/social.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';

const router = express.Router();
const socialModel = new SocialModel();
const oauthStatuses = new Map<string, { status: 'pending' | 'success' | 'error'; message: string; result?: any; updatedAt: number }>();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
    JWTMiddleware.verifyToken(req, res, next);
};

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function appOAuthRedirectUrl(query: string) {
    const appDeepLink = (process.env.APP_DEEP_LINK || 'socialgems://app.socialgems.me')
        .replace(/\/+$/, '')
        .replace(/\/oauth2redirect$/i, '');
    return `${appDeepLink}/oauth2redirect?${query}`;
}

function renderAppRedirectPage(message: string, redirectUrl: string) {
    const redirectJson = JSON.stringify(redirectUrl);
    const safeMessage = escapeHtml(message);
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connecting...</title>
</head>
<body>
<p>${safeMessage}</p>
<script>
var redirectUrl = ${redirectJson};
setTimeout(function() {
  window.location.replace(redirectUrl);
}, 250);
</script>
</body>
</html>
`;
}

function setOAuthStatus(state: string, status: 'pending' | 'success' | 'error', message: string, result?: any) {
    oauthStatuses.set(state, {
        status,
        message,
        result,
        updatedAt: Date.now(),
    });
}

function cleanupOAuthStatuses() {
    const maxAgeMs = 10 * 60 * 1000;
    const now = Date.now();
    for (const [state, value] of oauthStatuses.entries()) {
        if (now - value.updatedAt > maxAgeMs) {
            oauthStatuses.delete(state);
        }
    }
}

function renderOAuthCompletePage(message: string) {
    const safeMessage = escapeHtml(message);
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Social Gems</title>
<style>
body { font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
.container { text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
</style>
</head>
<body>
<div class="container">
<p>${safeMessage}</p>
<p>You can return to Social Gems.</p>
</div>
</body>
</html>
`;
}

router.get('/init/:platform', applyJWTConditionally, initSocial);
router.post('/disconnect/:platform', applyJWTConditionally, disconnectSocial);
router.post('/callback', applyJWTConditionally, socialCallback);
router.get('/callback', socialCallbackGet);
router.get('/oauth2redirect', handleOAuth2Redirect);
router.get('/status/:state', applyJWTConditionally, oauthStatus);

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
            if (state) {
                setOAuthStatus(state as string, 'error', error as string);
            }
            return res.send(renderOAuthCompletePage('Authorization was cancelled or failed.'));
        }

        if (!code) {
            return res.status(400).json({ error: 'No code provided' });
        }

        if (!state) {
            return res.status(400).json({ error: 'No state provided' });
        }

        const platform = await socialModel.getOAuthPlatformForState(state as string);
        if (platform !== 'x') {
            return res.send(renderAppRedirectPage(
                'Completing login...',
                appOAuthRedirectUrl(`code=${encodeURIComponent(code as string)}&state=${encodeURIComponent(state as string)}`)
            ));
        }

        console.log('Completing OAuth redirect on backend');
        const result: any = await socialModel.completeOAuthRedirect(code as string, state as string);
        if (result?.status === 200) {
            setOAuthStatus(state as string, 'success', 'Connected successfully', result);
            return res.send(renderOAuthCompletePage('Connected successfully.'));
        }

        setOAuthStatus(state as string, 'error', result?.message || 'Failed to connect account', result);
        return res.send(renderOAuthCompletePage(result?.message || 'Failed to connect account.'));
    } catch (error: any) {
        console.error('OAuth2 redirect error:', error);
        const state = req.query.state;
        if (state) {
            setOAuthStatus(state as string, 'error', error.message);
        }
        return res.status(500).send(renderOAuthCompletePage(`Error: ${error.message}`));
    }
}

async function oauthStatus(req: Request, res: Response) {
    cleanupOAuthStatuses();
    const state = req.params.state;
    const status = oauthStatuses.get(state);

    if (!status) {
        return res.status(200).json({
            status: 200,
            message: 'pending',
            data: { status: 'pending' },
        });
    }

    return res.status(200).json({
        status: 200,
        message: status.message,
        data: {
            status: status.status,
            message: status.message,
            result: status.result,
        },
    });
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
