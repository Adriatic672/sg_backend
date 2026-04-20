import Model from '../helpers/model';
import crypto from 'crypto';
import axios from 'axios';
import qs from 'querystring';
import AccountModel from './accounts.model';

interface SocialTokens {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    refresh_expires_in: number;
    scope: string;
    open_id?: string;
    [key: string]: any;
}

interface SocialPlatform {
    name: string;
    authUrl: string;
    tokenUrl: string;
    revokeUrl: string;
    clientKey: string;
    clientSecret: string;
    redirectUri: string;
}

interface PkcePair {
    codeVerifier: string;
    codeChallenge: string;
}

export default class SocialModel extends Model {


    private platforms: Map<string, SocialPlatform>;

    constructor() {
        super("social_services");

        this.platforms = new Map();
        this.platforms.set('tiktok', {
            name: 'TikTok',
            authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
            tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
            revokeUrl: 'https://open.tiktokapis.com/v2/oauth/revoke/',
            clientKey: process.env.TIKTOK_CLIENT_ID || process.env.TIKTOK_CLIENT_KEY || "",
            clientSecret: process.env.TIKTOK_CLIENT_SECRET || process.env.TIKTOK_SECRET || "",
            redirectUri: process.env.TIKTOK_REDIRECT_URI || process.env.REDIRECT_URI || "https://sg-backend-0cs6.onrender.com/oauth/oauth2redirect",
        });

        this.platforms.set('x', {
            name: 'X (Twitter)',
            authUrl: 'https://twitter.com/i/oauth2/authorize',
            tokenUrl: 'https://api.twitter.com/2/oauth2/token',
            revokeUrl: 'https://api.twitter.com/2/oauth2/revoke',
            clientKey: process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || "",
            clientSecret: process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET || "",
            redirectUri: process.env.X_REDIRECT_URI || process.env.TWITTER_REDIRECT_URI || "socialgems://app.socialgems.me",
        });


        this.platforms.set('facebook', {
            name: 'Facebook',
            authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
            tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
            revokeUrl: '',
            clientKey: process.env.FACEBOOK_CLIENT_ID || process.env.INSTA_PROD_CLIENTKEY || process.env.INSTAGRAM_CLIENT_ID || "",
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET || process.env.INSTA_PROD_SECRETKEY || process.env.INSTAGRAM_CLIENT_SECRET || "",
            redirectUri: process.env.REDIRECT_URI || "https://app.socialgems.me/oauth2redirect",
        });

        this.platforms.set('instagram', {
            name: 'Instagram',
            // Instagram API with Instagram Login - for Creator/Business accounts
            authUrl: 'https://api.instagram.com/oauth/authorize',
            tokenUrl: 'https://api.instagram.com/oauth/access_token',
            revokeUrl: 'https://graph.instagram.com/me/permissions',
            clientKey: process.env.INSTA_PROD_CLIENTKEY || process.env.INSTAGRAM_CLIENT_ID || "",
            clientSecret: process.env.INSTA_PROD_SECRETKEY || process.env.INSTAGRAM_CLIENT_SECRET || "",
            redirectUri: process.env.REDIRECT_URI || "https://app.socialgems.me/oauth2redirect",
        });
    }

    async initSocial(platform: string, userId: string) {
        switch (platform) {
            case 'tiktok':
                return this.initTikTokAuth(userId);
            case 'x':
                return this.initXAuth(userId);
            case 'instagram':
                return this.initInstagramAuth(userId);
            case 'facebook':
                return this.initFacebookAuth(userId);
        }
    }

