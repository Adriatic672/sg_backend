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
            clientSecret: process.env.TIKTOK_SECRET || "",
            redirectUri: process.env.REDIRECT_URI || "https://app.socialgems.me/oauth2redirect",
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

        this.platforms.set('instagram', {
            name: 'Instagram',
            authUrl: 'https://www.instagram.com/oauth/authorize',
            tokenUrl: 'https://api.instagram.com/oauth/access_token',
            revokeUrl: 'https://graph.instagram.com/oauth/revoke',
            clientKey: process.env.INSTAGRAM_CLIENT_ID || "",
            clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || "",
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
        }
    }

    async initTikTokAuth(userId: string) {
        try {
            const config = this.platforms.get('tiktok')!;
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
        }
    }

    async completeVerification(token: any, body: any) {
        const postdata = body;
        postdata.token = token;
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
        }
    }

    async handleTikTokCallback(code: string, state: string) {
        try {
            const tokens = await this.exchangeTikTokTokens(code, state);
            console.log("TikTok tokens", tokens);
            return tokens.access_token;
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

            // X OAuth 2.0 with simple state (no PKCE for now)
            await this.saveOAuthState('x', state, userId, '');

            const url =
                `${config.authUrl}?client_id=${config.clientKey}` +
                `&response_type=code` +
                `&scope=${encodeURIComponent(scopes.join(' '))}` +
                `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
                `&state=${encodeURIComponent(state)}`;

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
            const config = this.platforms.get('instagram')!;

            console.log('Instagram Config Debug:', {
                clientKey: config.clientKey ? `${config.clientKey.substring(0, 8)}...` : 'Missing',
                fullClientKey: config.clientKey, // Full client key for debugging
                redirectUri: config.redirectUri,
                authUrl: config.authUrl
            });

            // First, let's try a simple test URL without scopes
            const testUrl = `${config.authUrl}?client_id=${config.clientKey}&response_type=code&redirect_uri=${encodeURIComponent(config.redirectUri)}`;
            console.log('Instagram Test URL (no scopes):', testUrl);

            // Instagram Basic Display API scopes (NOT Business API)
            const scopes = ['user_profile', 'user_media', 'instagram_business_basic'];
            //            const scopes = ['instagram_business_basic'];

            const state = this.generateState();

            // Instagram Basic Display doesn't support PKCE, use simple OAuth
            await this.saveOAuthState('instagram', state, userId, '');

            const url =
                `${config.authUrl}?client_id=${config.clientKey}` +
                `&response_type=code` +
                `&scope=${encodeURIComponent(scopes.join(','))}` +
                `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
                `&state=${encodeURIComponent(state)}`;

            console.log('Instagram Auth URL:', url);
            return this.makeResponse(200, "success", {
                authUrl: url,
                testUrl: testUrl, // Return both URLs for testing
                debug: {
                    clientId: config.clientKey,
                    redirectUri: config.redirectUri
                }
            });
        } catch (error) {
            return this.makeResponse(500, `Failed to initialize Instagram auth: ${error}`);
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

        return resp.data as SocialTokens;
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
            redirectUri: config.redirectUri
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
        await this.storeSocialTokens('instagram', state, resp.data);
        return resp.data as SocialTokens;
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
        await this.deleteData("sm_site_users", `user_id='${userId}' AND site_id='${platform}'`);
    }
}