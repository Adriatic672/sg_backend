import express, { Request, Response } from 'express';
import SocialModel from '../models/social.model';
import Accounts from '../models/accounts.model';
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

function appOAuthStatusRedirectUrl(status: 'success' | 'error', state: string, message?: string) {
    const query = new URLSearchParams({
        status,
        state,
    });
    if (message) {
        query.set('message', message);
    }
    return appOAuthRedirectUrl(query.toString());
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

function renderOAuthCompletePage(message: string, redirectUrl?: string) {
    const safeMessage = escapeHtml(message);
    const redirectScript = redirectUrl ? `
<a id="open-app" href="${redirectUrl}">Open Social Gems</a>
<script>
var redirectUrl = ${JSON.stringify(redirectUrl)};
function openApp() {
    // Try to open the app via custom scheme. If it fails, fallback to web URL after timeout.
    try {
        window.location = redirectUrl;
    } catch (e) {
        // ignore
    }
}
document.getElementById('open-app').addEventListener('click', function(event) {
    event.preventDefault();
    openApp();
});
setTimeout(openApp, 400);

// Fallback: if the app scheme didn't open after 1s, navigate to web fallback URL
setTimeout(function() {
    try {
        // Construct web fallback by replacing scheme with https if possible
        var webFallback = null;
        try {
            var u = new URL(redirectUrl);
            if (u.protocol && u.protocol.indexOf('http') !== 0) {
                // Replace scheme with https and keep host/path/query
                webFallback = 'https://' + u.host + u.pathname + (u.search || '');
            }
        } catch (err) { /* ignore */ }
        if (webFallback) window.location = webFallback;
    } catch (e) { /* ignore */ }
}, 1200);
</script>
` : '';
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
${redirectScript}
</div>
</body>
</html>
`;
}

router.get('/init/:platform', applyJWTConditionally, initSocial);
router.post('/init/:platform', applyJWTConditionally, initSocial);
router.post('/disconnect/:platform', applyJWTConditionally, disconnectSocial);
router.post('/callback', applyJWTConditionally, socialCallback);
router.get('/callback', socialCallbackGet);
router.get('/oauth2redirect', handleOAuth2Redirect);
router.get('/status/:state', applyJWTConditionally, oauthStatus);

// New route for Instagram username connection (RapidAPI)
router.post('/connect-instagram', applyJWTConditionally, connectInstagramUsername);

// Debug endpoints (no auth) for quick checks
router.get('/debug/x/config', debugXConfig);
router.get('/debug/x/tokens', debugXTokens);

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
            return res.send(renderOAuthCompletePage(
                'Authorization was cancelled or failed.',
                state ? appOAuthStatusRedirectUrl('error', state as string, error as string) : undefined
            ));
        }

        if (!code) {
            return res.status(400).json({ error: 'No code provided' });
        }

        if (!state) {
            return res.status(400).json({ error: 'No state provided' });
        }

        const platform = await socialModel.getOAuthPlatformForState(state as string);
        // Allow backend to complete OAuth for X and TikTok; other platforms redirect back to the app
        if (platform && platform !== 'x' && platform !== 'tiktok') {
            return res.send(renderAppRedirectPage(
                'Completing login...',
                appOAuthRedirectUrl(`code=${encodeURIComponent(code as string)}&state=${encodeURIComponent(state as string)}`)
            ));
        }

        console.log('Completing OAuth redirect on backend');
        const result: any = await socialModel.completeOAuthRedirect(code as string, state as string);
        if (result?.status === 200) {
            // Attempt immediate follower resync for X and include username/followers in deep link
            const payload = result.data || result?.data || result;
            let username = '';
            let followers = '';
            let site_id = null;
            let user_id = '';
            try {
                if (payload && typeof payload === 'object') {
                    const record = payload.data || payload;
                    username = record?.username || record?.user_name || '';
                    followers = record?.followers !== undefined ? String(record.followers) : '';
                    site_id = record?.site_id || record?.siteId || null;
                    user_id = record?.user_id || record?.userId || '';
                }
            } catch (e) {
                // ignore
            }

            // If this is X (site_id 1), trigger an immediate followers update to avoid zero counts
            try {
                if (site_id == 1 && username && user_id) {
                    const accounts = new Accounts();
                    // updateFollowersCount will fetch via RapidAPI and update DB
                    await accounts.updateFollowersCount(username, site_id, user_id, 0);
                }
            } catch (resyncErr) {
                console.error('Immediate resync failed:', resyncErr);
            }

            // Build redirect URL safely so params are encoded correctly
            const baseRedirect = appOAuthStatusRedirectUrl('success', state as string);
            let redirectWithParams = baseRedirect;
            try {
                const urlObj = new URL(baseRedirect);
                const params = urlObj.searchParams;
                if (username) params.set('username', username);
                if (followers) params.set('followers', followers);
                urlObj.search = params.toString();
                redirectWithParams = urlObj.toString();
            } catch (e) {
                // fallback to appending encoded params
                redirectWithParams = baseRedirect + (username ? `&username=${encodeURIComponent(username)}` : '') + (followers ? `&followers=${encodeURIComponent(followers)}` : '');
            }

            setOAuthStatus(state as string, 'success', 'Connected successfully', result);
            return res.send(renderOAuthCompletePage(
                'Connected successfully.',
                redirectWithParams
            ));
        }

        const errorMessage = result?.message || 'Failed to connect account';
        setOAuthStatus(state as string, 'error', errorMessage, result);
        return res.send(renderOAuthCompletePage(
            errorMessage,
            appOAuthStatusRedirectUrl('error', state as string, errorMessage)
        ));
    } catch (error: any) {
        console.error('OAuth2 redirect error:', error);
        const state = req.query.state;
        if (state) {
            setOAuthStatus(state as string, 'error', error.message);
        }
        return res.status(500).send(renderOAuthCompletePage(
            `Error: ${error.message}`,
            state ? appOAuthStatusRedirectUrl('error', state as string, error.message) : undefined
        ));
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
        const userId = req.body?.userId || req.query?.userId || (req as any).user?.user_id;
        const asBoolean = (value: unknown) => value === true || value === 'true' || value === '1';
        const forcePrompt = asBoolean(req.body?.forcePrompt) || asBoolean(req.query?.forcePrompt);

        console.log('=== OAUTH INIT REQUEST ===');
        console.log('Method:', req.method);
        console.log('Platform:', req.params.platform);
        console.log('User ID:', userId);
        console.log('Force Prompt:', forcePrompt);
        console.log('==========================');

        const result = await socialModel.initSocial(req.params.platform, userId, { forcePrompt });
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

async function debugXConfig(req: Request, res: Response) {
    try {
        const cfg = await socialModel.getPlatformConfig('x');
        return res.status(200).json({ status: 200, data: cfg });
    } catch (err: any) {
        console.error('debugXConfig error', err);
        return res.status(500).json({ status: 500, message: err.message });
    }
}

async function debugXTokens(req: Request, res: Response) {
    try {
        const limit = Number(req.query.limit || 5);
        const tokens = await socialModel.getRecentSocialTokens('x', limit);
        return res.status(200).json({ status: 200, data: tokens });
    } catch (err: any) {
        console.error('debugXTokens error', err);
        return res.status(500).json({ status: 500, message: err.message });
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