    async initTikTokAuth(userId: string) {
        try {
            const config = this.platforms.get('tiktok')!;
            
            console.log('=== TIKTOK AUTH DEBUG ===');
            console.log('Client Key:', config.clientKey ? config.clientKey.substring(0, 8) + '...' : 'MISSING');
            console.log('Redirect URI:', config.redirectUri);
            console.log('========================');
            
            const scopes = ["user.info.basic", "user.info.profile", "user.info.stats"];

            const state = this.generateState();
            const { codeVerifier, codeChallenge } = this.genPkcePair();

            await this.saveOAuthState('tiktok', state, userId, codeVerifier);

            const url =
                `${config.authUrl}?client_key=${config.clientKey}` +
                `&response_type=code` +
                `&scope=${encodeURIComponent(scopes.join(","))}` +
                `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
                `&state=${encodeURIComponent(state)}` +
                `&code_challenge=${encodeURIComponent(codeChallenge)}` +
                `&code_challenge_method=S256`;

            return this.makeResponse(200, "success", { authUrl: url });
        } catch (error) {
            return this.makeResponse(500, `Failed to initialize TikTok auth: ${error}`);
        }
    }


    async socialCallback(body: any) {
        console.log("Social callback", body);
        const code = body.auth_code;
        const state = body.state;
        switch (body.site_name) {
            case 'tiktok':
                const tiktok_token: any = await this.handleTikTokCallback(code, state);
                console.log("TikTok tokens", tiktok_token);
                if (tiktok_token) {
                    return this.completeVerification(tiktok_token, body);
                }
                return this.makeResponse(500, "Failed to get TikTok tokens");
            case 'x':
                const xtoken: any = await this.handleXCallback(code, state);
                console.log("X tokens", xtoken);
                if (xtoken) {
                    return this.completeVerification(xtoken, body);
                }
                return this.makeResponse(500, "Failed to get X tokens");
            case 'instagram':
                const instagram_token: any = await this.handleInstagramCallback(code, state);
                console.log("Instagram tokens", instagram_token);
                if (instagram_token) {
                    return this.completeVerification(instagram_token, body);
                }
                return this.makeResponse(500, "Failed to get Instagram tokens");
            case 'facebook':
                const facebook_token: any = await this.handleFacebookCallback(code, state);
                console.log("Facebook tokens", facebook_token);
                if (facebook_token) {
                    return this.completeVerification(facebook_token, body);
                }
                return this.makeResponse(500, "Failed to get Facebook tokens");
        }
    }

    async completeVerification(token: any, body: any) {
        const postdata = body;
        // Handle both string token and object token with user_id
        if (typeof token === 'object' && token.access_token) {
            postdata.token = token.access_token;
            postdata.user_id = token.user_id || body.user_id;
            postdata.userId = token.user_id || body.user_id; // Add camelCase version
            postdata.site_id = token.site_id || body.site_id;
            postdata.site_name = token.site_name || body.site_name;
        } else {
            postdata.token = token;
            postdata.userId = body.user_id; // Add camelCase version
            postdata.site_id = body.site_id;
            postdata.site_name = body.site_name;
        }
        console.log('completeVerification postdata:', postdata);
        return await new AccountModel().socialSignOn(postdata);
    }

    async disconnectSocial(platform: any, userId: any) {
       // const { access_token } = data;
       const access_token = "test"
        const site: any = await this.getsiteByName(platform);
        if (site.length == 0) {
            return this.makeResponse(400, "Invalid platform name");
        }

        const userIsPartOfCampaign:any = await this.userIsPartOfCampaign(userId, site[0].site_id);
        if (userIsPartOfCampaign.length > 0) {
            return this.makeResponse(400, "Social site cannot be disconnected as it is part of a campaign");
        }
        switch (platform) {
            case 'tiktok':
                return this.disconnectTikTok(access_token, userId);
            case 'x':
                return this.disconnectX(access_token, userId);
            case 'instagram':
                return this.disconnectInstagram(access_token, userId);
            case 'facebook':
                return this.disconnectFacebook(access_token, userId);
        }
    }

    async handleTikTokCallback(code: string, state: string) {
        try {
            const tokens = await this.exchangeTikTokTokens(code, state);
            console.log("TikTok tokens", tokens);
            
            // Get site_id for TikTok
            const site: any = await this.getsiteByName('tiktok');
            const site_id = site.length > 0 ? site[0].site_id : null;
            
            return {
                access_token: tokens.access_token,
                user_id: tokens.user_id,
                site_id: site_id,
                site_name: 'tiktok'
            };
        } catch (error) {
            console.log("TikTok callback error", error);
            return null;

        }
    }

    async refreshTikTokToken(refreshToken: string) {
        try {
            if (!refreshToken) {
                throw new Error('Missing refresh_token');
            }
            const tokens = await this.refreshTikTokTokens(refreshToken);
            return this.makeResponse(200, "success", { ...tokens });
        } catch (error) {
            return this.makeResponse(500, `Failed to refresh TikTok token: ${error}`);
        }
    }

    async disconnectTikTok(accessToken: string, userId: string) {
        try {
            if (!accessToken) {
                throw new Error('Missing access_token');
            }
            this.revokeTikTokTokens(accessToken);
            await this.removeSocialTokens('tiktok', accessToken, userId);
            return this.makeResponse(200, "success", { message: 'TikTok disconnected successfully' });
        } catch (error) {
            return this.makeResponse(500, `Failed to disconnect TikTok: ${error}`);
        }
    }

    async initXAuth(userId: string) {
        try {
            const config = this.platforms.get('x')!;
            const scopes = ['tweet.read', 'users.read', 'offline.access'];

            const state = this.generateState();
            const { codeVerifier, codeChallenge } = this.genPkcePair();

            await this.saveOAuthState('x', state, userId, codeVerifier);

            const url =
                `${config.authUrl}?client_id=${config.clientKey}` +
                `&response_type=code` +
                `&scope=${encodeURIComponent(scopes.join(' '))}` +
                `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
                `&state=${encodeURIComponent(state)}` +
                `&code_challenge=${encodeURIComponent(codeChallenge)}` +
                `&code_challenge_method=S256`;

            return this.makeResponse(200, "success", { authUrl: url });
        } catch (error) {
            return this.makeResponse(500, `Failed to initialize X auth: ${error}`);
        }
    }

