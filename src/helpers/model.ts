import BaseModel from "./base.model";
import { get } from "./httpRequest";
import { v4 as uuidv4 } from 'uuid';
import EmailSender from './email.helper'
import { logger } from '../utils/logger';
import cloudWatchLogger from './cloudwatch.helper';
import { sendNotification, subscribeToTopic } from "./FCM";
import ChatModel from "../models/chat.model";
import { getItem, setItem } from "./connectRedis";
import bcrypt from 'bcrypt';
const chat = new ChatModel()
const mailer = new EmailSender()

export default class Model extends BaseModel {

    makeResponse(status: number, message: string, data: any = null, logEvent = false, logData: any = null) {
        let resp: any = {
            status,
            message
        };
        if (data !== null) {
            resp.data = data
        }

        try {
            if (logEvent && logData != null) {
                logData.message = message
                this.logOperation(logData.operation, logData.reference, logData.user_id, logData)
            }
        } catch (error) {
            cloudWatchLogger.error("Error in logging operation", error, { logData });
        }
        return resp
    }

    async getRewardGems(reward_type: string) {
        const gems: any = await this.callQuerySafe(`SELECT * FROM reward_activities where gem_code='${reward_type}'`);
        if (gems.length > 0) {
            return gems[0].points;
        }
        return 0;
    }

