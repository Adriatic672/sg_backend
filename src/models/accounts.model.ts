import Model from "../helpers/model";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import jwkToPem from 'jwk-to-pem';

import { uploadToS3 } from "../helpers/S3UploadHelper";
import { setItem, getItem } from "../helpers/connectRedis";
import TikTokAPIv2 from "../thirdparty/Rapid.TikTok";
import RapiAPI from "../thirdparty/Rapid.X";
import InstagramAPI from "../thirdparty/Rapid.Instagram";
import { subscribeToTopic } from "../helpers/FCM";
import FacebookAPI from "../thirdparty/Facebook";
import { logger } from "../utils/logger";
import { SocialVerifier } from "../thirdparty/socialVerifier";
import InfoBipSMS from "../thirdparty/InfoBipSMS";
import SMSHelper from "../thirdparty/SMSHelper";
import { InfluencerDetails } from "../interfaces/influencerDetails";
import AnalyticsModel from "./analytics.model";
import makerCheckerHelper from "../helpers/makerChecker.helper";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const mapping: any = {
  1: "X",
  2: "tiktok",
  3: "facebook",
  4: "instagram"
}
interface ContentForm {
  content_best_at?: string;
  comfortable_campaign_activities?: string;
  platforms_most_content?: string;
  content_types_enjoyed_most?: string;
}


interface UserProfile {
  user_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  dob?: string;
  country_id?: string;
  industry_ids?: string;
  address?: string;
  email?: string;
  profile_pic?: string;
  bio?: string;
  phone?: string;
  iso_code?: string;
  phone_verified?: string;
  fcm_token?: string;
  referral_code?: string;
  gender?: string;
  content_best_at?: string;
  comfortable_campaign_activities?: string;
  platforms_most_content?: string[];
  content_types_enjoyed_most?: string[];
  date_of_birth?: string;
  status?: string;
  influencer_rating?: number;
  average_rating?: number;
}
class Accounts extends Model {
  constructor() {
    super();
  }


  async getBusinessByPhone(phone: any) {
    const existingBusinessPhone = await this.callQuerySafe(`SELECT * FROM business_profile where phone = '${phone}' and phone_verified='yes'`);
    return existingBusinessPhone;
  }

  async updateSocialProfiles(userId: any = null) {
    const response: any = await this.callQuerySafe(`SELECT * FROM sm_site_users where is_verified = 'yes' and last_synced_at < NOW() - INTERVAL 1 DAY ${userId ? `and user_id = '${userId}'` : ''}`);
    console.log("response", response.length);
    for (let i = 0; i < response.length; i++) {
      try {
        const site_id = response[i].site_id;
        const username = response[i].username;
        const userId = response[i].user_id;
        const followersCount = await this.updateFollowersCount(username, site_id, userId, 0);
        console.log("followersCount", followersCount);
      } catch (error) {
        console.error("Error in updateSocialProfiles:", error);
      }
    }
    return this.makeResponse(200, "success", "Social profiles updated successfully");
  }


  async getInfluencerDetails(userId: any) {
    const response: any = await this.callQuerySafe(`
      SELECT * FROM users_profile where user_id = '${userId}'
    `);
    console.log("response", response);
    if (response.length == 0) {
      return this.makeResponse(404, "Influencer not found");
    }


    const socialStats: any = {
      instagram: 0,
      tiktok: 0,
      youtube: 0,
      x: 0
    }

    let verified = false;
    const sm_site_users = await this.selectDataQuery(`sm_site_users`, `user_id='${userId}'`);
    for (let i = 0; i < sm_site_users.length; i++) {
      const site_id = sm_site_users[i].site_id;
      const site_name = mapping[site_id];
      const followers = sm_site_users[i].followers;
      const is_verified = sm_site_users[i].is_verified;
      socialStats[site_name] = followers;
      if (is_verified == 'yes') {
        verified = true;
        socialStats[site_name] = followers;
      }
    }

    const reviews = await this.getUserReviews(userId);

    const profileInfo: InfluencerDetails = {
      name: response[0].first_name + " " + response[0].last_name,
      level: "Gold",
      verified: verified,
      categories: response[0].industry_ids,
      gemPoints: 100,
      campaigns: 4,
      sgRating: 10,
      address: response[0].address || "",
      socialStats,
      about: response[0].bio,
      location: response[0].iso_code,
      reviews: reviews
    }
    return this.makeResponse(200, "success", profileInfo);
  }
  async getUserReviews(userId: any) {
    const reviews: any = await this.callQuerySafe(`SELECT * FROM act_campaign_reviews WHERE user_id='${userId}'`);
    const reviewInfo = []
    for (let i = 0; i < reviews.length; i++) {
      const reviewer = await this.getUserProfile(reviews[i].reviewed_by);
      const review = {
        reviewer: reviewer.first_name + " " + reviewer.last_name,
        reviewerTitle: reviewer.title || "Influencer",
        rating: reviews[i].rating,
        comment: reviews[i].review,
        date: reviews[i].created_at
      }
      reviewInfo.push(review);
    }
    return reviewInfo;
  }



  async getMyFerals(userId: string) {
    const ferals: any = await this.callQuerySafe(`SELECT * FROM referrals r inner join users_profile u on r.user_id = u.user_id where referrer_user_id='${userId}'`);
    const feralsInfo = []
    for (let i = 0; i < ferals.length; i++) {
      const feral = ferals[i]
      const feralInfo = {
        user_id: feral.user_id,
        username: feral.username,
        first_name: feral.first_name,
        referral_code: feral.referral_code,
        referrer_user_id: feral.referrer_user_id,
        gems: feral.gems,
        created_at: feral.created_at,
        last_name: feral.last_name
      }
      feralsInfo.push(feralInfo)
    }
    return this.makeResponse(200, "success", feralsInfo);
  }

  async Levels() {
    const levels: any = await this.callQuerySafe(`SELECT * FROM levels`);
    return this.makeResponse(200, "success", levels);
  }

  async updateFollowersCount(socialUsername: string, site_id: any, userId: any, followersCount: number) {
    if (followersCount > 0) {
      return followersCount;
    }
    if (site_id == 4) {
      followersCount = await new InstagramAPI().getFollowers(socialUsername)

    } else if (site_id == 2) {
      followersCount = await new TikTokAPIv2().fetchUserFollowers(socialUsername)
      console.log("followersCount", followersCount);

    } else if (site_id == 1) {
      followersCount = await new RapiAPI().getXFollowers(socialUsername)

    } else if (site_id == 3) {
      followersCount = await new FacebookAPI().getFollowers(socialUsername)
    }
    console.log("followersCount", followersCount);
    const sites = await this.selectDataQuery(`sm_site_users`, `site_id='${site_id}' and user_id='${userId}'`);
    if (sites.length > 0) {
      if (followersCount && followersCount > 0) {
        const info = { followers: followersCount, last_synced_at: new Date() }
        await this.updateData(`sm_site_users`, `site_id='${site_id}' and user_id='${userId}'`, info);
      }
    } else {
      const siteInfo = { site_id, user_id: userId, is_verified: 'yes', followers: followersCount, username: socialUsername, link: "", last_synced_at: new Date() }
      await this.insertData(`sm_site_users`, siteInfo);
    }
    return followersCount;
  }