    async handleXCallback(code: string, state: string) {
        try {
            const tokens = await this.exchangeXTokens(code, state);
            console.log("X tokens", tokens);
            return tokens.access_token;
        } catch (error) {
            console.log("X callback error", error);
            return null;
        }
    }

    async refreshXToken(refreshToken: string) {
        try {
            if (!refreshToken) {
                throw new Error('Missing refresh_token');
            }
            const config = this.platforms.get('x')!;
            const tokens = await this.refreshXTokens(refreshToken, config);
            return this.makeResponse(200, "success", { ...tokens });
        } catch (error) {
            return this.makeResponse(500, `Failed to refresh X token: ${error}`);
        }
    }

    async disconnectX(accessToken: string, userId: string) {
        try {
            if (!accessToken) {
                throw new Error('Missing access_token');
            }
            const config = this.platforms.get('x')!;
             this.revokeXTokens(accessToken, config);
            await this.removeSocialTokens('x', accessToken, userId);
            return this.makeResponse(200, "success", { message: 'X disconnected successfully' });
        } catch (error) {
            return this.makeResponse(500, `Failed to disconnect X: ${error}`);
        }
    }

    async initInstagramAuth(userId: string) {
        try {
            // For Instagram, we use RapidAPI instead of OAuth (since Meta deprecated their API)
            // We'll ask the user to enter their Instagram username
            console.log('Instagram Auth: Using RapidAPI for Instagram data');

            return this.makeResponse(200, "success", {
                authUrl: null,
                method: 'username', // User will enter username instead of OAuth
                message: 'Please enter your Instagram username to connect',
                debug: {
                    platform: 'instagram',
                    method: 'rapidapi'
                }
            });
        } catch (error) {
            return this.makeResponse(500, `Failed to initialize Instagram auth: ${error}`);
        }
    }