    getTrimedString(count: number) {
        const uuid = uuidv4();
        const trimmedString = uuid.replace(/-/g, '').substring(0, count);
        return trimmedString;
    }
    getRandomString() {
        const uuid = uuidv4();
        return uuid.replace(/-/g, '');
    }
    generateRandomPassword() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
        const passwordLength = 10;
        let password = '';
        for (let i = 0; i < passwordLength; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            password += characters[randomIndex];
        }
        return password;
    }

    /**
     * Convert JavaScript Date to MySQL DATETIME format
     * @param date - Optional Date object, defaults to current date/time
     * @returns MySQL formatted datetime string (YYYY-MM-DD HH:MM:SS)
     * @example getMySQLDateTime() // "2025-10-10 14:15:56"
     */
    getMySQLDateTime(date: Date = new Date()): string {
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }

    /**
     * Convert JavaScript Date to MySQL DATE format
     * @param date - Optional Date object, defaults to current date
     * @returns MySQL formatted date string (YYYY-MM-DD)
     * @example getMySQLDate() // "2025-10-10"
     */
    getMySQLDate(date: Date = new Date()): string {
        return date.toISOString().slice(0, 10);
    }



    async inviteMember(data: any, role = 'member', status = 'active') {
        try {
            const { groupId, userId, addedBy } = data
            const groupInfo = await this.getGroupById(groupId)
            if (groupInfo.length == 0) {
                throw new Error("Group not found");
            }
            const memberInfo: any = await this.getUserByUserId(userId)
            if (memberInfo.length == 0) {
                throw new Error("member not found");
            }
            const existingMember = await this.selectDataQuery(
                "sc_group_invites",
                `group_id='${groupId}' AND user_id='${userId}' and status='active'`
            );

            if (existingMember.length > 0) {
                return this.makeResponse(400, "Member already exists in the group");
            }

            // Check if the user adding is an admin
            const adminCheck = await this.selectDataQuery(
                "sc_group_members",
                `group_id='${groupId}' AND user_id='${addedBy}' AND role='${role}'`
            );

            if (adminCheck.length === 0) {
                return this.makeResponse(403, "Only admins can add members");
            }

            const newMember = {
                group_id: groupId,
                user_id: userId,
                role,
                status
            };

            const insertedMemberId = await this.insertData("sc_group_invites", newMember);
            if (insertedMemberId == false) {
                throw new Error("Member not added");
            }
            const username = memberInfo[0].username
            const name = groupInfo[0].name
            chat.sendMessage({ conversationId: addedBy, messageType: "GROUP_INVITE", media: "", receiverId: userId, username: name, userId, text: `${username} requesting you to join a group ` })
            return this.makeResponse(200, "Member request set successfully", { memberId: insertedMemberId });
        } catch (error: any) {
            cloudWatchLogger.error("Error in addMember (inviteMember)", error, { data, role, status });
            return this.makeResponse(400, "Failed to add member");
        }
    }

    saveApiLog(body: any) {
        try {
            const clientId = body.clientId || "NA"
            const userId = body.userId || "NA"
            this.insertData("api_logs", { client_id: clientId, user_id: userId, body: JSON.stringify(body) })
        } catch (error) {
            cloudWatchLogger.error("Error in saveApiLog", error);
        }
        return true
    }


    async addMember(data: any, role = 'member') {
        try {
            const { groupId, userId, addedBy } = data
            const groupInfo = await this.getGroupById(groupId)
            if (groupInfo.length == 0) {
                throw new Error("Group not found");
            }
            const memberInfo: any = await this.getUserByUserId(userId)
            if (memberInfo.length == 0) {
                throw new Error("member not found");
            }

            const hasInvite = await this.selectDataQuery(
                "sc_group_invites",
                `group_id='${groupId}' AND user_id='${userId}'`
            );


            const existingMember = await this.selectDataQuery(
                "sc_group_members",
                `group_id='${groupId}' AND user_id='${userId}'`
            );

            if (existingMember.length > 0) {
                return this.makeResponse(400, "Member already exists in the group");
            }

            if (role == 'member') {
                // Check if the user adding is an admin
                const adminCheck = await this.selectDataQuery(
                    "sc_group_members",
                    `group_id='${groupId}' AND user_id='${addedBy}' AND role='admin`
                );

                if (hasInvite.length == 0 && adminCheck.length === 0) {
                    //   return this.makeResponse(400, "Member not invited to the group");
                }
            }

            const newMember = {
                group_id: groupId,
                user_id: userId,
                role,
                status: "active",
            };

            const insertedMemberId = await this.insertData("sc_group_members", newMember);
            if (insertedMemberId == false) {
                throw new Error("Member not added");
            }
            const username = memberInfo[0].username
            const name = groupInfo[0].name
            const addMemberResponse = await subscribeToTopic(memberInfo[0].fcm_token, groupId)
            // await chat.createConversationWithParticipants(groupId, userId, groupId, true)
            //  chat.sendMessage({ conversationId: groupId, messageType: "GROUP_MEMBER", media: "", receiverId: groupId, username: name, userId, text: `${username} joined group` })
            console.log(`addMemberResponse`, addMemberResponse)
            return this.makeResponse(200, "Member added successfully", { memberId: insertedMemberId });
        } catch (error: any) {
            cloudWatchLogger.error("Error in addMember", error, { data, role });
            return this.makeResponse(400, "Failed to add member");
        }
    }

    async getUserGroups(userId: any) {
        return await this.callQuerySafe(`select * from sc_group_members m inner join sc_groups p  on m.group_id=p.group_id where p.group_status='active' and m.user_id='${userId}'`);
    }

    async convertUsdToCurrency(usdAmount: any, targetCurrency: any) {
        console.log("SWAPPER", usdAmount, targetCurrency)
        const ratesObj = await this.selectDataQuery("rate_cache");
        const rate_object = ratesObj[0]['rate_object']
        const ratesJSON = JSON.parse(rate_object)
        const rates = ratesJSON.rates;
        // console.log("RATESINFO", rates)

        const rate = rates[targetCurrency];
        console.log("SWAPPER==>2", rate)
        let rateAmount = 0;

        if (!rate) {
            console.error("Invalid currency code or rate not available.");
            // return 0;
        } else {
            usdAmount * rate;
        }
        rateAmount = usdAmount * rate;
        console.log("SWAPPER==>3", rateAmount)
        return rateAmount;

    }

    async getBusinessById(businessId: string) {
        // Get business details
        const business = await this.selectDataQuery("business_profile", `business_id = '${businessId}'`);
        return business
    }

    async verifyBusiness(data: any, isAdmin = false, owner_id: string = '') {
        try {

            const { userId, business_name, business_id, business_address, business_phone, business_email, business_website, business_description, business_logo } = data;

            if (!isAdmin) {
                owner_id = userId;
            }

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
            if (business_id) {
                const existingBusiness = await this.selectDataQuery("business_profile", `business_id = '${business_id}'`);
                if (existingBusiness.length > 0) {
                    //edt
                    const updateInfo: any = {}
                    if (business_name) updateInfo.name = business_name;
                    if (business_address) updateInfo.address = business_address;
                    if (business_phone) updateInfo.phone = business_phone;
                    if (business_website) updateInfo.website = business_website;
                    if (business_email) updateInfo.email = business_email;
                    if (business_description) updateInfo.description = business_description;
                    if (business_logo) updateInfo.logo = business_logo;
                    await this.updateData("business_profile", `business_id = '${business_id}'`, updateInfo);
                    return this.makeResponse(200, "Business updated successfully", updateInfo);
                }
            }


            const bid = "b" + this.getRandomString();
            const newBusiness = {
                business_id: bid,
                name: business_name,
                address: business_address,
                phone: business_phone,
                website: business_website,
                email: business_email,
                description: business_description,
                owner_id: owner_id,
                verification_status: 'pending'
            }
            await this.insertData("business_profile", newBusiness);
            return this.makeResponse(200, "Business added successfully", newBusiness);

        } catch (error) {
            cloudWatchLogger.error("Error in verifyBusiness", error, { data, isAdmin, owner_id });
            return this.makeResponse(500, "Error verifying business");
        }
    }
    async sendAppNotification(userId: string, operation: string, name: string = '', amount: string = "", customeObj: any = '', reason = '', category: any = 'GENERAL', senderCompanyId: string | null = null) {
        try {
            console.log(`SEND_1`, { userId, operation })
            const userInfo = await this.getUsersProfile(userId)
            const email = userInfo.email

            // const loadName = await this.getClientName(userId)
            //  const first_name = loadName || name
            const first_name = name
            const token = userInfo.fcm_token

            if (customeObj != '') {
                sendNotification(token, customeObj);
                this.saveNotification(operation, userId, customeObj, senderCompanyId, {}, category, "ALL");
                return true
            }


            console.log(`SEND_2`, { userId, operation, token })

            const messageBody = await this.selectDataQuery("notification_templates", `operation = '${operation}' `);
            if (messageBody.length == 0) {
                console.log(`SEND_3`, messageBody)

                return this.makeResponse(404, "operation not found");
            }
            const message = messageBody[0]['body'];
            const subject = messageBody[0]['title'];
            const channel = messageBody[0]['channel'];
            const appcategory = messageBody[0]['category'];



            const new_message = this.constructSMSMessage(message, first_name, "", "", "", reason, amount);
            console.log("new_message", new_message)
            const formatedMessage = this.formatFCMessage(new_message)
            const data = {
                title: subject,
                body: formatedMessage,
                messageType: operation
            };
            console.log(`SEND_4`, data)
            sendNotification(token, data);
            if (channel == "ALL" || channel == "email") {
                if (email) {
                    mailer.sendMail(email, subject, subject, new_message);
                }
            }
            this.saveNotification(subject, userId, formatedMessage, senderCompanyId, data, appcategory, "ALL");

        } catch (error) {
            cloudWatchLogger.error("Error in sendAppNotification", error, { userId, operation, name, amount, category });
        }

        return false
    }

    formatFCMessage(message: string) {
        // Replace <br> tags with newlines
        let plain = message.replace(/<br\s*\/?>/gi, '\n');
        // Remove all HTML tags
        plain = plain.replace(/<[^>]+>/g, '');
        return plain;
    }

    async sendEmail(operation: string, email: string, name = "", otp = "", tableData: any = [], code: string = '') {
        try {
            //return true;
            const messageBody = await this.selectDataQuery("notification_templates", `operation = '${operation}'`);
            console.log(`messageBody`, messageBody)
            if (messageBody.length == 0) {
                console.log(`EMAIL_MESSAGE-1`, email)
                return this.makeResponse(404, "operation not found");
            }
            console.log(`EMAIL_MESSAGE-2`, email)

            // Start of the unordered list
            let listHtml = "<ul>";
            // Assuming tableData is an array of objects
            (Array.isArray(tableData) ? tableData : []).forEach((item: any) => {
                listHtml += `<li>${item}</li>`;
            });
            listHtml += "</ul>";

            const message = messageBody[0]['body'];
            const subject = messageBody[0]['title'];
            console.log(`EMAIL_MESSAGE-3`, email)

            const new_message = this.constructSMSMessage(message, name, otp, listHtml, code);
            console.log(`EMAIL_MESSAGE`, email, new_message)
            mailer.sendMail(email, subject, subject, new_message);
            return true;

        } catch (error) {
            cloudWatchLogger.error("Error in sendEmail", error, { operation, email, name, otp });
            return this.makeResponse(203, "Error fetching company");
        }
    }


    async sendEmailToUser(email: string, subject: string, message: string) {
        mailer.sendMail(email, subject, subject, message);
        return true;
    }

    constructSMSMessage(template: string, name: string, otp: string, listHtml: any, code: string, reason = '', amount: any = ''): string {
        try {
            const data: any = {
                name,
                otp,
                amount,
                code,
                reason,
                AGENT_URL: process.env.AGENT_URL || "https://agent.socialgems.me",
                SITE_URL: process.env.BRAND_URL || "https://web.socialgems.me",
                listHtml
            };

            for (const key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    template = template.replace(new RegExp(`{${key}}`, 'g'), data[key]);
                }
            }
            return template;
        } catch (error) {
            console.log(`email_eror`, error)
            return ""
        }

    }


    async fetchCompanyById(companyId: string) {
        return await this.selectDataQuery("company", `company_id = '${companyId}'`);

    }


    generateRandom4DigitNumber() {
        const min = 1000;
        const max = 9999;

        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    // Utility function to validate if the domain is valid
    validateDomain(domain: string) {
        // Regular expression for validating a basic domain format (e.g., example.com)
        // This regex will check for a general pattern like "example.com", without protocols, subdomains, or paths
        const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        // Clean the domain by removing protocols, www, and paths
        let cleanDomain = domain.replace(/^(?:https?:\/\/)?(?:www\.)?/, '').split('/')[0];

        // Validate the cleaned domain against the regex
        return domainRegex.test(cleanDomain);
    }


    validateAndCleanDomain(domain: string) {
        let cleanDomain = domain.replace(/^(?:https?:\/\/)?(?:www\.)?/, '').split('/')[0];
        return cleanDomain;
    }

    // Utility function to check if the email's domain matches the company's domain
    doesEmailDomainMatch(email: any, domain: any) {
        const emailDomain = email.split('@')[1];
        return emailDomain === domain;
    }
    async getDocumentByCompanyId(companyId: any, docId: string) {
        return await this.callQuerySafe(`SELECT * FROM documents where owner_id = '${companyId}' AND doc_type='${docId}' AND doc_status!='expired' `);
    }

    async getUserByUserName(username: string) {
        return await this.callQuerySafe(`SELECT * FROM users_profile  where username ='${username}' `);
    }

    async getUserByUserId(username: string) {
        return await this.callQuerySafe(`SELECT * FROM users_profile  where user_id ='${username}' `);
    }
    async validUserByUserName(username: string, userId: string) {
        return await this.callQuerySafe(`SELECT * FROM users_profile  where username ='${username}' and user_id='${userId}' `);
    }

    async getUserByEmail(email: string) {
        return await this.callQuerySafe(`SELECT * FROM users  u inner join users_profile p on u.user_id=p.user_id where u.email ='${email}' `);
    }

    async getUserCompleteprofile(userId: string) {
        return await this.callQuerySafe(`SELECT * FROM users  u inner join users_profile p on u.user_id=p.user_id where u.user_id ='${userId}' `);
    }

    async getUserByPhone(phone: string) {
        return await this.callQuerySafe(`SELECT * FROM users_profile where   phone ='${phone}' and phone_verified='yes' `);
    }

    async getUserById(userId: string) {
        return await this.callQuerySafe(`select wallet_pin,user_id, email,user_type,email_verified,level_name, level_id,status,user_type from users u LEFT JOIN levels l on u.level_id=l.id where user_id='${userId}' `);
    }
    async getUsersEmail(id: string) {
        const userInfo: any = await this.callQuerySafe(`SELECT email FROM users where user_id ='${id}' `);
        console.log("getUsersEmail::userInfo", userInfo)
        return userInfo.length > 0 ? userInfo[0].email : "";
    }




    async getUserIndustries(userId: string) {
        return await this.callQuerySafe(`SELECT industry_id FROM user_industries WHERE user_id='${userId}'`);
    }

    async userUserName(userId: string) {
        const sUserName = await getItem(`user_username_${userId}`) || ""
        if (sUserName == "") {
            const profile: any = await this.callQuerySafe(`SELECT username,first_name FROM users_profile WHERE user_id='${userId}'`);
            const fcm_token = profile[0]?.profile || ""
            const username = profile[0]?.username || ""
            const first_name = profile[0]?.first_name || ""
            setItem(`fcm_${userId}`, fcm_token)
            setItem(`user_username_${userId}`, username)
            setItem(`user_first_name_${userId}`, first_name)
            return username
        }
        return sUserName
    }

    async userIsPartOfCampaign(userId: string, siteId: string) {
        const userIsPartOfCampaign = await this.callQuerySafe(`SELECT * FROM act_task_users s INNER JOIN act_tasks t ON s.activity_id=t.task_id INNER JOIN act_campaigns c ON t.campaign_id=c.campaign_id WHERE user_id='${userId}'  AND t.site_id='${siteId}' AND c.status IN ('active','closed')`);
        return userIsPartOfCampaign
    }

    async sendGroupMessage(userId: string, message: string, group_id: string) {
        const userInfo: any = await this.getUserById(userId)
        const fcm_token = userInfo[0].fcm_token
        if (fcm_token) {
            await new ChatModel().sendMessage({ conversationId: group_id, media: "", receiverId: group_id, username: group_id, group_id, text: message })
        }
    }

    async verifyAgentBusinessAccess(agentId: string, businessId: string): Promise<boolean> {
        try {
          const access: any = await this.callQuerySafe(
            `SELECT * FROM agent_company_assignments 
             WHERE agent_id = ? AND business_id = ? AND status = 'active'`,
            [agentId, businessId]
          );
          return access.length > 0;
        } catch (error) {
          logger.error("Error verifying agent access:", error);
          return false;
        }
      }
      
    async createSocialGemsChannel(group_id: string, name: string) {
        let groups: any = await this.callQuerySafe(`select * from sc_groups  where group_id='${group_id}'`);
        if (groups.length > 0) {
            return false;
        }

        const newGroup = {
            group_id,
            name,
            description: name,
            icon_image_url: "",
            banner_image_url: "",
            rules: "no shouting",
            is_campaign_group: "no",
            membership_type: "open",
            fcm_channel_id: group_id,
            created_by: "system"
        };
        const insertedGroupId = await this.insertData("sc_groups", newGroup);

        await new ChatModel().sendMessage({ conversationId: group_id, media: "", receiverId: group_id, username: group_id, group_id, text: 'user created group' })
        return true
    }

    influencerChannel() { return "grp_inf" + process.env.TABLE_IDENTIFIER + "0000000000xx" }

    //helper scrupts
    async getAllFCMTokens() {
        logger.info("Fetching all FCM tokens...");
        console.log("Fetching all FCM tokens...");
        const influencerChannel = this.influencerChannel();

        const tokens: any = await this.callQuerySafe(`SELECT u.user_id as user, p.fcm_token, user_type from users u inner join  users_profile p ON p.user_id=u.user_id where p.fcm_token is not null and p.fcm_token != '' `);
        logger.info("Found users", tokens.length);

        for (let i = 0; i < tokens.length; i++) {
            const fcm_token = tokens[0].fcm_token || "";
            const user_type = tokens[0].user_type || 0;
            const userId = tokens[0].user || 0;

            if (fcm_token) {
                if (user_type == 'influencer') {
                    await this.createSocialGemsChannel(influencerChannel || "", "Social Gems Influencer Channel")
                    await this.addMember({ groupId: influencerChannel, userId: userId, addedBy: "system" }, 'member')
                }
            }
        }
    }

    async addUserToChannel(userId: string) {
        try {
            const influencerChannel = this.influencerChannel();

            const tokenInfo: any = await this.callQuerySafe(`SELECT fcm_token, user_type from users u inner join  users_profile p ON p.user_id=u.user_id where u.user_id ='${userId}' `);
            const fcm_token = tokenInfo[0].fcm_token || "";
            const user_type = tokenInfo[0].user_type || 0;
            if (fcm_token) {
                if (user_type == 'influencer') {
                    await this.createSocialGemsChannel(influencerChannel || "", "Social Gems Influencer Channel")
                    await this.addMember({ groupId: influencerChannel, userId: userId, addedBy: "system" }, 'member')
                }
            }
            return this.makeResponse(200, "User added to channel successfully");
        } catch (error: any) {
            console.error("Error in addUserToChannel:", error);
            return this.makeResponse(500, "Internal server error");
        }
    }

    async getBusinessProfile(business_id: string) {
        const businesses: any = await this.callQuerySafe(`SELECT * FROM business_profile WHERE owner_id='${business_id}'`);
        return businesses.length > 0 ? businesses[0] : null;
    }

    async getUserAverageRating(userId: string) {
        const result: any = await this.callQuerySafe(`
            SELECT AVG(rating) AS average_rating 
            FROM act_campaign_reviews 
            WHERE user_id='${userId}'
        `);

        return result[0]?.average_rating || 0;
    }
    async getUserProfile(userId: string) {
        const profile: any = await this.callQuerySafe(`SELECT * FROM users_profile WHERE user_id='${userId}'`);
        return profile.length > 0 ? profile[0] : null;
    }

    async stripePhoneNumber(phone: string) {
        try {
            if (phone) {
                const newPhone = phone.replace("+", "");
                return newPhone;
            } else {
                return phone
            }
        } catch (error) {
            return phone
        }
    }

    async getClientName(userId: string) {

        const profile1: any = await this.callQuerySafe(`SELECT * FROM users WHERE user_id='${userId}'`);
        if (profile1.length == 0) {
            return "";
        }
        const userType = profile1[0].user_type || "influencer";
        if (userType == "influencer") {
            const profile: any = await this.callQuerySafe(`SELECT first_name,username FROM users_profile WHERE user_id='${userId}'`);
            return profile.length > 0 ? profile[0].first_name || profile[0].username : "";
        } else {
            const profile: any = await this.callQuerySafe(`SELECT business_name FROM business_profile WHERE owner_id='${userId}'`);
            return profile.length > 0 ? profile[0].name : "";
        }

    }


    async getUsersProfile(userId: string, showBalance = true) {
        const userInfo: any = await this.getUserById(userId);
        console.log(userId);
        if (userInfo.length == 0) return [];

        let business_profile: any = null;
        if (userInfo[0].user_type == 'brand') {
            business_profile = await this.getBusinessProfile(userId);
            if (business_profile) {
                userInfo[0].business_profile = business_profile;
            }
        }

        const profile: any = await this.callQuerySafe(`SELECT * FROM users_profile WHERE user_id='${userId}'`);
        if (profile.length == 0) return [];


        let industry_ids: any = []
        try {
            const industries: any = await this.getUserIndustries(userId)
            industry_ids = industries.map((industry: any) => industry.industry_id)
        } catch (error) {

        }

        profile[0].industry_ids = industry_ids
        const user = userInfo[0]
        const wallet_pin = user.wallet_pin || ""


        if (wallet_pin != null && wallet_pin.length > 30) {
            user.has_pin = true
            user.wallet_pin = "*****"
        } else {
            user.wallet_pin = ""
            user.has_pin = false
        }

        const averageRating = await this.getUserAverageRating(userId);
        user.average_rating = averageRating;

        const wallet = await this.getUserWallet(userId)
        if (showBalance) {
            const combinedResult = {
                ...user,
                ...(profile as any[])[0],
                wallet
            };
            return combinedResult;
        } else {
            return (profile as any[])[0]
        }


    }

    async getLoggedInUser(staff_id: string, password: string) {
        return await this.callQuerySafe(`SELECT * FROM users where user_id = '${staff_id}' AND u.password='${password}' `);
    }

    async getNextUsername() {
        const users: any = await this.callQuerySafe('select id from users_profile order by id desc LIMIT 1')
        const last_id = users.length > 0 ? users[0].id : 0
        const random = this.generateRandom4DigitNumber()
        const username = `user-${last_id}${random}`
        return username
    }

    async GenerateCurrencyWallet(user_id: string, asset: string) {
        try {
            const currency = ["GEMS", "USD"]
            if (!currency.includes(asset)) {
                return false;
            }

            const userWallet: any = await this.callQuerySafe(`select * from user_wallets where user_id='${user_id}' and asset='${asset}'`)
            if (userWallet.length > 0) {
                return userWallet[0]
            }

            const walletObj = {
                wallet_id: asset + this.getRandomString(),
                user_id,
                asset,
                status: 'active',
                wallet_pin: null,
                balance: 0
            }

            await this.insertData(`user_wallets`, walletObj)
            return walletObj;
        } catch (error) {
            console.log(`error`, error)
            return false;
        }

    }

    async saveCronLg(cron_title: string) {
        const walletObj = {
            cron_title,
        }
        await this.insertData(`cron_log	`, walletObj)
        return walletObj;
    }


    async getUserWallet(user_id: string, currency = 'GEMS') {
        console.log(`getUserWallet`, user_id, currency)
        return await this.GenerateCurrencyWallet(user_id, currency)
    }

    async getWalletById(user_id: string) {
        const userWallet = await this.selectDataQuery(`user_wallets`, `wallet_id='${user_id}'`)
        if (userWallet.length > 0) {
            return userWallet[0]
        }
        return false
    }


    async getOTP(account_no: string, userId: string = '') {
        const user: any = await this.selectDataQuery("user_otp", `account_no = '${account_no}' `);
        let otp = this.generateRandom4DigitNumber().toString();
        if (user.length > 0) {
            const createdAt = new Date(user[0].created_at);
            const now = new Date();
            const diffInMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

            if (diffInMinutes < 3) {
                //  return user[0].otp;
            }
        }


        // otp = "1234"
        const userInfo = {
            account_no,
            user_id: userId,
            otp
        }
        console.log(`userInfo`, userInfo)
        if (user.length == 0) {
            const insertedUser = await this.insertData('user_otp', userInfo);
        } else {
            await this.updateData('user_otp', `account_no = '${account_no}'`, userInfo);

        }
        return otp
    }


    async getLevel(points: number) {
        const levelInfo: any = await this.callQuerySafe(`select * from levels where min_gems<=${points} AND max_gems>${points}`)
        if (levelInfo.length > 0) {
            return levelInfo[0].level_id
        } else {
            return 0
        }
    }

    async getSubscriptions() {
        const data = await this.callQuerySafe(`select * from subscriptions`);
        return this.makeResponse(200, "success", data);
    }


    async getSubscription(id: string) {
        return await this.callQuerySafe(`select * from subscriptions where sub_tag='${id}'`);
    }

    async completePendingDeposit(depositId: string, amount: number, status: string) {
        try {

            const statusValues = ['pending', 'success', 'failed'];
            if (!statusValues.includes(status)) {
                return this.makeResponse(400, "Invalid status value");
            }

            // Check if depositId exists
            const depositExists = await this.selectDataQuery("wl_transactions", `trans_id = '${depositId}' and status='PENDING'`);
            if (depositExists.length === 0) {
                return this.makeResponse(404, "Deposit not found");
            }

            await this.updateData('wl_transactions', `trans_id = '${depositId}'`, { status: status });

            const deposit = depositExists[0];
            const userId = deposit.user_id;
            const amount = parseFloat(deposit.amount);
            const wallet = await this.getUserWallet(userId, deposit.asset);


            // If the deposit is completed, update the user's wallet balance
            if (status === 'success') {

                if (wallet) {
                    const newBalance = parseFloat(wallet.balance) + amount;
                    await this.updateData('user_wallets', `wallet_id = '${wallet.wallet_id}'`, { balance: newBalance });
                }
            
            const clientName = await this.getClientName(userId)
            this.sendAppNotification(userId, "DEPOSIT", clientName, amount.toString(), "", "Deposit", "WALLET", process.env.ADMIN_WALLET || "0X0000000000")
            return this.makeResponse(100, "Deposit status updated successfully");
            }else{
                return this.makeResponse(400, "Deposit failed");
            }
        } catch (error) {
            console.error("Error in completePendingDeposit:", error);
            return this.makeResponse(203, "Error updating deposit status");
        }
    }

    async rewardGems(userId: string, rewardAmount: number, narration: string, refId: string = '') {

        const userInfo = await this.getUserById(userId);
        const creditWallet: any = await this.getUserWallet(userId, 'GEMS');
        if (!creditWallet) {
            return this.makeResponse(404, "Credit wallet not found");
        }
        const userWalletId = creditWallet.wallet_id

        const issuerWalletId: any = process.env.ADMIN_WALLET || "0X0000000000"
        const dr_wallet_id = issuerWalletId

        return await this.GemsWalletTransfer(userId, userWalletId, "TRANSFER", rewardAmount, 'GEMS', narration, dr_wallet_id, refId)
    }

    //This is for subscriptions
    async creditUserAccount(id: string, amount: any, sub_tag: string) {

        const subInfo: any = await this.getSubscription(sub_tag)
        if (subInfo.length == 0) {
            return this.makeResponse(400, "Invalid subscription plan");
        }

        const user = await this.getUserById(id)
        const level = subInfo[0].id

        const dr_wallet_id = "SUB000000"
        const currency = "USD"
        //the subscriptions have been disabled for now

        return true
    }
    async getCampaignFees() {
        return await this.callQuerySafe(`SELECT * FROM act_campaign_fees`);
    }

    async logOperation(operation: string, reference: string, account: string, req_body: any, resp_body: any = null) {
        try {
            const newLog = {
                operation,
                account,
                reference,
                req_body: typeof req_body === 'object' ? JSON.stringify(req_body) : req_body,
                resp_body: typeof resp_body === 'object' ? JSON.stringify(resp_body) : resp_body
            };
            await this.insertData("operation_logs", newLog);

        } catch (error) {
            console.error("Error in logOperation:", error);
        }
    }




    async GemsWalletTransfer(user_id: string, cr_wallet_id: string, trans_type: any, amount: number, currency: string, narration: any, dr_wallet_id: string, refId: string = '') {
        try {
            console.log({ amount, trans_type })
            const issuerWalletId: any = process.env.ADMIN_WALLET || "0X0000000000"

            if (currency != 'GEMS') {
                return this.makeResponse(404, "Invalid currency");
            }
            if (amount <= 0) {
                return this.makeResponse(404, "Invalid amount");
            }

            const creditWallet: any = await this.getWalletById(cr_wallet_id);
            if (!creditWallet) {
                return this.makeResponse(404, "Credit wallet not found");
            }
            const crUserId = creditWallet.user_id
            console.log(`dr_wallet_id`, dr_wallet_id)

            const debitWallet: any = await this.getWalletById(dr_wallet_id);
            if (!debitWallet) {
                return this.makeResponse(404, "Debit wallet not found");
            }
            const drUserId = debitWallet.user_id
            if (debitWallet.asset != currency) {
                return this.makeResponse(400, "Invalid currency for debit wallet");
            }
            if (creditWallet.asset != currency) {
                return this.makeResponse(400, "Invalid currency for credit wallet");
            }

            const currentDebitBalance = parseFloat(debitWallet.balance)
            if (currentDebitBalance < amount && dr_wallet_id != issuerWalletId) {
                return this.makeResponse(400, "Insufficient funds in debit wallet");
            }


            const currentCreditBalance = parseFloat(creditWallet.balance);
            const newDebitBalance = currentDebitBalance - amount;
            const newCreditBalance = currentCreditBalance + amount;
            console.log("Balances", { currentCreditBalance, newDebitBalance, newCreditBalance })
            await this.beginTransaction();

            // Define the transaction details
            const newTransaction = {
                trans_id: `t${this.getRandomString()}`,
                user_id,
                dr_wallet_id,
                cr_wallet_id,
                asset: currency,
                currency,
                amount,
                trans_type,
                ref_id: refId,
                narration,
                status: 'success'
            };


            await this.insertData('gm_transactions', newTransaction);
            await this.updateData('user_wallets', `wallet_id='${cr_wallet_id}'`, { balance: newCreditBalance });
            await this.updateData('user_wallets', `wallet_id='${dr_wallet_id}'`, { balance: newDebitBalance });

            await this.commitTransaction();

            const level = await this.getLevel(newCreditBalance)
            if (level > 0 && currency == 'GEMS') {

                const userInfo: any = await this.getUserById(crUserId)
                const userLevel = userInfo[0].level_id
                const email = userInfo[0].email
                if (level > userLevel) {
                    await this.updateData('users', `user_id='${crUserId}'`, { level_id: level });
                    this.sendEmail(`LEVEL_INCREASE`, email, "", "", "")
                }
            }

            this.sendAppNotification(crUserId, narration, "", amount.toString(), "", narration, 'GENERAL', process.env.ADMIN_WALLET || "0X0000000000")
            return this.makeResponse(200, "Transfer completed successfully", newTransaction);

        } catch (error) {
            // Rollback in case of error
            await this.rollbackTransaction();
            console.error("Error in walletTransfer:", error);
            this.saveApiLog(error)
            return this.makeResponse(203, "Error creating transfer transaction");
        }
    }

    private normalizeNumber(value: any): number {
        if (typeof value === 'number') return value;
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? NaN : parsed;
        }
        return NaN;
    }



    async walletTransfer(trans_id: string, user_id: string, cr_wallet_id: string, trans_type: any, amount: any, fee: any, currency: string, narration: any, dr_wallet_id: string, refId: string, paymentMethod: string = 'WALLET', account_number: string = '', account_name: string = '') {
        try {
            // Ensure amount and fee are numbers to avoid .toFixed errors
            amount = this.normalizeNumber(amount);
            fee = this.normalizeNumber(fee);

            if (isNaN(amount) || isNaN(fee)) {
                return this.makeResponse(400, "Invalid amount or fee");
            }

            console.log({ amount, trans_type })
            const issuerWalletId: any = process.env.ADMIN_WALLET || "0X0000000000"

            if (currency == 'GEMS') {
                return this.makeResponse(404, "Invalid currency");
            }

            if (amount <= 0) {
                return this.makeResponse(404, "Invalid amount");
            }

            const creditWallet: any = await this.getWalletById(cr_wallet_id);
            if (!creditWallet) {
                return this.makeResponse(404, "Credit wallet not found");
            }
            const crUserId = creditWallet.user_id
            console.log(`dr_wallet_id`, dr_wallet_id)

            const debitWallet: any = await this.getWalletById(dr_wallet_id);
            if (!debitWallet) {
                return this.makeResponse(404, "Debit wallet not found");
            }
            const drUserId = debitWallet.user_id
            if (debitWallet.asset != currency) {
                return this.makeResponse(400, "Invalid currency for debit wallet");
            }
            if (creditWallet.asset != currency) {
                return this.makeResponse(400, "Invalid currency for credit wallet");
            }

            const currentDebitBalance = parseFloat(debitWallet.balance)
            if (currentDebitBalance < amount && dr_wallet_id != issuerWalletId) {
                return this.makeResponse(400, "Insufficient funds in debit wallet");
            }


            const currentCreditBalance = parseFloat(creditWallet.balance);
            const newDebitBalance = currentDebitBalance - amount;
            const newCreditBalance = currentCreditBalance + amount;
            console.log("Balances", { currentCreditBalance, newDebitBalance, newCreditBalance })
            await this.beginTransaction();

            // Define the transaction details
            const newTransaction = {
                trans_id: trans_id,
                user_id,
                dr_wallet_id,
                cr_wallet_id,
                asset: currency,
                currency,
                amount,
                trans_type,
                payment_method: paymentMethod,
                ref_id: refId,
                narration,
                account_number,
                fee,
                account_name,
                system_status: 'PENDING',
                running_balance: newCreditBalance,
                running_balance_dr: newDebitBalance,
                status: 'SUCCESS'
            };
            console.log(`newTransaction`, newTransaction)

            await this.insertData('wl_transactions', newTransaction);
            
            // Update wallet balances and states
            const crWalletUpdate: any = { balance: newCreditBalance };
            const drWalletUpdate: any = { balance: newDebitBalance };
            
            // Update credit wallet states (received money)
            if (trans_type === 'DEPOSIT' || trans_type === 'TRANSFER' || trans_type === 'CR') {
                crWalletUpdate.available_balance = parseFloat(creditWallet.available_balance || 0) + amount;
                crWalletUpdate.total_earned = parseFloat(creditWallet.total_earned || 0) + amount;
            }
            
            // Update debit wallet states (sent money)
            if (trans_type === 'WITHDRAW' || trans_type === 'TRANSFER' || trans_type === 'DR') {
                drWalletUpdate.available_balance = parseFloat(debitWallet.available_balance || 0) - amount;
                drWalletUpdate.total_withdrawn = parseFloat(debitWallet.total_withdrawn || 0) + amount;
            }
            
            await this.updateData('user_wallets', `wallet_id='${cr_wallet_id}'`, crWalletUpdate);
            await this.updateData('user_wallets', `wallet_id='${dr_wallet_id}'`, drWalletUpdate);
            await this.commitTransaction();

            const clientName = await this.getClientName(crUserId)
            const clientName2 = await this.getClientName(drUserId)

            this.sendAppNotification(crUserId, narration, clientName, amount.toString(), "", narration, "WALLET", process.env.ADMIN_WALLET || "0X0000000000")
            this.sendAppNotification(drUserId, narration, clientName2, amount.toString(), "", narration, "WALLET", process.env.ADMIN_WALLET || "0X0000000000")

            return this.makeResponse(200, "Transfer completed successfully", newTransaction);

        } catch (error) {
            // Rollback in case of error
            await this.rollbackTransaction();
            console.error("Error in walletTransfer:", error);
            return this.makeResponse(203, "Error creating transfer transaction");
        }
    }


    getConversationId(user1: string, user2: string): string {
        const [sortedUUID1, sortedUUID2] = [user1, user2].sort();
        return `${sortedUUID1}:${sortedUUID2}`;
    }

    async countries() {
        const rs: any = await this.callQuerySafe(`select * from countries `);
        return rs;
    }
    async getCountryById(id: any) {
        const rs: any = await this.callQuerySafe(`select * from countries where id='${id}' `);
        return rs;
    }

    async getGroupById(id: any) {
        const rs: any = await this.callQuerySafe(`select * from sc_groups where group_id='${id}' and group_status='active'`);
        return rs;
    }

    hashPassword(password: string) {

        const saltRounds = 12;
        return bcrypt.hashSync(password, saltRounds);
    }

    isBcryptHash(hash: string): boolean {
        // Bcrypt hashes start with $2a$, $2b$, $2x$, or $2y$ and are 60 characters long
        return /^\$2[abxy]\$\d{2}\$/.test(hash) && hash.length === 60;
    }

    isSha256Hash(hash: string): boolean {
        // SHA-256 hashes are 64 characters long and contain only hex characters
        return /^[a-f0-9]{64}$/i.test(hash);
    }

    verifyPassword(password: string, hashedPassword: string) {


        // If it's already a bcrypt hash, use bcrypt verification
        if (this.isBcryptHash(hashedPassword)) {
            return bcrypt.compareSync(password, hashedPassword);
        }

        // If it's a SHA-256 hash, verify and upgrade to bcrypt
        if (this.isSha256Hash(hashedPassword)) {
            const crypto = require('crypto');
            const sha256Hash = crypto.createHash("sha256").update(password).digest("hex");

            if (sha256Hash === hashedPassword) {
                // Password matches, but we should upgrade to bcrypt
                // This will be handled by the calling method
                return true;
            }
            return false;
        }

        // Unknown hash format
        return false;
    }

    async upgradePasswordHash(userId: string, password: string) {

        const saltRounds = 12;
        const newHash = bcrypt.hashSync(password, saltRounds);

        // Update the user's password to bcrypt
        await this.callQuerySafe(
            'UPDATE users SET password = ? WHERE user_id = ?',
            [newHash, userId]
        );
    }


    // Function to update transaction status based on webhook confirmation
    async updateTransactionStatus(transaction_id: string, message: string, status: string, system_status: string) {
        try {
            const data = {
                system_status: system_status,
                status: status,
                message: message || status
            }
            console.log(`data`, data)
            await this.updateData('wl_transactions', `trans_id = '${transaction_id}'`, data);
            return this.makeResponse(200, "Transaction status updated successfully");
        } catch (error) {
            console.error("Error in updateTransactionStatus:", error);
            return this.makeResponse(203, "Error updating transaction status");
        }


    }

    async saveNotification(
        title: string,
        recipientUserId: string,
        message: any,
        senderCompanyId: string | null = null,
        response: any = '',
        category = 'GENERAL',
        channel = 'ALL'
    ) {
        try {
            const newUser = {
                title,
                user_id: recipientUserId,
                category,
                company_id: senderCompanyId,
                message: typeof message === 'object' ? JSON.stringify(message) : message,
                response_body: typeof response === 'object' ? JSON.stringify(response) : response,
                channel,
                status: 'unread'
            };
            return await this.insertData('notifications', newUser);
        } catch (error: any) {
            console.error('DBINSERTERROR=======>', error);
        }
        return true
    }

    defaultPeriod() {
        return "TS00001"
    }

    async getDocVerifiers(c: string) {
        return await this.callQuerySafe(`select * from verifiers where doc_id='${c}'`);
    }

}