  async socialSignOn(data: any) {
    try {
      console.log("SOS_REQUEST", data);
      const { token, userId, site_id, email } = data;
      const site_name = data.site_name === 'x' ? 'X' : data.site_name;
      if (!token || !userId || !site_name) {
        return this.makeResponse(400, "Missing required fields: token or userId or site_name");
      }
      const allowedSites = ['tiktok', 'instagram', 'X', 'facebook'];
      if (!allowedSites.includes(site_name)) {
        return this.makeResponse(400, "Invalid site name");
      }

      const siteInfo = await this.selectDataQuery('sm_site_users', `site_id='${site_id}' AND user_id='${userId}' and is_verified='yes' `)
      if (siteInfo.length > 0) {
        return this.makeResponse(400, 'You are already verified on this site')
      }

      let socialUsername = "";
      let followersCount = 0;
      switch (site_name) {
        case 'tiktok':
          const tiktok = await SocialVerifier.verify('tiktok', token);
          console.log("SocialVerifier::tiktok", tiktok);
          socialUsername = tiktok.username;
          followersCount = tiktok.followerCount || 0;
          break;
        case 'instagram':
          const instagram = await SocialVerifier.verify('instagram', token);
          this.logOperation("SOCIAL_VERIFICATION_2", userId, "SOCIAL_VERIFICATION", instagram, "This username is already verified on this site");
          console.log("SocialVerifier::instagram", instagram);
          socialUsername = instagram.username;
          break;
        case 'X':
          const x = await SocialVerifier.verify('twitter', token);
          console.log("SocialVerifier::X", x);
          socialUsername = x.username;
          break;
        case 'facebook':
          // For Facebook, get username from Graph API
          try {
            const fbResponse = await axios.get('https://graph.facebook.com/me', {
              params: {
                fields: 'name',
                access_token: token
              },
              timeout: 10000
            });
            socialUsername = fbResponse.data?.name || `facebook_user_${userId.substring(0, 8)}`;
            console.log("Facebook user:", socialUsername);
          } catch (fbError: any) {
            console.log("Facebook username fetch error:", fbError.message);
            socialUsername = `facebook_user_${userId.substring(0, 8)}`;
          }
          break;
        default:
          return this.makeResponse(400, "Invalid site name");
      }
      console.log("socialUsername", socialUsername);
      this.logOperation("SOCIAL_VERIFICATION_2", userId, "SOCIAL_VERIFICATION_2", { site_id, site_name, socialUsername }, "");

      if (socialUsername == null || socialUsername == undefined) {
        return this.makeResponse(400, "Invalid username");
      }

      const siteInfo2 = await this.selectDataQuery('sm_site_users', `site_id='${site_id}' AND username='${socialUsername}' `)
      if (siteInfo2.length > 0) {
        this.logOperation("SOCIAL_VERIFICATION_FAILED", userId, "SOCIAL_VERIFICATION_FAILED", { site_id, site_name, socialUsername }, "This username is already verified on this site");
        return this.makeResponse(400, 'This username is already verified on this site')
      }

      this.updateData("users", `user_id='${userId}'`, { is_social_verified: 'yes' });

      followersCount = await this.updateFollowersCount(socialUsername, site_id, userId, followersCount || 0);
      const sites = await this.selectDataQuery(`sm_site_users`, `site_id='${site_id}' and user_id='${userId}'`);
      if (sites.length > 0) {
        if (followersCount && followersCount > 0) {
          const info = { followers: followersCount, last_synced_at: new Date() }
          await this.updateData(`sm_site_users`, `site_id='${site_id}' and user_id='${userId}'`, info);
        }
      } else {
        const siteInfo = { site_id, user_id: userId, is_verified: 'yes', followers: followersCount, username: socialUsername, link: "", last_synced_at: new Date() }
        await this.insertData(`sm_site_users`, siteInfo);
      }


      try {
        const gems = await this.getRewardGems("SOCIAL_VERIFICATION")
        if (gems > 0) {
          this.rewardGems(userId, gems, `SOCIAL_VERIFICATION_${site_name}`);
        }
        const analyticsResult = await new AnalyticsModel().syncVerifiedUser(site_id, userId);
        console.log("analyticsResult", analyticsResult);
        const first_name = await this.getClientName(userId)
        this.sendAppNotification(userId, "SOCIAL_VERIFICATION", first_name, gems.toString(), "", ` Your ${site_name} username <b>@${socialUsername}</b> has been verified successfully!`);
      } catch (error: any) {
        console.error("Error in socialSignOn:", error);
      }

      const sm_site_users = await this.selectDataQuery(`sm_site_users`, `site_id='${site_id}' and user_id='${userId}'`);
      const sm_site_user = sm_site_users[0];
      return this.makeResponse(200, "Social site added successfully", sm_site_user);

    } catch (error: any) {
      console.error("Error in socialSignOn:", error);
      return this.makeResponse(500, error.message || "Social Sign On failed");
    }
  }