    // New method to connect Instagram using username (via RapidAPI)
    async connectInstagramWithUsername(userId: string, username: string) {
        try {
            const RapidInstagram = require('../thirdparty/Rapid.Instagram').default;
            const instagramAPI = new RapidInstagram();
            
            console.log('Connecting Instagram with username:', username);
            
            // Get user info from RapidAPI
            const userInfo = await instagramAPI.getUserInfo(username);
            console.log('Instagram user info:', userInfo);
            
            if (!userInfo || !userInfo.user) {
                return this.makeResponse(400, "Failed to find Instagram user");
            }
            
            // Store the Instagram connection
            const tokenData = {
                access_token: username, // Use username as token for RapidAPI
                username: username,
                user_id: userInfo.user.id,
                followers_count: userInfo.user.followers_count,
                verified: userInfo.user.verified,
                platform: 'instagram',
                connected_at: new Date().toISOString()
            };
            
            // Remove any existing Instagram connection for this user first
            const existingSite: any = await this.getsiteByName('instagram');
            if (existingSite && existingSite.length > 0) {
                const siteId = existingSite[0].site_id;
                await this.deleteData('sm_site_users', `user_id='${userId}' AND site_id='${siteId}'`);
                await this.deleteData('social_tokens', `platform='instagram' AND userId='${userId}'`);
                await this.insertData('sm_site_users', {
                    user_id: userId,
                    site_id: siteId,
                    username: username,
                    followers: userInfo.user.followers_count,
                    is_verified: userInfo.user.verified ? 'yes' : 'no',
                    created_on: new Date()
                });
            }

            await this.storeSocialTokens('instagram', userId, tokenData as any);
            
            return this.makeResponse(200, "success", {
                message: 'Instagram connected successfully',
                username: username,
                userId: userInfo.user.id,
                followers: userInfo.user.followers_count
            });
        } catch (error) {
            console.error('Instagram username connection error:', error);
            return this.makeResponse(500, `Failed to connect Instagram: ${error}`);
        }
    }

    async handleInstagramCallback(code: string, state: string) {
        try {
            const tokens = await this.exchangeInstagramTokens(code, state);
            console.log("Instagram tokens", tokens);
            return tokens.access_token;
        } catch (error) {
            console.log("Instagram callback error", error);
            return null;
        }
    }

    async refreshInstagramToken(refreshToken: string) {
        try {
            if (!refreshToken) {
                throw new Error('Missing refresh_token');
            }
            const config = this.platforms.get('instagram')!;
            const tokens = await this.refreshInstagramTokens(refreshToken, config);
            return this.makeResponse(200, "success", { ...tokens });
        } catch (error) {
            return this.makeResponse(500, `Failed to refresh Instagram token: ${error}`);
        }
    }

    async disconnectInstagram(accessToken: string, userId: string) {
        try {
            if (!accessToken) {
                throw new Error('Missing access_token');
            }
            const config = this.platforms.get('instagram')!;
             this.revokeInstagramTokens(accessToken, config);
            await this.removeSocialTokens('instagram', accessToken, userId);
            return this.makeResponse(200, "success", { message: 'Instagram disconnected successfully' });
        } catch (error) {
            return this.makeResponse(500, `Failed to disconnect Instagram: ${error}`);
        }
    }