  async appleSignOn(data: any) {
    try {
      logger.info('SOS_REQUEST', data);
      // Expect the front end to send the identity token (JWT) and email.
      // Optionally, the mobile app might send firstName/lastName on the initial sign in.
      const { token, action } = data;

      if (!token) {
        return this.makeResponse(400, "Missing required fields: token or email");
      }

      // Fetch Apple's public keys which are used to verify the JWT signature.
      const appleKeysResponse = await axios.get('https://appleid.apple.com/auth/keys');
      const appleKeys = appleKeysResponse.data.keys;

      // Decode the token header to get the key ID (kid).
      const decodedHeader = jwt.decode(token, { complete: true });
      if (!decodedHeader) {
        return this.makeResponse(400, "Invalid token");
      }
      const kid = decodedHeader.header.kid;

      // Find the corresponding public key from Apple's keys.
      const appleKey = appleKeys.find((key: { kid: string | undefined; }) => key.kid === kid);
      if (!appleKey) {
        return this.makeResponse(400, "No matching Apple public key found");
      }

      const pem = jwkToPem(appleKey);
      const payload: any = jwt.verify(token, pem, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: 'com.tekjuice.socialGems'
      });

      logger.info("Apple token payload:", payload);

      const email = payload.email;
      let userExists: any = await this.getUserByEmail(email);

      if (action == "register") {
        if (userExists.length > 0) {
          return this.makeResponse(400, "User already exists, please login");
        }

        // If the user does not exist, create a new user record.
        const response = await this.signup({
          firstName: "",
          industry_ids: [1, 2, 3, 4, 5, 6, 7, 8],
          lastName: "",
          password: this.getRandomString(), // Since Apple doesn't provide a password.
          user_type: "influencer",
          email: payload.email,
          picture: payload.picture || "",
          source: "apple",
        });


        if (response.status == 200) {
          const userExists: any = await this.getUserByEmail(email);
          if (userExists.length == 0) {
            return this.makeResponse(400, "User does  not exist, please register");
          }
          const user = userExists[0];
          return await this.successLogin(user);

        } else {
          return response
        }
        //  const resp = await this.getTemporaryToken(email, response.user_id, "draft")
        //  return this.makeResponse(200, "Signup successful, please verify your account", resp);



      } else {
        const userExists: any = await this.getUserByEmail(email);
        if (userExists.length == 0) {
          return this.makeResponse(400, "User does  not exist, please register");
        }
        const user = userExists[0];
        return await this.successLogin(user);
      }
    } catch (error: any) {
      console.error("Error during Apple Sign-On:", error.message || error);
      return this.makeResponse(500, "Apple Sign-On failed");
    }
  }


  async login(data: any) {
    const { password } = data;
    const email = data.email?.toLowerCase().trim();
    try {
      const users: any = await this.callQuerySafe(
        `select user_id, status, level_id, email, user_type, email_verified, password from users where LOWER(email) = ?`,
        [email]
      );
      const user = users.length > 0 ? users[0] : null;

      if (!user) {
        // Check if this is an agent login
        const agentLogin = await this.AgentLogin(data);
        if (agentLogin.status == 200) {
          return agentLogin;
        }
        return this.makeResponse(404, "Incorrect email or password");
      }

      const user_id = user.user_id;

      // Verify password before proceeding
      const isPasswordValid = this.verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return this.makeResponse(401, "Incorrect email or password");
      }

      // Upgrade SHA-256 hash to bcrypt after successful verification
      if (this.isSha256Hash(user.password)) {
        try {
          await this.upgradePasswordHash(user.user_id, password);
        } catch (upgradeError) {
          logger.error("Error upgrading password hash:", upgradeError);
          // Non-fatal: continue login even if upgrade fails
        }
      }

      // Email verification temporarily disabled
      if (user.status == 'pendingDelete') {

        const resp = await this.getTemporaryToken(email, user_id, "draft")
        const deletedAccount = await this.getDeletedAccount(user_id)

        let message = 'Your account is pending deletion. By clicking "Yes, reactivate", you will halt the deactivation.';

        if (deletedAccount && deletedAccount.created_on) {
          const deactivatedAt = new Date(deletedAccount.created_on);
          const willDeleteAt = new Date(deactivatedAt);
          willDeleteAt.setDate(willDeleteAt.getDate() + 30);

          const deactivationDate = deactivatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const deletionDate = willDeleteAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

          message = `You deactivated your account on ${deactivationDate}.
On ${deletionDate}, it will no longer be possible for you to restore your social gems account if it was accidentally or wrongfully deactivated.
By clicking "Yes, reactivate", you will halt the deactivation`;
        }

        return this.makeResponse(203, message, resp);
      }

      return await this.successLogin(user)
    } catch (error) {
      this.logOperation("LOGIN_FAILED", email, "LOGIN_FAILED", data, error);
      logger.error("Error in login:", error);
      return this.makeResponse(500, "Login failed. Please try again.");
    }
  }


  async googleSignOn(data: any) { // action: login or register
    try {
      logger.info(`SOS_REQUEST`, data)
      const { token, email, action } = data;

      if (!token || !email) {
        return this.makeResponse(400, "Missing required fields: token or email");
      }

      // Use the Access Token to call Google's Userinfo endpoint
      const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${token}`, // Pass the Access Token here
        },
      });

      const userInfo = response.data;

      logger.info("User Info from Access Token:", userInfo);

      // Verify the email matches
      if (!userInfo || userInfo.email !== email) {
        return this.makeResponse(400, "Invalid Access Token or email mismatch");
      }

      const userExists: any = await this.getUserByEmail(email);
      if (userExists.length > 0) {
        // User exists — log them in
        return await this.successLogin(userExists[0]);
      } else {
        // New user — auto-register then log in
        return await this.signup({
          firstName: userInfo.given_name || "",
          lastName: userInfo.family_name || "",
          password: this.getRandomString(),
          user_type: "influencer",
          email: userInfo.email,
          picture: userInfo.picture || "",
        });
      }
    } catch (error: any) {
      console.error("Error during Google Sign-On:", error.message || error);
      return this.makeResponse(500, "Google Sign-On failed");
    }
  }


  async successLogin(user: any) {
    logger.info(`userOj`, user)
    let user_id = user.user_id;
    let role = user.user_type;
    let profile: any = {};
    let username = user_id;
    let first_name = user_id;
    let fcm_token = '';

    try {
      const profileInfo: any = await this.getUserByUserId(user_id);
      const profileRow = profileInfo && profileInfo.length > 0 ? profileInfo[0] : {};
      username = profileRow.username || user_id;
      first_name = profileRow.first_name || username;
      fcm_token = profileRow.fcm_token || '';
    } catch (e) { logger.error("Error fetching profile info:", e); }

    try {
      profile = await this.getUsersProfile(user_id) || {};
    } catch (e) { logger.error("Error fetching user profile:", e); }

    const accessTokenTime = 43200;
    const refreshTokenTime = 86400;
    const jwts = process.env.JWT_SECRET;
    if (!jwts) {
      logger.error("JWT_SECRET is not configured in environment variables");
      throw new Error("Server configuration error: JWT_SECRET missing");
    }
    const token1 = jwt.sign({ role, user_id, username, type: 'access' }, jwts, { expiresIn: accessTokenTime });
    const token2 = jwt.sign({ role: 'none', user_id, username, type: 'refresh' }, jwts, { expiresIn: refreshTokenTime });

    try {
      setItem(`fcm_${user_id}`, fcm_token);
      setItem(`user_username_${user_id}`, username);
      setItem(`user_first_name_${user_id}`, first_name);
      setItem(`jwt_${user_id}`, token1);
    } catch (e) { logger.error("Error setting cache:", e); }

    try {
      await this.updateData("users_profile", `user_id='${user_id}'`, { fcm_token: "" });
    } catch (e) { logger.error("Error updating fcm_token:", e); }

    try { this.updateSocialProfiles(user_id); } catch (e) {}

    const response = { user_id, user_type: role, ...profile, jwt: token1, refreshToken: token2 };
    return this.makeResponse(200, "Login successful", response);
  }

  async AgentLogin(data: any) {
    const { email, password, businessId } = data;

    try {
      // Get staff with password for verification
      const staff: any = await this.callQuerySafe(
        "SELECT staff_id, first_name, last_name, email, status, type, business_id, password FROM business_staff WHERE email = ?",
        [email]
      );

      if (!staff || staff.length === 0) {
        return this.makeResponse(404, "Incorrect email or password");
      }

      const staffMember = staff[0];

      // Verify password using the new method
      const isPasswordValid = this.verifyPassword(password, staffMember.password);
      if (!isPasswordValid) {
        return this.makeResponse(404, "Incorrect email or password");
      }

      // If password was verified but it's SHA-256, upgrade to bcrypt
      if (this.isSha256Hash(staffMember.password)) {
        await this.upgradePasswordHash(staffMember.staff_id, password);
      }

      if (staffMember.status !== 'active') {
        return this.makeResponse(403, "Account is inactive");
      }

      // Collect all company assignments
      const companies: any[] = [];

      // If staff type and has business_id, add it as primary assignment
      if (staffMember.type === 'staff' && staffMember.business_id) {
        const businessInfo: any = await this.callQuerySafe(
          "SELECT business_id, business_name, verification_status FROM businesses WHERE business_id = ?",
          [staffMember.business_id]
        );
        if (businessInfo && businessInfo.length > 0) {
          companies.push({
            business_id: businessInfo[0].business_id,
            business_name: businessInfo[0].business_name,
            verification_status: businessInfo[0].verification_status,
            assignment_status: 'active',
            assigned_on: staffMember.created_on
          });
        }
      }

      // Add any additional assignments from agent_company_assignments
      const additionalAssignments: any = await this.callQuerySafe(
        `SELECT 
           aca.business_id,
           b.business_name,
           b.verification_status,
           aca.status as assignment_status,
           aca.created_on as assigned_on
         FROM agent_company_assignments aca
         JOIN businesses b ON b.business_id = aca.business_id
         WHERE aca.agent_id = ? AND aca.status = 'active'
         ORDER BY aca.created_on DESC`,
        [staffMember.staff_id]
      );

      // Merge additional assignments, avoiding duplicates
      if (additionalAssignments && additionalAssignments.length > 0) {
        for (const assignment of additionalAssignments) {
          const exists = companies.some(c => c.business_id === assignment.business_id);
          if (!exists) {
            companies.push(assignment);
          }
        }
      }

      // If no assignments
      if (companies.length === 0) {
        return this.makeResponse(403, "No company assignments found");
      }

      // If multiple assignments and no businessId provided, ask to select
      if (companies.length > 1 && !businessId) {
        return this.makeResponse(202, "Multiple companies found. Please select a company and login again.", companies);
      }

      // Determine selected business_id
      let selectedBusinessId = businessId;
      if (!selectedBusinessId && companies.length === 1) {
        selectedBusinessId = companies[0].business_id;
      }

      // Validate provided businessId is assigned to staff
      if (selectedBusinessId) {
        const match = companies.some((c: any) => c.business_id === selectedBusinessId);
        if (!match) {
          return this.makeResponse(400, "Invalid businessId for this staff member");
        }
      } else {
        return this.makeResponse(400, "businessId is required");
      }

      // Generate JWTs for staff with businessId embedded
      const accessTokenTime = 43200;
      const refreshTokenTime = 17280000;
      const jwts: any = process.env.JWT_SECRET;

      const token1 = jwt.sign(
        {
          role: 'agent',
          staff_id: staffMember.staff_id,
          business_id: selectedBusinessId,
          email: staffMember.email,
          type: staffMember.type,
          jwt_type: 'access'
        },
        jwts,
        { expiresIn: accessTokenTime }
      );
      const token2 = jwt.sign(
        {
          role: 'none',
          staff_id: staffMember.staff_id,
          business_id: selectedBusinessId,
          email: staffMember.email,
          type: staffMember.type,
          jwt_type: 'refresh'
        },
        jwts,
        { expiresIn: refreshTokenTime }
      );

      const response = {
        staff_id: staffMember.staff_id,
        first_name: staffMember.first_name,
        last_name: staffMember.last_name,
        email: staffMember.email,
        type: staffMember.type,
        business_id: selectedBusinessId,
        jwt: token1,
        refreshToken: token2,
      };

      return this.makeResponse(200, "Login successful", response);
    } catch (error) {
      logger.error("Error in AgentLogin:", error);
      return this.makeResponse(500, "Staff login failed");
    }
  }

  async searchUser(data: any) {
    const { q } = data
    if (q.length < 2) {
      return this.makeResponse(200, "Too short query, we need at least 3 characters", []);
    }
    // const users: any = await this.callQuerySafe(`select u.user_type,u.email,up.username,up.first_name,up.last_name,up.profile_pic,up.phone,up.country_id,up.iso_code,up.referral_code from users u inner join users_profile up on u.user_id = up.user_id where u.user_type='influencer' and up.username like '${q}%'`)
    const users: any = await this.callQuerySafe(`select * from users u inner join users_profile up on u.user_id = up.user_id where u.user_type='influencer' and up.username like '${q}%' or up.first_name like '${q}%' or up.last_name like '${q}%' LIMIT 50`)
    return this.makeResponse(200, "success", users);
  }


  async refreshToken(data: any) {
    const { userId } = data
    const users: any = await this.selectDataQuery('users', `user_id='${userId}'`)
    if (users.length == 0) {
      return this.makeResponse(404, "User not found");
    }
    const user = users[0]

    let user_id = user.user_id;
    let role = user.user_type;

    const accessTokenTime = 86400
    const jwts: any = process.env.JWT_SECRET;
    const token1 = jwt.sign({ role, user_id, type: 'access' }, jwts, {
      expiresIn: accessTokenTime,
    });
    const response = { jwt: token1 };
    return this.makeResponse(200, "Token refresh successful", response);
  }



  async getUserByPhoneNumber(phone: any) {
    const existingUsersPhone = await this.getUserByPhone(phone);
    return this.makeResponse(200, "Success", existingUsersPhone);
  }
  async getUserProfile(id: any) {
    const existingUsersPhone = await this.getUsersProfile(id);
    return this.makeResponse(200, "Success", existingUsersPhone);
  }

  async queryUserInfo(id: any) {
    const existingUsersPhone = await this.getUsersProfile(id, false);
    return this.makeResponse(200, "Success", existingUsersPhone);
  }

  async getReviews(userId: any) {
    const reviews = await this.getUserReviews(userId);
    return this.makeResponse(200, "Success", reviews);
  }

  async countries() {
    const existingUsersPhone = await this.selectDataQuery(`countries`);
    return this.makeResponse(200, "Success", existingUsersPhone);
  }

  async industries() {
    const existingUsersPhone = await this.selectDataQuery(`industries`);
    return this.makeResponse(200, "Success", existingUsersPhone);
  }

  async checkIndustryId(id: any) {
    return await this.selectDataQuery(`industries`, `id='${id}'`);
  }

  async checkCountryId(id: any) {
    return await this.selectDataQuery(`countries`, `id='${id}'`);
  }

  async secureAccount(data: any) {
    const { userId, username, password, confirm_password } = data;
    if (password !== confirm_password) {
      return this.makeResponse(400, "Passwords do not match");
    }
    const userInfo: any = await this.getUserById(userId);
    if (userInfo.length === 0) {
      return this.makeResponse(400, "User not found");
    }
    const user = userInfo[0];
    if (user.status !== "draft") {
      return this.makeResponse(400, "Account already has a password set");
    }
    const hashPassword = this.hashPassword(password);



    // update username 
    const newUsername = username;


    if (newUsername.includes('user-')) {
      return this.makeResponse(400, "Username can't include the phrase, user-");
    }

    if (newUsername.includes(' ')) {
      return this.makeResponse(400, "Username cannot contain spaces");
    }

    if (newUsername.length < 3 || newUsername.length > 40) {
      return this.makeResponse(400, "New username should be between 3 to 40 characters");
    }

    const userInfo1: any = await this.getUserByUserName(newUsername);
    if (userInfo1.length > 0) {
      return this.makeResponse(400, "Username already taken");
    }

    // Update the username
    const newUser = { username: newUsername };
    await this.updateData("users_profile", `user_id='${userId}'`, newUser);
    await this.updateData("users", `user_id='${userId}'`, { password: hashPassword, status: "active" });
    return this.makeResponse(200, "Account secured successfully");
  }

  async changeUsername(data: any) {
    try {
      const { currentUsername, userId, newUsername } = data;



      if (newUsername.includes('user-')) {
        return this.makeResponse(400, "Username can't include the phrase, user-");
      }

      if (newUsername.includes(' ')) {
        return this.makeResponse(400, "Username cannot contain spaces");
      }

      if (newUsername.length < 3 || newUsername.length > 40) {
        return this.makeResponse(400, "New username should be between 3 to 40 characters");
      }

      const userInfoProfile: any = await this.getUserCompleteprofile(userId);
      if (userInfoProfile.length == 0) {
        return this.makeResponse(400, "User not found");
      }
      const currentUsername_ = userInfoProfile[0].username;
      if (currentUsername_ == newUsername) {
        return this.makeResponse(200, "Username already updated");
      }
      const username_updated_at = userInfoProfile[0].username_updated_at;
      if (username_updated_at) {
        const lastUpdated = new Date(username_updated_at);
        const now = new Date();
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        if (lastUpdated > threeMonthsAgo) {
          // return this.makeResponse(400, "You can only change your username once every 3 months");
        }
      }



      const userInfo: any = await this.getUserByUserName(newUsername);
      if (userInfo.length > 0) {
        return this.makeResponse(400, "Username already taken");
      }

      // Update the username
      const newUser = { username: newUsername, username_updated_at: new Date() };
      await this.updateData("users_profile", `user_id='${userId}'`, newUser);
      return this.makeResponse(200, "Username updated successfully", newUser);
    } catch (error) {
      console.error("Error in updateProfile:", error);
      return this.makeResponse(500, "Error updating profile");
    }
  }

  async signup(data: any) {
    try {
      console.log("signup", data);
      const { first_name, last_name, country_id, iso_code, email, user_type, phone_number, referral_code, source } = data;
      const userTypes = ["influencer", "brand"];
      if (!userTypes.includes(user_type)) {
        return this.makeResponse(400, "User type must be either 'influencer' or 'brand' or 'business'");
      }
      const newPhone = await this.stripePhoneNumber(phone_number)

      let numericCountryId: number | null = null;
      if (country_id) {
        const countryData: any = await this.callQuerySafe(`SELECT id FROM countries WHERE iso2='${country_id}' OR id='${country_id}'`);
        if (!countryData || countryData.length === 0) {
          return this.makeResponse(400, "Country does not exist");
        }
        numericCountryId = countryData[0].id;
      }
      if (newPhone) {
        const userByPhone: any = await this.getUserByPhone(newPhone);
        if (userByPhone.length > 0) {
          return this.makeResponse(400, "Phone number already exists, please login");
        }
      }

      const userId = user_type == 'brand' ? "b" + this.getRandomString() : "u" + this.getRandomString();

      await this.beginTransaction();
      const random_password = this.getRandomString();





      if (user_type === "brand") {
        const publicEmails = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"];
        const emailDomain = email.split("@")[1];
        if (publicEmails.includes(emailDomain)) {
          // return this.makeResponse(400, "Public email addresses are not allowed for brand accounts.");
        }
      }

      const existingUsers: any = await this.getUserByEmail(email);
      if (existingUsers.length > 0) {
        return this.makeResponse(400, "Email already exists");
      }

      const hashPassword = this.hashPassword(random_password);
      const newUser = { user_id: userId, business_id: userId, user_type, email, password: hashPassword, status: "active", source };
      await this.insertData("users", newUser);

      const username = await this.getNextUsername();
      const referral_code_ = this.getTrimedString(6).toUpperCase();

      const newProfile: UserProfile = { user_id: userId, username, iso_code, first_name, last_name, phone: newPhone, country_id: numericCountryId as any, referral_code: referral_code_ };

      if (user_type == 'brand') {
        try {
          const staffId = "stf" + this.getTrimedString(20);
          const newBusiness = {
            business_id: userId,
            name: data.business_name || "",
            owner_id: staffId,
            address: "",
            phone: newPhone,
            email: email,
            is_registered: "no",
            country: iso_code || "",
            created_by_type: "brand"
          }
          await this.insertData("business_profile", newBusiness);
          const newStaff = {
            staff_id: staffId,
            business_id: userId,
            first_name: first_name,
            last_name: last_name,
            email: email,
            role: 'owner',
            added_by: staffId,
            password: random_password,
            verification_status: 'pending'
          };
          await this.insertData("business_staff", newStaff);
        } catch (error) {
          console.error("Error in signup:", error);
        }
      }

      await this.insertData("users_profile", newProfile);



      if (referral_code && referral_code != "000000") {
        try {
          const refererUser = await this.getUserByReferralCode(referral_code);

          if (refererUser.length === 0) {
            return this.makeResponse(400, "Invalid referral code");
          }

          const gems = await this.getRewardGems("REFERRAL_BONUS")
          const refererUserId = refererUser[0].user_id;
          const referralData = {
            user_id: userId,
            referrer_user_id: refererUserId,
            referral_code: referral_code,
            gems: gems
          };
          await this.insertData("referrals", referralData);
          if (gems > 0) {
            this.rewardGems(refererUserId, gems, 'REFERRAL_BONUS');
          }

        } catch (error) {
          logger.error("Error processing referral code:", error);
        }
      }

      await this.commitTransaction();
      const referal_code = this.getTrimedString(6).toUpperCase();

      // Create Stellar wallet for new user (async, non-blocking)
      try {
        const UserStellarService = (await import('../helpers/UserStellarService')).UserStellarService;
        const userStellarService = new UserStellarService();
        userStellarService.createUserStellarWallet(userId).catch((err: any) => {
          logger.warn(`Failed to create Stellar wallet for user ${userId}:`, err);
        });
      } catch (error) {
        logger.warn("Could not initialize Stellar wallet creation:", error);
      }

      if (source == "apple" || source == "google") {
        this.rewardGems(userId, 30, 'SIGN_UP_POINTS');
      }

      return this.makeResponse(200, "Signup successful", {
        user_id: userId,
        phone_number: newPhone,
        first_name: first_name,
        last_name: last_name,
        referral_code: referal_code,
        username
      });

    } catch (error) {
      await this.rollbackTransaction(); // ✅ Fix: Ensure rollback happens if any step fails
      console.error("Error in signup:", error);
      return this.makeResponse(500, "Error signing up");
    }
  }



  async requestPhoneNumberchange(data: any) {
    const { phone, userId } = data;
    try {
      const userInfo: any = await this.getUserById(userId);
      if (userInfo.length == 0) {
        return this.makeResponse(400, "User not found");
      }
      const userType = userInfo[0].user_type;
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phone)) {
        return this.makeResponse(400, "Invalid phone number");
      }

      if (userType == 'brand') {
        const businessInfo: any = await this.getBusinessByPhone(phone);
        if (businessInfo.length > 0) {
          if (businessInfo[0].business_id == userId) {
            return this.makeResponse(400, "You are already using this phone number");
          }
          return this.makeResponse(400, "Business phone number already exists");
        }
      } else {
        const newPhone = await this.stripePhoneNumber(phone)
        const existingUsersPhone: any = await this.getUserByPhone(newPhone);
        if (existingUsersPhone.length > 0) {
          if (existingUsersPhone[0].user_id == userId) {
            return this.makeResponse(400, "You are already using this phone number");
          }
          return this.makeResponse(400, "Phone number already exists");
        }
      }

      return await this.sendPhoneOTP({ phone: phone, userId: userId });
    } catch (error) {
      console.error("Error in requestPhoneNumberchange:", error);
      return this.makeResponse(500, "Error requesting phone number change");
    }
  }


  async updatePhone(data: any) {
    try {
      const { userId, phone } = data;

      const userInfo: any = await this.getUserById(userId);
      if (userInfo.length > 0) {
        return this.makeResponse(400, "User not found");
      }
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phone)) {
        return this.makeResponse(400, "Invalid phone number");
      }

      if (phone) {
        const existingUsersPhone: any = await this.getUserByPhone(phone);
        if (existingUsersPhone.length > 0 && existingUsersPhone[0].user_id !== userId) {
          //  return this.makeResponse(400, "Phone number already exists"); // alow more than one phone number
        }
        if (existingUsersPhone.length > 0 && existingUsersPhone[0].phone_verified == 'yes' && existingUsersPhone[0].user_id == userId) {
          return this.makeResponse(200, "Phone number already verified");
        }
      }

      // Update the phone number
      const newUser = { phone: phone, phone_verified: 'no' };
      await this.updateData("users_profile", `user_id='${userId}'`, newUser);
      //  await this.sendPhoneOTP({ phone: phone, userId: userId });
      return this.makeResponse(200, "Phone updated successfully, please verify your phone number", newUser);
    } catch (error) {
      console.error("Error in updateProfile:", error);
      return this.makeResponse(500, "Error updating profile");
    }
  }



  async checkIfReceibedBonus() {
    const users: any = await this.callQuerySafe(`SELECT * FROM users`);
    for (let i = 0; i < users.length; i++) {
      const userId = users[i].user_id
      const transactions: any = await this.callQuerySafe(`SELECT * FROM gm_transactions where user_id='${userId}' and narration='SIGN_UP_POINTS' and status='success'`);
      if (transactions.length == 0) {
        await this.rewardGems(userId, 30, "SIGN_UP_POINTS")
      }
    }
    return this.makeResponse(200, "done");

  }

  async verifyBusiness(data: any) {
    try {
      const { userId, business_name, country, is_registered, registration_number, business_address, business_phone, business_email, business_website, business_description, business_logo } = data;

      // Validate userId from JWT
      if (!userId) {
        return this.makeResponse(401, "User not authenticated. Please login again.");
      }

      const business_id = userId;
      // Validate required fields
      if (!business_name || !business_address || !business_phone || !business_email) {
        return this.makeResponse(400, "Missing required business information");
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(business_email)) {
        return this.makeResponse(400, "Invalid business email format");
      }

      // Validate phone format
      const phoneRegex = /^\+?[\d\s-]{10,}$/;
      if (!phoneRegex.test(business_phone)) {
        return this.makeResponse(400, "Invalid business phone format");
      }
      const newPhone = await this.stripePhoneNumber(business_phone)
      if (business_id) {
        const existingBusiness = await this.selectDataQuery("business_profile", `business_id = '${business_id}'`);
        if (existingBusiness.length > 0) {
          //edt
          const updateInfo: any = {}
          if (business_name) updateInfo.name = business_name;
          if (business_address) updateInfo.address = business_address;
          if (business_phone) updateInfo.phone = newPhone;
          if (business_website) updateInfo.website = business_website;
          if (business_email) updateInfo.email = business_email;
          if (business_description) updateInfo.description = business_description;
          if (business_logo) updateInfo.logo = business_logo;
          if (country) updateInfo.country = country;


          if (registration_number) updateInfo.registration_number = registration_number;
          if (is_registered) updateInfo.is_registered = is_registered == 1 ? 'yes' : 'no';

          await this.updateData("business_profile", `business_id = '${business_id}'`, updateInfo);
          return this.makeResponse(200, "Business updated successfully", updateInfo);
        }
      }


      const newBusiness = {
        business_id: business_id,
        name: business_name,
        address: business_address,
        phone: newPhone,
        website: business_website,
        email: business_email,
        description: business_description,
        owner_id: userId,
        verification_status: 'pending',
        registration_number: registration_number,
        country: country,
        is_registered: is_registered == 1 ? 'yes' : 'no',
        rejection_reason: ''
      }
      await this.insertData("business_profile", newBusiness);
      return this.makeResponse(200, "Business added successfully", newBusiness);

    } catch (error) {
      console.error("Error in verifyBusiness:", error);
      return this.makeResponse(500, "Error verifying business");
    }
  }

  async getBusinessById(businessId: string) {
    // Get business details
    const business = await this.selectDataQuery("business_profile", `business_id = '${businessId}'`);
    return business
  }
  async addBusinessStaff(data: any) {
    try {
      const {
        userId,
        business_id,
        first_name,
        last_name,
        staff_email,
      } = data;
      const added_by = userId;
      const role = 'staff';


      // Validate required fields
      if (!business_id || !first_name || !role) {
        return this.makeResponse(400, "Missing required staff information");
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(staff_email)) {
        return this.makeResponse(400, "Invalid staff email format");
      }

      const business = await this.getBusinessById(business_id);
      if (business.length === 0) {
        return this.makeResponse(400, "Business is not approved");
      }
      const ownerId = business[0].owner_id;
      const verificationStatus = business[0].verification_status;
      if (ownerId != added_by) {
        return this.makeResponse(400, "You are not the owner of this business");
      }
      if (verificationStatus == 'pending') {
        return this.makeResponse(400, "Business is not approved yet");
      }

      const staff = await this.selectDataQuery("business_staff", `staff_email = '${staff_email}'`);
      if (staff.length > 0) {
        return this.makeResponse(400, "Staff already exists");
      }

      const password = this.getTrimedString(10);
      const newStaff = {
        staff_id: "stf" + this.getTrimedString(20),
        business_id: business_id,
        first_name: first_name,
        last_name: last_name,
        email: staff_email,
        role: role,
        added_by: added_by,
        password: this.hashPassword(password),
        status: 'active',
        created_on: new Date().toISOString()
      };

      await this.insertData("business_staff", newStaff);
      this.sendEmail("ADD_STAFF", staff_email, first_name, password);
      return this.makeResponse(200, "Staff added successfully", newStaff);

    } catch (error) {
      console.error("Error in addBusinessStaff:", error);
      return this.makeResponse(500, "Error adding business staff");
    }
  }



  async updateProfile(data: any) {
    try {
      console.log("updateProfile", data)
      const { firstName, country_id, iso_code, user_name, userId, industry_ids, address, bio, lastName, phone, fcm_token, email, gender, content_best_at, comfortable_campaign_activities, platforms_most_content, content_types_enjoyed_most, profile_pic } = data;
      const dob = data.date_of_birth || data.dob || null;


      /*
      if (phone) {
        const newPhone = await this.stripePhoneNumber(phone)
        const existingUsersPhone: any = await this.getUserByPhone(newPhone);
        if (existingUsersPhone.length > 0 && existingUsersPhone[0].user_id !== userId) {
          return this.makeResponse(400, "Phone number already exists");
        }
      }
        */

      // Prepare update object
      const updatedUser: UserProfile = { user_id: userId };
      if (firstName) updatedUser.first_name = firstName;
      if (lastName) updatedUser.last_name = lastName;
      if (bio) updatedUser.bio = bio;
      if (country_id) updatedUser.country_id = country_id;
      if (address) updatedUser.address = address;
      if (iso_code) updatedUser.iso_code = iso_code;
      if (dob) updatedUser.dob = dob;
     
      /*
      if (phone) {
        const newPhone = await this.stripePhoneNumber(phone)
        updatedUser.phone = newPhone;
      }
        */

      if (gender) updatedUser.gender = gender;
      if (fcm_token) {
        updatedUser.fcm_token = fcm_token;
        setItem(`fcm_${userId}`, fcm_token);
        const fcmUser = {
          fcm_token: ""
        }
        await this.updateData("users_profile", `fcm_token='${fcm_token}'`, fcmUser);
      }
      let contentForm: ContentForm = {}

      if (user_name && user_name != '') {
        logger.info(`UPDATED_ISSUE`, user_name)
        const userInfo: any = await this.getUserByUserName(user_name);
        if (userInfo.length > 0) {
          if (userInfo[0].user_id != userId) {
            return this.makeResponse(400, "Username already taken");
          }
        }
        updatedUser.username = user_name;
      }


      try {
        if (content_best_at) contentForm.content_best_at = content_best_at;
        if (comfortable_campaign_activities) contentForm.comfortable_campaign_activities = comfortable_campaign_activities;
        if (platforms_most_content) contentForm.platforms_most_content = JSON.stringify(platforms_most_content);
        if (content_types_enjoyed_most) contentForm.content_types_enjoyed_most = JSON.stringify(content_types_enjoyed_most);
        
        // Only update if there's content to save
        if (Object.keys(contentForm).length > 0) {
          const hasContentForm = await this.selectDataQuery("influencer_preferences", `user_id='${userId}'`);
          if (hasContentForm.length > 0) {
            await this.updateData("influencer_preferences", `user_id='${userId}'`, contentForm);
          } else {
            await this.insertData("influencer_preferences", { user_id: userId, ...contentForm });
          }
        }
      } catch (err) {
        logger.info(`UPDATED_ISSUE`, err)
        //    return this.makeResponse(400, `Failed to updated profile`);
      }

      // Handle industry_ids update
      if (industry_ids) {
        try {
          const parsedIndustryIds = Array.isArray(industry_ids) ? industry_ids : JSON.parse(industry_ids);

          if (!Array.isArray(parsedIndustryIds) || parsedIndustryIds.length === 0) {
            return this.makeResponse(400, "Invalid industry_ids format. Must be a non-empty array.");
          }
          for (let industryId of parsedIndustryIds) {
            const industryExists = await this.checkIndustryId(industryId);
            if (!industryExists) {
              return this.makeResponse(400, `Industry ID ${industryId} does not exist`);
            }
          }

          await this.deleteData(`user_industries`, `user_id='${userId}'`);

          const industryValues = parsedIndustryIds.map(id => `('${userId}', '${id}', '${userId}${id}')`).join(",");
          await this.callQuerySafe(`INSERT INTO user_industries (user_id, industry_id, user_in_id) VALUES ${industryValues}`);
        } catch (err) {
          logger.info(`UPDATED_ISSUE`, err)
          return this.makeResponse(400, `Failed to updated profile`);
        }
      }

      // Update the user profile
      this.updateData("users", `user_id='${userId}' and status='draft'`, { status: "active" });
      await this.updateData("users_profile", `user_id='${userId}'`, updatedUser);
      try {
        if (Object.keys(contentForm).length > 0) {
          await this.updateData("users_profile", `user_id='${userId}'`, contentForm);
        }
      } catch (err) {
        logger.info(`UPDATED_ISSUE`, err)
        //    return this.makeResponse(400, `Failed to updated profile`);
      }
      updatedUser.industry_ids = industry_ids
      this.addUserToChannel(userId)


      return this.makeResponse(200, "Profile updated successfully", updatedUser);
    } catch (error) {
      console.error("Error in updateProfile:", error);
      return this.makeResponse(500, "Error updating profile");
    }
  }


  async changePassword(data: any) {
    const { oldPassword, staff_id, newPassword } = data;
    const hashedOldPassword = this.hashPassword(oldPassword);
    const hashedNewPassword = this.hashPassword(newPassword);

    const existingUser: any = await this.getLoggedInUser(staff_id, hashedOldPassword);
    if (existingUser.length === 0) {
      return this.makeResponse(401, "Auth error");
    }
    const email = existingUser[0].email;
    const user_id = existingUser[0].user_id;
    const first_name = existingUser[0].first_name;

    await this.updateData("users", `user_id = '${user_id}'`, { password: hashedNewPassword });
    this.sendEmail("CHANGE_PASSWORD", email, first_name);

    return this.makeResponse(200, "Password changed successfully");
  }

  async resetPasswordRequest(data: any) {
    try {
      const { email } = data;

      const existingUser: any = await this.getUserByEmail(email);
      if (existingUser.length === 0) {
        return this.makeResponse(404, "Email not found");
      }

      const first_name = existingUser[0].name;
      const otp = await this.getOTP(email);
      this.sendEmail("RESET_PASSWORD_REQUEST", email, first_name, otp);

      return this.makeResponse(200, "Reset password request sent");
    } catch (err) {
      logger.info(err);
      return this.makeResponse(500, "Error processing request");
    }
  }

  async resetPassword(data: any) {
    try {
      const { otp, email, newPassword } = data;
      const hashedNewPassword = this.hashPassword(newPassword);

      if (newPassword.length < 8) {
        return this.makeResponse(400, "Weak password, should be atleast 8 characters");
      }
      const otpRs = await this.selectDataQuery("user_otp", `account_no = '${email}' AND otp = '${otp}' `);
      if (otpRs.length == 0) {
        return this.makeResponse(400, "Invalid OTP");
      }

      await this.updateData("users", `email = '${email}'`, { password: hashedNewPassword });
      this.sendEmail("RESET_PASSWORD_COMPLETE", email, "");

      return this.makeResponse(200, "Password reset successful");
    } catch (err) {
      logger.info(err);
      return this.makeResponse(500, "Error processing request");
    }
  }

  async verifyEmail(data: any) {
    try {
      console.log("verifyEmail", data)
      const { email, otp, user_id } = data;
      const userInfo: any = await this.getUserById(user_id);


      if (otp.length < 3) {
        return this.makeResponse(400, "Invalid OTP");
      }
      const users = await this.selectDataQuery("user_otp", `account_no='${email}' and otp='${otp}'`);
      if (users.length === 0) {
        return this.makeResponse(400, "Invalid OTP");
      }

      await this.updateData("users", `email='${email}'`, { email_verified: 'yes', status: 'active' });

      let resp = {};


      if (userInfo.length === 0) {
        return this.makeResponse(200, "Email verified successfully");
      }
      const user = userInfo[0];

      resp = await this.getTemporaryToken(email, user_id, user.status)
      return this.makeResponse(200, "Email verified successfully", resp);

    } catch (error) {
      console.error("Error in verifyEmail:", error);
      return this.makeResponse(500, "Error verifying email");
    }
  }

  async getTemporaryToken(email: string, user_id: string, status: string) {
    const jwts: any = process.env.JWT_SECRET;
    let token1 = '';
    const accessTokenTime = 2 * 60 * 60; // 2 hours in seconds
    let type = 'none';
    token1 = jwt.sign({ role: 'user', user_id, status: 'active', username: email, type: 'temporary' }, jwts, {
      expiresIn: accessTokenTime,
    });
    type = 'temporary';
    this.rewardGems(user_id, 30, 'SIGN_UP_POINTS');

    return {
      token: token1,
      user_id: user_id,
      status: status,
      type: type
    }
  }


  async verifyPhone(data: any) {
    try {
      console.log("verifyPhone", data)
      const { phone, otp, userId } = data;
      const newPhone = await this.stripePhoneNumber(phone)

      const users = await this.selectDataQuery("user_otp", `account_no='${newPhone}' and otp='${otp}' and user_id='${userId}'`);
      if (users.length === 0) {
        return this.makeResponse(400, "Invalid OTP");
      }
      const user_id = users[0].user_id

      await this.updateData("users_profile", `user_id='${user_id}'`, { phone_verified: 'yes', phone: newPhone });
      await this.updateData("business_profile", `business_id='${user_id}'`, { phone_verified: 'yes', phone: newPhone });

      return this.makeResponse(200, "Phone verified successfully");
    } catch (error) {
      console.error("Error in verifyPhone:", error);
      return this.makeResponse(500, "Error verifying phone");
    }
  }

  async sendEmailOTP(data: any) {
    try {
      console.log("sendEmailOTP", data)
      const { email } = data;
      const otp = await this.getOTP(email);
      this.sendEmail("RESET_PASSWORD_REQUEST", email, "", otp);
      return this.makeResponse(200, "OTP sent successfully");
    } catch (err) {
      logger.info(err);
      return this.makeResponse(500, "Error processing request");
    }
  }

  async sendPhoneOTP(data: { phone: string, userId: string }) {
    const { phone, userId } = data;
    const newPhone = await this.stripePhoneNumber(phone)
    // 1) Generate the OTP
    let otp: string;
    try {
      otp = await this.getOTP(newPhone, userId);
    } catch (err: any) {
      logger.error('OTP generation failed', { phone, error: err });
      return this.makeResponse(500, 'Error generating OTP');
    }

    // 2) Try WhatsApp template
    try {
      const wa = await InfoBipSMS.sendWhatsAppTemplate(newPhone, Number(otp), 'en');
      if (wa?.success) {
        logger.info('OTP sent via WhatsApp', { phone });
        return this.makeResponse(200, 'OTP sent via WhatsApp', wa);
      }
      logger.warn('WhatsApp failed, falling back to SMS', { phone, error: wa?.error });
    } catch (err: any) {
      logger.error('WhatsApp error', { phone, error: err });
    }


    if (SMSHelper.isUgandaAirtelNumber(phone)) {
      const af = await SMSHelper.sendAFSMS(phone, `Your SocialGems OTP is ${otp}`);
      if (af.success) {
        logger.info("OTP sent via Africa's Talking SMS", { phone, messageId: af.messageId });
        return this.makeResponse(200, "OTP sent via Africa's Talking SMS", af);
      }

    } else {
      const sms = await InfoBipSMS.sendSMS(newPhone, `Your SocialGems OTP is ${otp}`);
      if (sms.success) {
        return this.makeResponse(200, 'OTP sent via SMS', sms);
      }
    }

    return this.makeResponse(500, 'Could not send OTP at this time, please try again later');
  }


  async socialSites() {
    const sites = await this.selectDataQuery(`sm_sites`)
    return this.makeResponse(200, "success", sites);
  }

  async userSocialSites(userId: string) {
    const sites = await this.callQuerySafe(`select * from sm_site_users u INNER JOIN sm_sites s on u.site_id = s.site_id where user_id='${userId}' `)
    return this.makeResponse(200, "success", sites);
  }



  async addSocialSite(data: any) {
    try {
      const { site_id, userId, followers, username, link } = data
      const sites = await this.selectDataQuery('sm_sites', `site_id='${site_id}'`)
      if (sites.length == 0) {
        return this.makeResponse(404, 'Site id not found')
      }
      const siteInfo = await this.selectDataQuery('sm_site_users', `site_id='${site_id}' AND user_id='${userId}' `)
      if (siteInfo.length > 0) {
        return this.makeResponse(400, 'You already added the site')
      }

      const usernameExists = await this.selectDataQuery('sm_site_users', `site_id='${site_id}' AND username='${username}' and is_verified='yes' `)
      if (usernameExists.length > 0) {
        return this.makeResponse(400, 'Username for this social site already added and verified')
      }


      if (siteInfo.length > 0) {
        return this.makeResponse(400, 'You already added the site')
      }

      let followersCount: any = 0

      if (site_id == 4) {
        followersCount = await new InstagramAPI().getFollowers(username)
        if (followersCount == null) {
          return this.makeResponse(404, 'Invalid Instagram username')
        }
      } else if (site_id == 2) {
        followersCount = await new TikTokAPIv2().fetchUserFollowers(username)
        if (followersCount == null) {
          return this.makeResponse(404, 'Invalid TikTok username')
        }
      } else if (site_id == 1) {
        followersCount = await new RapiAPI().getXFollowers(username)
        if (followersCount == null) {
          return this.makeResponse(404, 'Invalid X username')
        }
      } else if (site_id == 3) {
        followersCount = await new FacebookAPI().getFollowers(username)
        if (followersCount == null) {
          return this.makeResponse(404, 'Invalid Facebook page')
        }
      }


      const newUser = { site_id, user_id: userId, link, followers: followersCount, username };
      this.rewardGems(data.userId, 2, 'Adding social site')
      const insertedUser = await this.insertData("sm_site_users", newUser);
      return this.makeResponse(200, "Added successfully", newUser);
    } catch (error: any) {
      console.error("Error in signup:", error);
      return this.makeResponse(500, error.toString());
    }
  }



  async resyncFollowers(data: any) {
    const site_id = data.site_id

    const siteInfo: any = await this.callQuerySafe(
      `SELECT * 
     FROM sm_site_users 
     WHERE is_verified = ? 
       AND site_id = ? 
       AND last_synced_at < NOW() - INTERVAL 1 DAY`,
      ["yes", site_id]
    );
    console.log("siteInfo", siteInfo.length)

    for (let i = 0; i < siteInfo.length; i++) {
      const site_id = siteInfo[i].site_id
      const userId = siteInfo[i].user_id
      const username = siteInfo[i].username
      let followersCount: any = 0
      if (site_id == 4) {
        followersCount = await new InstagramAPI().getFollowers(username)

      } else if (site_id == 2) {
        followersCount = await new TikTokAPIv2().fetchUserFollowers(username)

      } else if (site_id == 1) {
        followersCount = await new RapiAPI().getXFollowers(username)

      } else if (site_id == 3) {
        followersCount = await new FacebookAPI().getFollowers(username)
      }

      console.log("resyncFollowers", site_id, username, followersCount)
      if (followersCount != null && followersCount > 0) {
        const newUser = { followers: followersCount, last_synced_at: new Date() };
        await this.updateData("sm_site_users", `site_id='${site_id}' AND user_id='${userId}'`, newUser);
      }
    }
    return this.makeResponse(200, "Followers re-synced successfully");
  }

  async editSocialSite(data: any) {
    try {
      logger.info(`editSocialSite`, data)
      const { site_id, userId, followers, username, link } = data;

      // Ensure required fields are provided
      if (!site_id || !userId) {
        return this.makeResponse(400, 'Required fields are missing');
      }

      const usernameExists = await this.selectDataQuery('sm_site_users', `site_id='${site_id}' AND username='${username}' and is_verified='yes' `)
      if (usernameExists.length > 0) {
        return this.makeResponse(400, 'Username for this social site already added and verified')
      }

      let followersCount: any = 0



      // Dynamically build the update object



      // Check if the record exists
      const siteInfo = await this.selectDataQuery(
        'sm_site_users',
        `site_id='${site_id}' AND user_id='${userId}'`
      );
      if (siteInfo.length === 0) {
        return this.makeResponse(400, 'Social site not added');
      }

      const isVerified = siteInfo[0].is_verified
      if (isVerified == 'yes') {
        return this.makeResponse(400, 'You cannot edit the verified social site')
      }
      // Fetch followers count based on the site_id

      if (site_id == 2) {
        followersCount = await new TikTokAPIv2().fetchUserFollowers(username)
        if (followersCount == null) {
          return this.makeResponse(404, 'Invalid TikTok username')
        }
      } else if (site_id == 1) {
        followersCount = await new RapiAPI().getXFollowers(username)
        if (followersCount == null) {
          return this.makeResponse(404, 'Invalid X username')
        }
      } else if (site_id == 4) {
        followersCount = await new InstagramAPI().getFollowers(username)
        if (followersCount == null) {
          return this.makeResponse(404, 'Invalid Instagram username')
        }
      } else if (site_id == 3) {
        followersCount = await new FacebookAPI().getFollowers(username)
        if (followersCount == null) {
          return this.makeResponse(404, 'Invalid Facebook username')
        }
      }

      const newUser: any = {};
      if (followersCount !== undefined) newUser.followers = followersCount;
      if (username !== undefined) newUser.username = username;
      if (link !== undefined) newUser.link = link;


      // If there are fields to update, proceed with the update
      if (Object.keys(newUser).length > 0) {
        await this.updateData('sm_site_users', `site_id='${site_id}' AND user_id='${userId}'`, newUser);
        return this.makeResponse(200, 'Updated successfully', newUser);
      }

      // If no fields to update, respond with no changes message
      return this.makeResponse(200, 'No changes to update');
    } catch (error: any) {
      console.error('Error in editSocialSite:', error);
      return this.makeResponse(500, error.toString());
    }
  }



  async getUsersbyType(userType: string) {
    const existingUsersPhone = await this.callQuerySafe(`select p.*, l.*, u.user_type from users_profile p INNER JOIN users u ON p.user_id=u.user_id inner join levels l on u.level_id=l.id where u.user_type='${userType}'  order by level_id desc LIMIT 200`);
    return this.makeResponse(200, "Success", existingUsersPhone);
  }
  async leaderBoard() {
    const existingUsersPhone = await this.callQuerySafe(`select * from user_wallets w inner join users_profile p on w.user_id=p.user_id order by w.balance DESC LIMIT 100`);
    return this.makeResponse(200, "board", existingUsersPhone);
  }







  async getUserByReferralCode(referral_code: any) {
    const userInfo: any = await this.selectDataQuery(`users_profile`, `referral_code='${referral_code}'`);
    return userInfo
  }

  async getDeletedAccount(user_id: string) {
    const deleteRequest: any = await this.selectDataQuery(`delete_requests`, `influencer_id='${user_id}' AND status='pending'`);
    if (deleteRequest.length > 0) {
      return deleteRequest[0];
    }
    return null;
  }

  async requestAccountDeletion(data: any) {
    console.log("requestAccountDeletion", data)

    const { userId, reason } = data;
    const userInfo: any = await this.selectDataQuery(`users_profile`, `user_id='${userId}'`);
    if (userInfo.length == 0) {
      return this.makeResponse(400, "User not found");
    }
    const user_id = userInfo[0].user_id

    this.updateData("users", `user_id='${userId}'`, { status: 'pendingDelete' });


    // Create maker-checker request instead of direct deletion
    try {

      const deleteRequest = {
        influencer_id: userId,
        userId,
        reason,
        status: 'pending',
        created_on: new Date()
      }
      await this.insertData("delete_requests", deleteRequest);
      const requestData = {
        influencer_id: userId,
        userId,
        role: 'USER',
        reason,
        userInfo: userInfo[0],
        timestamp: new Date().toISOString()
      };


      const makerCheckerResult = await makerCheckerHelper.createRequest(
        'DELETE',
        'users',
        userId,
        userId,
        requestData,
        1,
        reason
      );


      return this.makeResponse(200, "Account deletion request submitted successfully", makerCheckerResult);
    } catch (error: any) {
      logger.error("Error in requestAccountDeletion:", error);
      return this.makeResponse(200, "request sent");
    }
  }
  /**
   * Get all delete requests in the last 30 days.
   */
  async getDeleteRequestsIn30Days() {
    try {
      // Gets delete requests created in the last 30 days (regardless of status)
      const query = `
        SELECT *
        FROM delete_requests
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ORDER BY created_at DESC
      `;
      const results: any = await this.callQuerySafe(query);

      for (let i = 0; i < results.length; i++) {
        const result = results[i];

      }

      return this.makeResponse(200, "Delete requests in last 30 days", results);
    } catch (error: any) {
      logger.error("Error in getDeleteRequestsIn30Days:", error);
      return this.makeResponse(500, "Error fetching delete requests");
    }
  }

  async revokeAccountDeletionRequest(data: any) {
    const { userId, reason } = data;

    const userInfo: any = await this.selectDataQuery(`users_profile`, `user_id='${userId}'`);
    if (userInfo.length == 0) {
      return { status: 404, message: "User not found" };
    }

    await this.updateData("delete_requests", `influencer_id='${userId}'`, { status: 'revoked', reason });
    await this.updateData("users", `user_id='${userId}'`, { status: 'active' });

    return { status: 200, message: "Account deletion request revoked successfully" };
  }

  async currencies() {
    // Fetch currencies from database table, fallback to default if table doesn't exist or is empty
    try {
      const currencies = await this.selectDataQuery(`currencies`);
      if (currencies && currencies.length > 0) {
        return { status: 200, message: "Success", data: currencies };
      }
    } catch (error) {
      // Table might not exist, return default currencies
    }
    // Default currencies
    const defaultCurrencies = [
      { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
      { code: 'USD', name: 'US Dollar', symbol: 'USD' },
      { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
      { code: 'GBP', name: 'British Pound', symbol: 'GBP' },
      { code: 'EUR', name: 'Euro', symbol: 'EUR' }
    ];
    return { status: 200, message: "Success", data: defaultCurrencies };
  }

  async ranks() {
    // Fetch ranks from database table, fallback to default if table doesn't exist or is empty
    try {
      const ranks = await this.selectDataQuery(`influencer_ranks`);
      if (ranks && ranks.length > 0) {
        return { status: 200, message: "Success", data: ranks };
      }
    } catch (error) {
      // Table might not exist, return default ranks
    }
    // Default ranks
    const defaultRanks = [
      { id: 1, name: 'Bronze', min_points: 0, max_points: 1000 },
      { id: 2, name: 'Silver', min_points: 1001, max_points: 5000 },
      { id: 3, name: 'Gold', min_points: 5001, max_points: 10000 }
    ];
    return { status: 200, message: "Success", data: defaultRanks };
  }

  async jobNiches() {
    // Fetch job niches from database table, fallback to default if table doesn't exist or is empty
    try {
      const niches = await this.selectDataQuery(`job_niches`);
      if (niches && niches.length > 0) {
        return { status: 200, message: "Success", data: niches.map((n: any) => n.name) };
      }
    } catch (error) {
      // Table might not exist, return default niches
    }
    // Default job niches
    const defaultNiches = [
      'Fashion & Style',
      'Beauty & Skincare',
      'Food & Drink',
      'Travel',
      'Fitness & Wellness',
      'Tech & Gadgets',
      'Finance & Business',
      'Gaming',
      'Lifestyle',
      'Parenting & Family',
      'Music & Entertainment',
      'Comedy & Skits',
      'Education',
      'Sports',
      'Home & Decor'
    ];
    return { status: 200, message: "Success", data: defaultNiches };
  }

  async getBrandHiredInfluencers(brandId: string) {
    try {
      // Query hired influencers for this brand
      const hiredInfluencers: any = await this.selectDataQuery(`sc_campaign_invites`, `campaign_id IN (SELECT campaign_id FROM act_campaigns WHERE created_by_user_id = '${brandId}') AND invite_status = 'accepted' AND action_status = 'completed'`);

      return { status: 200, message: "Hired influencers retrieved successfully", data: hiredInfluencers };
    } catch (error) {
      console.error("Error in getBrandHiredInfluencers:", error);
      return { status: 500, message: "Error fetching hired influencers" };
    }
  }
}

export default Accounts;