    async initFacebookAuth(userId: string) {
        try {
            const config = this.platforms.get('facebook')!;
            // Use basic scopes that don't require app review for local testing
            // For production with Pages features, you'll need app review approval
            const scopes = ['public_profile', 'email'];
            const state = this.generateState();
            await this.saveOAuthState('facebook', state, userId, '');

            const url =
                `${config.authUrl}?client_id=${config.clientKey}` +
                `&response_type=code` +
                `&scope=${encodeURIComponent(scopes.join(','))}` +
                `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
                `&state=${encodeURIComponent(state)}`;

            console.log('=== FACEBOOK AUTH URL ===');
            console.log('Redirect URI:', config.redirectUri);
            console.log('Full Auth URL:', url);
            console.log('========================');

            return this.makeResponse(200, "success", { authUrl: url });
        } catch (error) {
            return this.makeResponse(500, `Failed to initialize Facebook auth: ${error}`);
        }
    }

    async handleFacebookCallback(code: string, state: string) {
        try {
            const tokens = await this.exchangeFacebookTokens(code, state);
            console.log("Facebook tokens", tokens);
            
            // Get site_id for Facebook
            const site: any = await this.getsiteByName('facebook');
            console.log("Facebook site lookup:", site);
            const site_id = site && site.length > 0 ? site[0].site_id : 3; // Default to 3 if not found
            
            console.log("Facebook callback returning:", {
                access_token: tokens.access_token ? 'present' : 'missing',
                user_id: tokens.user_id,
                site_id: site_id,
                site_name: 'facebook'
            });
            
            return {
                access_token: tokens.access_token,
                user_id: tokens.user_id, // From OAuth state
                site_id: site_id,
                site_name: 'facebook'
            };
        } catch (error) {
            console.log("Facebook callback error", error);
            return null;
        }
    }

    async disconnectFacebook(accessToken: string, userId: string) {
        try {
            await this.removeSocialTokens('facebook', accessToken, userId);
            return this.makeResponse(200, "success", { message: 'Facebook disconnected successfully' });
        } catch (error) {
            return this.makeResponse(500, `Failed to disconnect Facebook: ${error}`);
        }
    }

    private async exchangeFacebookTokens(code: string, state: string): Promise<SocialTokens> {
        const config = this.platforms.get('facebook')!;
        
        // Load OAuth state to get userId
        const rec: any = await this.loadAndDeleteOAuthState('facebook', state);
        if (!rec) throw new Error("Invalid or expired state");

        const resp = await axios.get(config.tokenUrl, {
            params: {
                client_id: config.clientKey,
                client_secret: config.clientSecret,
                redirect_uri: config.redirectUri,
                code,
            },
            timeout: 10000,
        });

        if (resp.data.error) {
            throw new Error(`Facebook OAuth error: ${resp.data.error.message}`);
        }

        await this.storeSocialTokens('facebook', state, resp.data);
        
        // Add userId from state record
        return {
            ...resp.data,
            user_id: rec.userId
        } as SocialTokens;
    }

    private generateState(): string {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    private genPkcePair(): PkcePair {
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
        return { codeVerifier, codeChallenge };
    }

    private async saveOAuthState(platform: string, state: string, userId: string, codeVerifier: string) {
        const data = {
            platform,
            state,
            userId,
            codeVerifier,
            created_at: new Date()
        };
        await this.insertData("oauth_states", data);
    }

    private async loadAndDeleteOAuthState(platform: string, state: string) {
        const result: any = await this.callParameterizedQuery(
            "SELECT * FROM oauth_states WHERE platform = ? AND state = ?",
            [platform, state]
        );

        if (result.length === 0) return null;

        // delete this in the future
        //  await this.deleteData("oauth_states", `platform='${platform}' AND state='${state}'`);
        return result[0];
    }

    private async exchangeTikTokTokens(code: string, state: string): Promise<SocialTokens> {
        const config = this.platforms.get('tiktok')!;
        const rec = await this.loadAndDeleteOAuthState('tiktok', state);
        if (!rec) throw new Error("Invalid or expired state");

        const body = qs.stringify({
            client_key: config.clientKey,
            client_secret: config.clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: config.redirectUri,
            code_verifier: rec.codeVerifier,
        });

        const resp = await axios.post(config.tokenUrl, body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });

        // Add userId from state record to the response
        return {
            ...resp.data,
            user_id: rec.userId
        } as SocialTokens;
    }

    private async refreshTikTokTokens(refreshToken: string): Promise<SocialTokens> {
        const config = this.platforms.get('tiktok')!;

        const body = qs.stringify({
            client_key: config.clientKey,
            client_secret: config.clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        });

        const resp = await axios.post(config.tokenUrl, body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });

        return resp.data as SocialTokens;
    }

    private async revokeTikTokTokens(accessToken: string) {
        const config = this.platforms.get('tiktok')!;

        const body = qs.stringify({
            client_key: config.clientKey,
            client_secret: config.clientSecret,
            token: accessToken,
        });

        const resp = await axios.post(config.revokeUrl, body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });

        return resp.data;
    }

    private async exchangeXTokens(code: string, state: string): Promise<SocialTokens> {
        const config = this.platforms.get('x')!;
        const rec = await this.loadAndDeleteOAuthState('x', state);
        //  if (!rec) throw new Error("Invalid or expired state");

        console.log('X OAuth Debug:', {
            clientKey: config.clientKey ? 'Set' : 'Missing',
            clientSecret: config.clientSecret ? 'Set' : 'Missing',
            code: code ? 'Set' : 'Missing',
            redirectUri: config.redirectUri
        });

        // Build body - only include client_secret if it exists
        const bodyData: any = {
            client_id: config.clientKey,
            grant_type: "authorization_code",
            code,
            redirect_uri: config.redirectUri,
        };

        // Only add client_secret if it's configured (for confidential clients)
        if (config.clientSecret && config.clientSecret.trim() !== '') {
            bodyData.client_secret = config.clientSecret;
        }

        const body = qs.stringify(bodyData);

        const resp = await axios.post(config.tokenUrl, body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });

        await this.storeSocialTokens('x', state, resp.data);
        return resp.data as SocialTokens;
    }

    private async refreshXTokens(refreshToken: string, config: SocialPlatform): Promise<SocialTokens> {
        const body = qs.stringify({
            client_id: config.clientKey,
            client_secret: config.clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        });

        const resp = await axios.post(config.tokenUrl, body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });

        return resp.data as SocialTokens;
    }

    private async revokeXTokens(accessToken: string, config: SocialPlatform) {
        const body = qs.stringify({
            client_id: config.clientKey,
            client_secret: config.clientSecret,
            token: accessToken,
        });

        const resp = await axios.post(config.revokeUrl, body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });

        return resp.data;
    }

    private async exchangeInstagramTokens(code: string, state: string): Promise<SocialTokens> {
        const config = this.platforms.get('instagram')!;
        const rec = await this.loadAndDeleteOAuthState('instagram', state);
        // if (!rec) throw new Error("Invalid or expired state");

        console.log('Instagram OAuth Debug:', {
            clientKey: config.clientKey ? 'Set' : 'Missing',
            clientSecret: config.clientSecret ? 'Set' : 'Missing',
            code: code ? 'Set' : 'Missing',
            redirectUri: config.redirectUri,
            tokenUrl: config.tokenUrl
        });

        const body = qs.stringify({
            client_id: config.clientKey,
            client_secret: config.clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: config.redirectUri,
        });

        const resp = await axios.post(config.tokenUrl, body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });
        console.log("Instagram:::tokens", resp.data);

        // Check for error in response data (Instagram returns errors even with 200 status)
        if (resp.data.error_type || resp.data.error) {
            const errorMsg = resp.data.error_message || resp.data.error_description || resp.data.error;
            throw new Error(`Instagram OAuth error: ${errorMsg}`);
        }

        // For Instagram Basic Display API
        const accessToken = resp.data.access_token;
        
        // Get Instagram user info
        try {
            const igUserResp = await axios.get('https://graph.instagram.com/me', {
                params: {
                    fields: 'id,username,account_type,followers_count,media_count',
                    access_token: accessToken
                }
            });
            console.log('Instagram User Info:', igUserResp.data);
            
            // Store both tokens
            const tokenData = {
                ...resp.data,
                instagram_user_id: igUserResp.data.id,
                instagram_username: igUserResp.data.username,
                account_type: igUserResp.data.account_type
            };
            await this.storeSocialTokens('instagram', state, tokenData);
            return tokenData as SocialTokens;
        } catch (igError: any) {
            console.log('Instagram user info error:', igError.response?.data || igError.message);
            // Fallback: store the token anyway
            await this.storeSocialTokens('instagram', state, resp.data);
            return resp.data as SocialTokens;
        }
    }

    private async refreshInstagramTokens(refreshToken: string, config: SocialPlatform): Promise<SocialTokens> {
        const body = qs.stringify({
            client_id: config.clientKey,
            client_secret: config.clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        });

        const resp = await axios.post(config.tokenUrl, body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });

        return resp.data as SocialTokens;
    }

    private async revokeInstagramTokens(accessToken: string, config: SocialPlatform) {
        const body = qs.stringify({
            client_id: config.clientKey,
            client_secret: config.clientSecret,
            token: accessToken,
        });

        const resp = await axios.post(config.revokeUrl, body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });

        return resp.data;
    }

    private async storeSocialTokens(platform: string, userId: string, tokens: SocialTokens) {
        const data = {
            platform,
            userId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            open_id: tokens.open_id,
            scope: tokens.scope,
            expires_in: tokens.expires_in,
            created_at: new Date()
        };
        await this.insertData("social_tokens", data);
    }

    getsiteByName(name: string) {
        return this.callQuerySafe(`select * from sm_sites where lower(sm_name)=?`, [name.toLowerCase()]);
    }

    private async removeSocialTokens(platform: string, accessToken: string, userId: string) {
        await this.deleteData("social_tokens", `platform='${platform}' AND access_token='${accessToken}'`);
        const site: any = await this.getsiteByName(platform);
        if (site.length > 0) {
            const site_id = site[0].site_id;
            await this.deleteData("sm_site_users", `user_id='${userId}' AND site_id='${site_id}'`);
        }
    }
}