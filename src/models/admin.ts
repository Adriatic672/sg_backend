import Model from "../helpers/model";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from 'google-auth-library';
import { createItem, deleteItem, getItemByFields, getItemById, updateItem } from "../helpers/dynamodb.helper";
import axios from 'axios';
import { group } from "console";
import ChatModel from "../models/chat.model";
import { ActivityNews, Post } from "../interfaces/dynamodb.interfaces";
import { logger } from "../utils/logger";
import cloudWatchLogger from "../helpers/cloudwatch.helper";
import { getItem, setItem } from "../helpers/connectRedis";
import makerCheckerHelper from "../helpers/makerChecker.helper";
import bcrypt from 'bcrypt';

const chat = new ChatModel()

class Admin extends Model {


  dynamoDbClient: any;



  async getRates() {
    try {
      const rates = await this.callQuerySafe("SELECT * FROM exchange_rates ORDER BY updated_at DESC");
      return this.makeResponse(200, "Rates retrieved successfully", rates);
    } catch (error) {
      cloudWatchLogger.error("Error in getRates", error);
      return this.makeResponse(500, "Error retrieving rates");
    }
  }


  async updateRate(rateId: number, data: any) {
    try {
      const { role, rate, markup } = data;
      if (role != 'super_admin') {
        return this.makeResponse(403, "You do not have permission to update rates");
      }
      const updatedData = {
        rate,
        markup,
        updated_at: new Date(),
      };
      await this.updateData("exchange_rates", `id='${rateId}'`, updatedData);
      return this.makeResponse(200, "Rate updated successfully");
    } catch (error) {
      cloudWatchLogger.error("Error in updateRate", error, { rateId, data });
      return this.makeResponse(500, "Error updating rate");
    }
  }

  async deleteRate(rateId: number) {
    logger.info("deleteRate", rateId);
    try {
      return this.makeResponse(403, "You do not have permission to update rates");

      await this.deleteData("exchange_rates", `id='${rateId}'`);
      return this.makeResponse(200, "Rate deleted successfully");
    } catch (error) {
      logger.error("Error in deleteRate", { error });
      return this.makeResponse(500, "Error deleting rate");
    }
  }

  async addRate(data: any) {
    try {
      const { from_currency, to_currency, rate, markup = 0.0 } = data;
      const newRate = {
        from_currency,
        to_currency,
        rate,
        markup,
        updated_at: new Date(),
      };
      const insertedRateId = await this.insertData("exchange_rates", newRate);
      return this.makeResponse(201, "Rate added successfully", { rateId: insertedRateId });
    } catch (error) {
      logger.error("Error in addRate:", error);
      return this.makeResponse(500, "Error adding rate");
    }
  }
  async getVerifiedBusinessRegistrations() {
    const businesses = await this.callQuerySafe(`SELECT * FROM business_profile p left join countries u on p.country = u.phone_code WHERE verification_status = 'approved'`);
    return this.makeResponse(200, "Business registrations retrieved successfully", businesses);
  }

  async getBusinessProfile(business_id: string) {
    const businesses: any = await this.callQuerySafe(`SELECT * FROM business_profile p left join countries u on p.country = u.phone_code where business_id = '${business_id}'    `);
    return businesses.length > 0 ? businesses[0] : null;
  }
  async getPendingBusinessRegistrations() {
    const businesses = await this.callQuerySafe(`SELECT * FROM business_profile p left join countries u on p.country = u.phone_code WHERE verification_status = 'pending' or verification_status = 'rejected'`);
    return this.makeResponse(200, "Business registrations retrieved successfully", businesses);
  }

  async getBusinessRegistrations() {
    const businesses = await this.callQuerySafe(`SELECT * FROM business_profile p left join countries u on p.country = u.phone_code;
`);
    return this.makeResponse(200, "Business registrations retrieved successfully", businesses);
  }
  async approveBusiness(data: any) {
    try {
      const { business_id, status, reason, userId } = data;
      const allowedStatuses = ['approved', 'rejected'];
      if (!allowedStatuses.includes(status)) {
        return this.makeResponse(400, "Invalid status. Allowed statuses are 'approved' or 'rejected'.");
      }
      const business: any = await this.callQuerySafe(`SELECT * FROM business_profile WHERE business_id = '${business_id}'`);
      if (business.length === 0) {
        return this.makeResponse(404, "Business registration not found");
      }
      if (status === 'rejected') {
        const businessData = business[0];
        this.sendAppNotification(businessData.owner_id, "BUSINESS_REJECTED", businessData.business_name, "", "", reason);
        await this.updateData("business_profile", `business_id='${business_id}'`, { verification_status: 'rejected', approved_by: userId, approved_at: new Date().toISOString(), rejection_reason: reason });
      } else {
        const businessData = business[0];
        await this.updateData("business_profile", `business_id='${business_id}'`, { verification_status: status, approved_by: userId, approved_at: new Date().toISOString() });
        this.sendAppNotification(businessData.owner_id, "BUSINESS_APPROVED", businessData.business_name, "", "", "Your business registration has been approved");
      }
      return this.makeResponse(200, "Business registration approved successfully");
    } catch (error) {
      logger.error("Error in approveBusiness:", error);
      return this.makeResponse(500, "Error approving business registration");
    }
  }
  async newsCategories() {
    // Fetch from database table if available, otherwise use default categories
    try {
      const categories = await this.selectDataQuery(`news_categories`);
      if (categories && categories.length > 0) {
        const categoryNames = categories.map((c: any) => c.name);
        return this.makeResponse(200, "Categories retrieved successfully", categoryNames);
      }
    } catch (error) {
      // Table might not exist, return default categories
    }
    // Default news categories
    const obj = ['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology'];
    return this.makeResponse(200, "Categories retrieved successfully", obj);
  }
  async approveNews(data: any) {
    logger.info("approveNews", data);
    const { news_id, userId, status } = data;
    const allowedStatuses = ['approved', 'rejected'];
    if (!allowedStatuses.includes(status)) {
      return this.makeResponse(400, "Invalid status. Allowed statuses are 'approved' or 'rejected'.");
    }
    try {
      const news: any = await getItemById("ActivityNews", "news_id", news_id);
      if (!news) {
        return this.makeResponse(404, "News article not found");
      }
      if (news.status === 'approved') {
        return this.makeResponse(400, "News article already approved");
      }
      if (news.created_by === userId) {
        return this.makeResponse(400, "You cannot approve your own news article");
      }
      const updatedPost = {
        status: status,
        approved_by: userId,
        approved_at: new Date().toISOString()
      };
      await updateItem("ActivityNews", "news_id", news_id, updatedPost);
      return this.makeResponse(200, "News article approved successfully", updatedPost);
    } catch (error) {
      logger.error("Error in approveNews:", error);
      return this.makeResponse(500, "Error approving news article");
    }




  }
  async getPendingNews() {
    const news: any = await getItemByFields("ActivityNews", { "status": "pending" });
    return this.makeResponse(200, "Pending news articles retrieved successfully", news);
  }

  async createNews(article: any) {
    logger.info("createNews", article);

    try {
      const ideahub = this.getRandomString();
      const country = article.country || 'us'; // Default to 'us' if not provided
      const category = article.category || 'general';
      const categories = ['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology'];
      const savedArticles: ActivityNews[] = [];
      const newsItem: ActivityNews = {
        news_id: ideahub,
        source: {
          name: article.source.name,
          id: article.source.id || '',
        },
        country: country,
        category: category,
        author: article.author || null,
        title: article.title,
        description: article.description || null,
        news_url: "",
        image_url: article.image_url || null,
        published_at: article.publishedAt,
        content: article.content || null,
        status: 'pending',
        created_by: article.userId,
        ttl: 890000
      };

      await createItem<ActivityNews>("ActivityNews", "news_id", newsItem);
      return this.makeResponse(200, "News article created successfully", newsItem);
    } catch (error) {
      logger.error("Error in createNews:", error);
      return this.makeResponse(500, "Error creating news article");
    }
  }

  async sendNotification(data: any) {
    logger.info("sendNotification", data);
    try {
      const { title, body, recipient, channel } = data;
      if (!title || !body || !channel) {
        return this.makeResponse(400, "Missing required notification information");
      }

      const newNotification = {
        title,
        created_by: data.userId,
        body,
        recipient,
        channel
      };

      const insertedNotificationId = await this.insertData("admin_notifications", newNotification);
      return this.makeResponse(201, "Notification saved successfully", { notificationId: insertedNotificationId });
    } catch (error) {
      logger.error("Error in sendNotification:", error);
      return this.makeResponse(500, "Error saving notification");
    }
  }

  async getNotifications(status: string = 'pending') {
    try {
      const notifications = await this.callQuerySafe(`SELECT * FROM admin_notifications WHERE status = 'pending' ORDER BY id DESC`);
      return this.makeResponse(200, "Notifications retrieved successfully", notifications);
    } catch (error) {
      logger.error("Error in getNotifications:", error);
      return this.makeResponse(500, "Error retrieving notifications");
    }
  }

  async testApproveNotification() {
    const data = {
      id: "1",
      status: "approved",
      userId: "1"
    }
    const influencerChannel = this.influencerChannel();
    const response = await chat.sendMessage({ conversationId: influencerChannel, messageType: "CHAT", media: "", receiverId: influencerChannel, username: "admin", userId: "1", text: "test" })
    logger.info("testApproveNotification-1", response)
    return this.makeResponse(200, "Notification approved and sent successfully");
  }
  async approveNotification(data: any) {
    logger.info("approveNotification", data);
    try {
      const { id, status, userId } = data;
      const notification: any = await this.callQuerySafe(`SELECT * FROM admin_notifications WHERE id = ? AND status = 'pending'`, [id]);
      if (notification.length === 0) {
        return this.makeResponse(404, "Notification not found or already approved");
      }

      const { recipient, title, created_by, body } = notification[0];

      if (created_by == userId) {
        return this.makeResponse(400, "You cannot approve your own notification");
      }
      const approvalObj = ["approved", "rejected"];
      if (!approvalObj.includes(status)) {
        return this.makeResponse(400, "Notification cannot be approved");
      }

      await this.updateData("admin_notifications", `id='${id}'`, { status: status });
      const influencerChannel = this.influencerChannel();
      if (recipient === 'influencer') {
        chat.sendMessage({ conversationId: influencerChannel, messageType: "CHAT", media: "", receiverId: influencerChannel, username: "admin", userId, text: body })
      } else if (recipient === 'all') {
        chat.sendMessage({ conversationId: influencerChannel, messageType: "CHAT", media: "", receiverId: influencerChannel, username: "admin", userId, text: body })
      }
      return this.makeResponse(200, "Notification approved and sent successfully");
    } catch (error) {
      logger.error("approveNotification", error);
      return this.makeResponse(500, "Error approving notification");
    }
  }

  async getObjectives() {
    return await this.callQuerySafe("SELECT * FROM objectives ORDER BY created_at DESC");
  }
  async deactivateAdminUser(adminId: string) {
    try {
      // Check if admin exists and is active
      const admin: any = await this.callQuerySafe(`SELECT * FROM admin_users WHERE user_id = '${adminId}' AND status = 'active'`);
      if (admin.length === 0) {
        return this.makeResponse(404, "Admin user not found or already inactive");
      }
      await this.updateData("admin_users", `user_id='${adminId}'`, { status: 'inactive' });
      return this.makeResponse(200, "Admin user deactivated successfully");
    } catch (error) {
      logger.error("Error in deactivateAdminUser:", error);
      return this.makeResponse(500, "Error deactivating admin user");
    }
  }
  async reactivateAdminUser(adminId: string) {
    try {
      // Check if admin exists and is inactive
      const admin: any = await this.callQuerySafe(`SELECT * FROM admin_users WHERE user_id = '${adminId}' AND status = 'inactive'`);
      if (admin.length === 0) {
        return this.makeResponse(404, "Admin user not found or already active");
      }
      await this.updateData("admin_users", `user_id='${adminId}'`, { status: 'active' });

      // Send email notification
      const adminEmail = admin[0].email;
      const adminName = `${admin[0].first_name} ${admin[0].last_name}`;
      this.sendEmail("ADMIN_REACTIVATION", adminEmail, adminName);

      return this.makeResponse(200, "Admin user reactivated successfully");
    } catch (error) {
      logger.error("Error in reactivateAdminUser:", error);
      return this.makeResponse(500, "Error reactivating admin user");
    }
  }

  async resetPassword(data: any) {
    try {
      const { user_id } = data;
      const newPassword = this.generateRandomPassword();
      const adminId = user_id || data.adminId;
      if (!adminId) {
        return this.makeResponse(400, "Missing admin user ID");
      }
      // Check if admin exists
      const admin: any = await this.callQuerySafe(`SELECT * FROM admin_users WHERE user_id = '${adminId}'`);
      if (admin.length === 0) {
        return this.makeResponse(404, "Admin user not found");
      }

      // Hash the new password
      const hashedPassword = this.hashPassword(newPassword);

      // Update the password in the database and set temporary password flag
      await this.updateData("admin_users", `user_id='${adminId}'`, {
        password: hashedPassword,
        has_temporary_password: true
      });

      // Send email notification
      const adminEmail = admin[0].email;
      const adminName = `${admin[0].first_name} ${admin[0].last_name}`;
      this.sendEmail("ADMIN_PASSWORD_RESET", adminEmail, adminName, newPassword);

      return this.makeResponse(200, "Password reset successfully");
    } catch (error) {
      logger.error("Error in resetPassword:", error);
      return this.makeResponse(500, "Error resetting password");
    }
  }

  async changePassword(data: any) {
    try {
      const { user_id, current_password, new_password } = data;

      if (!user_id || !new_password) {
        return this.makeResponse(400, "Missing required fields");
      }

      // Check if admin exists
      const admin: any = await this.callQuerySafe(`SELECT * FROM admin_users WHERE user_id = ?`, [user_id]);

      if (admin.length === 0) {
        return this.makeResponse(400, "User not found");
      }

      // If current_password is provided, verify it (for normal password changes)
      if (current_password) {
        const isCurrentPasswordValid = this.verifyPassword(current_password, admin[0].password);
        if (!isCurrentPasswordValid) {
          return this.makeResponse(400, "Current password is incorrect");
        }
      } else {
        // For temporary password changes, check if user has temporary password
        if (!admin[0].has_temporary_password) {
          return this.makeResponse(400, "Current password is required for this operation");
        }
      }

      // Hash the new password with bcrypt
      const hashedNewPassword = this.hashPassword(new_password);

      // Update the password and clear temporary password flag
      await this.updateData("admin_users", `user_id='${user_id}'`, {
        password: hashedNewPassword,
        has_temporary_password: false
      });

      return this.makeResponse(200, "Password changed successfully");
    } catch (error) {
      logger.error("Error in changePassword:", error);
      return this.makeResponse(500, "Error changing password");
    }
  }

  async forgotPassword(data: any) {
    try {
      const { email } = data;

      if (!email) {
        return this.makeResponse(400, "Email is required");
      }

      // Check if admin exists
      const admin: any = await this.callQuerySafe(`SELECT * FROM admin_users WHERE email = ? AND status = 'active'`, [email]);

      if (admin.length === 0) {
        return this.makeResponse(404, "Admin user not found with this email");
      }

      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP in database (expires in 10 minutes)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      // Delete any existing OTP for this email
      await this.callQuerySafe(`DELETE FROM admin_otp WHERE email = ?`, [email]);

      // Insert new OTP
      await this.insertData("admin_otp", {
        email: email,
        otp: otp,
        expires_at: expiresAt,
        created_at: new Date()
      });

      // Send email with OTP
      const adminName = `${admin[0].first_name} ${admin[0].last_name}`;
      await this.sendEmail("ADMIN_FORGOT_PASSWORD", email, adminName, otp);

      return this.makeResponse(200, "Password reset OTP sent to your email");
    } catch (error) {
      logger.error("Error in forgotPassword:", error);
      return this.makeResponse(500, "Error processing forgot password request");
    }
  }

  async resetPasswordWithOTP(data: any) {
    try {
      const { email, otp, newPassword } = data;

      if (!email || !otp || !newPassword) {
        return this.makeResponse(400, "Email, OTP, and new password are required");
      }

      if (newPassword.length < 8) {
        return this.makeResponse(400, "Password must be at least 8 characters long");
      }

      // Verify OTP
      const otpRecord: any = await this.callQuerySafe(`
        SELECT * FROM admin_otp 
        WHERE email = '${email}' AND otp = '${otp}' AND expires_at > NOW()
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      if (otpRecord.length === 0) {
        return this.makeResponse(400, "Invalid or expired OTP");
      }

      // Get admin user
      const admin: any = await this.callQuerySafe(`SELECT * FROM admin_users WHERE email = '${email}'`);

      if (admin.length === 0) {
        return this.makeResponse(404, "Admin user not found");
      }

      // Hash new password
      const hashedNewPassword = this.hashPassword(newPassword);

      // Update password
      await this.updateData("admin_users", `email='${email}'`, {
        password: hashedNewPassword,
        has_temporary_password: false
      });

      // Delete used OTP
      await this.callQuerySafe(`DELETE FROM admin_otp WHERE email = '${email}'`);

      // Send confirmation email
      const adminName = `${admin[0].first_name} ${admin[0].last_name}`;
      await this.sendEmail("ADMIN_PASSWORD_RESET_SUCCESS", email, adminName);

      return this.makeResponse(200, "Password reset successfully");
    } catch (error) {
      logger.error("Error in resetPasswordWithOTP:", error);
      return this.makeResponse(500, "Error resetting password");
    }
  }

  async deactivateObjective(objectiveId: number) {
    try {
      await this.updateData("objectives", `id='${objectiveId}'`, { status: 'inactive' });
      return this.makeResponse(200, "Objective deactivated successfully");
    } catch (error) {
      logger.error("Error in deactivateObjective:", error);
      return this.makeResponse(500, "Error deactivating objective");
    }
  }

  async addAdminUser(data: any) {
    try {
      // Validate required fields
      const { first_name, last_name, email, country } = data;
      if (!first_name || !last_name || !email) {
        return this.makeResponse(400, "Missing required admin user information");
      }

      const existingAdmin: any = await this.callQuerySafe(`SELECT * FROM admin_users WHERE email = '${email}'`);
      if (existingAdmin.length > 0) {
        return this.makeResponse(400, "Admin user with this email already exists");
      }
      const password = this.generateRandomPassword();

      const hashedPassword = this.hashPassword(password);
      const newAdminUser = {
        user_id: this.getRandomString(),
        first_name,
        last_name,
        country: data.country,
        email,
        password: hashedPassword,
        user_type: "admin",
        status: 'active',
        created_by: data.userId,
        level_id: 1,
        email_verified: 'yes'
      };
      this.sendEmail("ADMIN_OTP", email, first_name, password);
      const insertedUserId = await this.insertData("admin_users", newAdminUser);
      return this.makeResponse(200, "Admin user added successfully", { userId: insertedUserId });

    } catch (error) {
      logger.error("Error in addAdminUser:", error);
      return this.makeResponse(500, "Error adding admin user");
    }
  }
  async deleteVideo(videoId: string) {
    try {
      // Check if the video exists
      const response = await deleteItem("training_videos", "video_id", videoId);
      logger.info("Video deleted successfully", response);
      return this.makeResponse(200, "Training video deleted successfully");
    } catch (error) {
      logger.error("Error in deleteTrainingVideo:", error);
      return this.makeResponse(500, "Error deleting training video");
    }
  }

  async editVideo(data: any) {
    try {
      const videoId = data.video_id;
      const updateExpression = [];
      const expressionAttributeValues: any = {};
      for (const key in data) {
        updateExpression.push(`${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = data[key];
      }

      const params = {
        TableName: "training_videos",
        Key: {
          video_id: videoId,
        },
        UpdateExpression: `SET ${updateExpression.join(", ")}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "UPDATED_NEW",
      };

      await this.dynamoDbClient.update(params).promise();
      return this.makeResponse(200, "Training video updated successfully");
    } catch (error) {
      logger.error("Error in updateTrainingVideo:", error);
      return this.makeResponse(500, "Error updating training video");
    }
  }

  async addObjective(data: any) {
    try {
      if (!data.objective) {
        return this.makeResponse(400, "Missing required objective information");
      }
      const newObjective = {
        objective: data.objective
      };
      const insertedObjectiveId = await this.insertData("objectives", newObjective);
      return this.makeResponse(201, "Objective added successfully", { objectiveId: insertedObjectiveId });
    } catch (error) {
      logger.error("Error in addObjective:", error);
      return this.makeResponse(500, "Error adding objective");
    }
  }

  async editObjective(objective_id: number, data: any) {
    try {
      const updatedData = {
        objective: data.objective
      };
      await this.updateData("objectives", `id='${objective_id}'`, updatedData);
      return this.makeResponse(200, "Objective updated successfully");
    } catch (error) {
      logger.error("Error in editObjective:", error);
      return this.makeResponse(500, "Error updating objective");
    }
  }

  async deleteObjective(objective_id: number) {
    try {
      await this.deleteData("objectives", `id='${objective_id}'`);
      return this.makeResponse(200, "Objective deleted successfully");
    } catch (error) {
      logger.error("Error in delete", error);
      return this.makeResponse(500, "Error deleting objective");
    }
  }


  async getusers() {
    return await this.callQuerySafe(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS users
FROM users
GROUP BY DATE(created_at)
 `);
  }



  async sites() {
    const sites = await this.callQuerySafe(`SELECT 
  p.username,
  u.user_id,
  u.site_id,
  u.social_id,
  u.username AS linked_username,
  u.is_verified,
  s.sm_name,
  u.followers
FROM sm_site_users u
INNER JOIN sm_sites s ON u.site_id = s.site_id
INNER JOIN users_profile p ON u.user_id = p.user_id`);
    return this.makeResponse(200, "success", sites);
  }

  async getTemplatesLiterals() {
    return await this.callQuerySafe(`SELECT * FROM notification_literals`);
  }



  async editNotificationTemplate(data: any) {
    const { title, body, id, channel, status } = data
    try {
      const updatedData = {
        title,
        body,
        channel,
        status,
      };
      await this.updateData("notification_templates", `id='${id}'`, updatedData);
      return this.makeResponse(200, "Notification template updated successfully");
    } catch (error) {
      logger.error("Error in editNotificationTemplate:", error);
      return this.makeResponse(500, "Error updating notification template");
    }
  }

  async getCampaigns() {
    return await this.callQuerySafe(`SELECT * FROM act_campaigns c inner join business_profile p on c.created_by=p.business_id where c.status!='draft' ORDER BY c.created_on DESC`);
  }
  async getNotificationTemplates() {
    return await this.callQuerySafe(`SELECT * FROM notification_templates`);
  }

  async getUserWalletById(userId: string) {
    const wallet = await this.callQuerySafe(`SELECT * FROM user_wallets WHERE wallet_id = '${userId}'`);
    const transactions = await this.getUserWalletTransactions(userId)

    return {
      wallet,
      transactions
    };
  }

  async getUserWallets(userId: string) {
    const wallet = await this.callQuerySafe(`SELECT * FROM user_wallets WHERE user_id = '${userId}'`);
    const transactions = await this.getUserWalletTransactions(userId)

    return {
      wallet,
      transactions
    };
  }

  async getUserWalletTransactions(id: string) {
    return await this.callQuerySafe(`SELECT * FROM wl_transactions t where wallet_id ='${id}' ORDER BY t.id DESC LIMIT 100`);
  }

  async getGroups() {
    return await this.callQuerySafe(`SELECT * FROM sc_groups ORDER BY created_at DESC`);
  }
  async getWalletTransactions(currency: string) {
    return await this.callQuerySafe(`SELECT * FROM wl_transactions t inner join users_profile p on t.user_id=p.user_id WHERE currency = '${currency}' ORDER BY t.id DESC LIMIT 100`);
  }



  async getUsersByRegion() {
    return await this.callQuerySafe(`SELECT count(*), iso_code,first_name FROM users_profile  group by iso_code`);
  }

  async deleteAccount(data: any) {
    console.log("deleteAccount", data)
    const { influencer_id, userId, role, reason } = data
    try {
      // Validate admin permissions
      const adminRole = await this.callQuerySafe(`select * from admin_users where user_id=?`, [userId])
      if (adminRole.length == 0) {
        return this.makeResponse(400, "You are not allowed to delete accounts in this environment");
      }
      const userRole = adminRole[0].role

      if (process.env.TABLE_IDENTIFIER != 'stage') {
        if (userRole != 'SUPER_ADMIN') {
          return this.makeResponse(400, "You are not allowed to delete accounts in this environment");
        }

        if (!reason.includes("requested")) {
          return this.makeResponse(400, "Please enter a valid reason");
        }
      }

      // Check if user exists
      const userInfo: any = await this.callQuerySafe(`select * from users where user_id=?`, [influencer_id])
      if (userInfo.length == 0) {
        return this.makeResponse(404, "User not found");
      }

      // Create maker-checker request instead of direct deletion
      const requestData = {
        influencer_id,
        userId,
        role,
        reason,
        userInfo: userInfo[0],
        timestamp: new Date().toISOString()
      };
      if (adminRole[0].role == 'SUPER_ADMIN') {
        return await this.executeDeleteAccount(requestData)
      }



      const makerCheckerResult = await makerCheckerHelper.createRequest(
        'DELETE',
        'users', // Primary table
        influencer_id,
        userId,
        requestData,
        1 // Require 1 approver
      );

      if (makerCheckerResult.status === 200) {
        return this.makeResponse(202, "Delete account request submitted for approval", {
          request_id: makerCheckerResult.data.request_id,
          message: "Your request to delete this account has been submitted and is pending approval."
        });
      } else {
        return this.makeResponse(500, "Failed to create approval request", makerCheckerResult);
      }
    } catch (error: any) {
      logger.error("Error creating maker-checker request for deleteAccount:", error);
      logger.error("Delete account error details:", {
        influencer_id,
        userId,
        role,
        reason,
        error_message: error?.message,
        error_stack: error?.stack
      });
      return this.makeResponse(500, "Error creating approval request");
    }
  }

  /**
   * Execute approved delete account request
   * This function is called when a maker-checker request is approved
   */
  async executeDeleteAccount(requestData: any) {
    console.log("executeDeleteAccount", requestData)
    const { influencer_id, userId, reason, userInfo } = requestData;

    try {
      const userProfile = await this.getUserProfile(influencer_id);
      let name = "";
      if (!userProfile) {
        return this.makeResponse(404, "User not found");
      }

      name = userProfile.first_name || userProfile.username;


      const saveDeleteUser = userInfo;
      const deletedEmail = userProfile.email;
      const email = saveDeleteUser.email;

      // Log the operation
      this.logOperation("deleteAccount", userId, influencer_id, saveDeleteUser);

      this.beginTransaction();

      // Execute the actual deletion
      await this.callQuerySafe(`DELETE FROM users WHERE user_id = '${influencer_id}'`);
      await this.callQuerySafe(`DELETE FROM sm_site_users WHERE user_id = '${influencer_id}'`);
      await this.callQuerySafe(`DELETE FROM users_profile WHERE user_id = '${influencer_id}'`);
      await this.callQuerySafe(`DELETE FROM business_profile WHERE business_id = '${influencer_id}'`);

      this.logOperation("deleteAccount", userId, influencer_id, requestData);
      await this.commitTransaction();

      // Send notification email
      this.sendEmail("DELETE_ACCOUNT", email, name);

      // Save deletion record
      const saveDeleteUserRecord = {
        user_id: influencer_id,
        deleted_by: userId,
        reason: reason,
        status: 'deleted'
      };
      await this.insertData("deleted_users", saveDeleteUserRecord);

      return this.makeResponse(200, "Account deleted successfully");
    } catch (error) {
      console.log("Error in executeDeleteAccount:", error)
      this.logOperation("deleteAccount", userId, influencer_id, requestData);
      logger.error("Error in executeDeleteAccount:", error);
      await this.rollbackTransaction();
      return this.makeResponse(500, "Error deleting account", error);
    }
  }

  async deactivateBrand(data: any) {
    console.log("deactivateBrand", data)
    const { userId, business_id, role, reason } = data
    this.logOperation("deactivateBrand", userId, business_id, data);
    const userInfo: any = await this.callQuerySafe(`select * from users where user_id=?`, [business_id])
    if (userInfo.length == 0) {
      return this.makeResponse(404, "Brand not found");
    }
    const saveDeleteUser = userInfo[0];
    saveDeleteUser.status = 'deleted';
    saveDeleteUser.reason = reason;
    saveDeleteUser.deleted_by = userId;
    saveDeleteUser.deleted_at = new Date()
    try {
      this.beginTransaction()
      // await this.insertData("deleted_users", saveDeleteUser)
      await this.callQuerySafe(`DELETE FROM users WHERE user_id = '${business_id}'`);
      await this.callQuerySafe(`DELETE FROM sm_site_users WHERE user_id = '${business_id}'`);
      await this.callQuerySafe(`DELETE FROM users_profile WHERE user_id = '${business_id}'`);
      await this.callQuerySafe(`DELETE FROM business_profile WHERE business_id = '${business_id}'`);
      await this.commitTransaction()
      this.logOperation("deactivateBrand", userId, business_id, data);
      return this.makeResponse(200, "Account deleted successfully");
    } catch (error) {
      this.logOperation("deactivateBrand", userId, business_id, data);

      logger.error("Error in deactivateBrand:", error);
      await this.rollbackTransaction()
      return this.makeResponse(500, "Error deleting account", error);
    }
  }

  async editBrandName(data: any) {
    try {
      const { userId, business_id, business_name } = data;

      if (!business_id || !business_name) {
        return this.makeResponse(400, "business_id and business_name are required");
      }

      if (!business_name.trim()) {
        return this.makeResponse(400, "Business name cannot be empty");
      }

      this.logOperation("editBrandName", userId, business_id, data);

      // Check if brand exists
      const brandInfo: any = await this.callQuerySafe(
        `SELECT * FROM business_profile WHERE business_id=?`, 
        [business_id]
      );

      if (brandInfo.length === 0) {
        return this.makeResponse(404, "Brand not found");
      }

      // Update business name
      await this.updateData(
        "business_profile", 
        `business_id='${business_id}'`, 
        { name: business_name.trim() }
      );

      this.logOperation("editBrandName", userId, business_id, { 
        old_name: brandInfo[0].name, 
        new_name: business_name.trim() 
      });

      return this.makeResponse(200, "Business name updated successfully");
    } catch (error) {
      logger.error("Error in editBrandName:", error);
      return this.makeResponse(500, "Error updating business name");
    }
  }

  async activateUser(data: any) {
    const { userId, user_id } = data
    await this.updateData("users", `user_id='${user_id}'`, { status: 'active' });
    return this.makeResponse(200, "User activated successfully");
  }

  async getWallets(asset: string, data: any) {
    const limit = data.limit || 3000;
    const offset = data.offset || 0;
    const country = data.country || 'all';
    const ext = country != 'all' ? ` AND p.iso_code='${country}'` : '';
    const search = data.search || '';
    const ext2 = search != '' ? ` AND (p.username LIKE '%${search}%' OR w.wallet_name LIKE '%${search}%')` : '';

    const userWallets = await this.callQuerySafe(`
      SELECT 
COALESCE(p.username, 'admin') AS username,
        w.wallet_id, 
        w.wallet_name,
        w.balance, 
        w.asset
      FROM user_wallets w
      LEFT JOIN users_profile p ON w.user_id = p.user_id  where w.asset= '${asset}' ${ext} ${ext2}
      ORDER BY w.created_on
      LIMIT ${limit} OFFSET ${offset}
    `);
    return userWallets;
  }



  async getWalletStats() {
    return await this.callQuerySafe(`
      SELECT 
COALESCE(p.username, 'admin') AS username,
        w.wallet_id, 
        w.wallet_name,
        w.balance, 
        w.asset
      FROM user_wallets w
      LEFT JOIN users_profile p ON w.user_id = p.user_id
        ORDER BY w.created_on
        LIMIT 3000
    `);
  }

  async getStats() {

    const totalUsers: any = await this.callQuerySafe(`SELECT COUNT(*) AS users FROM users WHERE user_type='influencer'`);
    const brandUsers: any = await this.callQuerySafe(`SELECT COUNT(*) AS users FROM users WHERE user_type='brand'`);
    const activeCampaigns: any = await this.callQuerySafe(`SELECT COUNT(*) AS users FROM act_campaigns WHERE status !='completed' and status !='draft'`);
    const totalTasks: any = await this.callQuerySafe(`SELECT COUNT(*) AS users FROM act_tasks`);
    const totalCampaigns: any = await this.callQuerySafe(`SELECT COUNT(*) AS users FROM act_campaigns where status !='draft'`);
    const completedCampaigns: any = await this.callQuerySafe(`SELECT COUNT(*) AS users FROM act_campaigns WHERE status='completed'`);

    // Onboarding: influencers with at least one social account connected
    const onboardedUsers: any = await this.callQuerySafe(`
      SELECT COUNT(DISTINCT u.user_id) AS onboarded
      FROM users u
      INNER JOIN sm_site_users s ON u.user_id = s.user_id
      WHERE u.user_type = 'influencer'
    `);

    const totalInfluencers = totalUsers[0].users;
    const onboarded = onboardedUsers[0].onboarded;
    const onboardingRate = totalInfluencers > 0
      ? Math.round((onboarded / totalInfluencers) * 100)
      : 0;

    return {
      totalInfluencers,
      brandUsers: brandUsers[0].users,
      activeCampaigns: activeCampaigns[0].users,
      totalTasks: totalTasks[0].users,
      totalCampaigns: totalCampaigns[0].users,
      closedCampaigns: completedCampaigns[0].users,
      completedCampaigns: completedCampaigns[0].users,
      onboardedInfluencers: onboarded,
      onboardingRate,
    };
  }

  async getApplicationsPerCampaign() {
    return await this.callQuerySafe(`
      SELECT
        c.campaign_id,
        c.title,
        c.status,
        c.created_on,
        p.name AS brand_name,
        COUNT(cpu.id) AS total_applications,
        SUM(CASE WHEN cpu.trans_status = 'SUCCESS' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN cpu.trans_status = 'PENDING' THEN 1 ELSE 0 END) AS pending
      FROM act_campaigns c
      LEFT JOIN business_profile p ON c.created_by = p.business_id
      LEFT JOIN campaign_payments_users cpu ON c.campaign_id = cpu.campaign_id
      WHERE c.status != 'draft'
      GROUP BY c.campaign_id, c.title, c.status, c.created_on, p.name
      ORDER BY total_applications DESC
      LIMIT 50
    `);
  }

  async adminWallets() {
    return await this.callQuerySafe(`SELECT * FROM user_wallets where user_id ='admin'`);
  }

  async getCampaignFees() {
    return await this.callQuerySafe(`SELECT * FROM act_campaign_fees ORDER BY id DESC`);
  }

  async editCampaignFees(data: any) {
    const { id, fee_currency, creation_fee, price_per_follower, daily_fee, commission_percentage } = data;
    try {
      const updatedData = {
        fee_currency,
        creation_fee,
        price_per_follower,
        daily_fee,
        commission_percentage,
      };
      await this.updateData("act_campaign_fees", `id='${id}'`, updatedData);
      return this.makeResponse(200, "Campaign fees updated successfully");
    } catch (error) {
      logger.error("Error in editCampaignFees:", error);
      return this.makeResponse(500, "Error updating campaign fees");
    }
  }


  async viewBrands(usertype: string, iso_code = 'all', level_id?: string, industry_ids?: string) {
    let ext = ''
    if (iso_code != 'all' && iso_code != undefined && iso_code.length > 1) {
      ext += ` AND p.iso_code='${iso_code}'`
    }

    if (industry_ids && industry_ids !== 'ALL') {
      const industryIdArray = industry_ids.split(',').map(id => id.trim());
      if (industryIdArray.length > 0) {
        ext += ` AND p.industry_id IN (${industryIdArray.join(',')})`
      }
    }

    const resp: any = await this.callQuerySafe(`select p.*,u.email,u.level_id from users u inner join business_profile p on u.user_id = p.business_id where user_type ='${usertype}' ${ext} order by u.id desc `)

    for (let i = 0; i < resp.length; i++) {
      const user = resp[i];
      const socialAccounts = await this.getSocialAccounts(user.user_id);
      resp[i].social_accounts = socialAccounts;
    }
    return resp;
  }
  async viewUsers(usertype: string, iso_code = 'all', level_id?: string, industry_ids?: string) {
    let ext = ''
    if (iso_code != 'all' && iso_code != undefined && iso_code.length > 1) {
      ext += ` AND p.iso_code='${iso_code}'`
    }
    if (level_id && level_id !== 'ALL') {
      ext += ` AND u.level_id=${level_id}`
    }
    if (industry_ids && industry_ids !== 'ALL') {
      const industryIdArray = industry_ids.split(',').map(id => id.trim());
      if (industryIdArray.length > 0) {
        ext += ` AND p.industry_id IN (${industryIdArray.join(',')})`
      }
    }

    const resp: any = await this.callQuerySafe(`select p.*,u.email,u.level_id, u.is_social_verified from users u inner join users_profile p on u.user_id = p.user_id where user_type ='${usertype}' ${ext} order by u.id desc `)

    for (let i = 0; i < resp.length; i++) {
      const user = resp[i];
      const socialAccounts = await this.getSocialAccounts(user.user_id);
      resp[i].social_accounts = socialAccounts;
    }
    return resp;
  }

  async deleteSocialSiteUser(data: any) {
    const { user_id, site_id } = data;
    return await makerCheckerHelper.createRequest(
      'DELETE',
      'sm_site_users',
      `${user_id} AND site_id='${site_id}'`,
      data.userId,
      data,
      1
    );
    // return await this.callQuerySafe(`DELETE FROM sm_site_users WHERE user_id='${user_id}' AND site_id='${site_id}'`);
  }

  async getSocialSiteById(socialId: string) {
    return await this.callQuerySafe(`SELECT 
      u.user_id,
      u.site_id,
      u.social_id,
      u.username AS linked_username,
      u.is_verified,
      s.sm_name,
      u.followers
    FROM sm_site_users u
    INNER JOIN sm_sites s ON u.site_id = s.site_id
    WHERE u.social_id = '${socialId}'`);
  }

  async getSocialAccounts(user_id: string) {
    return await this.callQuerySafe(`select * from sm_site_users where user_id='${user_id}' and is_verified='yes'   `)
  }

  async getIndustries() {
    try {
      const industries: any = await this.callQuerySafe(`
        SELECT id, name, description 
        FROM industries 
        WHERE is_active = TRUE 
        ORDER BY name ASC
      `);

      // If no industries table exists, return default industries
      if (industries.length === 0) {
        return [
          { id: 1, name: 'Technology', description: 'Technology and software industry' },
          { id: 2, name: 'Fashion & Beauty', description: 'Fashion, beauty, and lifestyle' },
          { id: 3, name: 'Food & Beverage', description: 'Food, drinks, and culinary' },
          { id: 4, name: 'Health & Fitness', description: 'Health, fitness, and wellness' },
          { id: 5, name: 'Travel & Tourism', description: 'Travel, tourism, and hospitality' },
          { id: 6, name: 'Education', description: 'Education and learning' },
          { id: 7, name: 'Entertainment', description: 'Entertainment and media' },
          { id: 8, name: 'Sports', description: 'Sports and athletics' },
          { id: 9, name: 'Business & Finance', description: 'Business, finance, and entrepreneurship' },
          { id: 10, name: 'Lifestyle', description: 'General lifestyle and personal development' }
        ];
      }

      return industries;
    } catch (error) {
      logger.error('Error fetching industries:', error);
      // Return default industries if table doesn't exist
      return [
        { id: 1, name: 'Technology', description: 'Technology and software industry' },
        { id: 2, name: 'Fashion & Beauty', description: 'Fashion, beauty, and lifestyle' },
        { id: 3, name: 'Food & Beverage', description: 'Food, drinks, and culinary' },
        { id: 4, name: 'Health & Fitness', description: 'Health, fitness, and wellness' },
        { id: 5, name: 'Travel & Tourism', description: 'Travel, tourism, and hospitality' },
        { id: 6, name: 'Education', description: 'Education and learning' },
        { id: 7, name: 'Entertainment', description: 'Entertainment and media' },
        { id: 8, name: 'Sports', description: 'Sports and athletics' },
        { id: 9, name: 'Business & Finance', description: 'Business, finance, and entrepreneurship' },
        { id: 10, name: 'Lifestyle', description: 'General lifestyle and personal development' }
      ];
    }
  }

  async viewAdminUsers() {
    return await this.callQuerySafe(`select * from admin_users `)
  }
  async deleteTask(pdata: any) {

    const { task_id } = pdata
    const taskInfo: any = await this.callQuerySafe(`SELECT * FROM act_tasks WHERE task_id='${task_id}'`);
    if (taskInfo.length === 0) {
      return this.makeResponse(404, "Task not found");
    }

    const operation = taskInfo[0].operation;
    if (operation.includes('CONNECT_')) {
      return this.makeResponse(400, "You don't have permission to update verification tasks");
    }

    const data = {
      status: 'inactive'
    }
    await this.updateData('act_tasks', `task_id='${task_id}'`, data);
    return this.makeResponse(200, "success");
  }
  async updateTask(data: any, task_id: string) {
    const { title, description, end_date, image_url, reward, userId } = data;
    const today = new Date();
    const endDate = new Date(end_date);
    const taskInfo: any = await this.callQuerySafe(`SELECT * FROM act_tasks WHERE task_id='${task_id}'`);
    if (taskInfo.length === 0) {
      return this.makeResponse(404, "Task not found");
    }

    const operation = taskInfo[0].operation;
    if (operation.includes('CONNECT_')) {
      return this.makeResponse(400, "You don't have permission to update verification tasks");
    }


    if (endDate <= today) {
      return this.makeResponse(400, "End date must be today or later");
    }

    const task = {
      title,
      description,
      end_date,
      image_url,
      reward,
      created_by: userId
    };


    await this.updateData('act_tasks', `task_id='${task_id}'`, task);
    return this.makeResponse(200, "success");
  }



  async userByCountry() {
    try {
      const result = await this.callQuerySafe(`SELECT iso_code,c.name, COUNT(*) AS user_count FROM users_profile p inner join countries c on p.iso_code=c.iso2 GROUP BY p.iso_code`);
      return this.makeResponse(200, "Users by country retrieved successfully", result);
    } catch (error) {
      logger.error("Error in userByCountry:", error);
      return this.makeResponse(500, "Error retrieving users by country");
    }
  }


  async verifyEmail(data: any) {
    try {
      console.log("verifyEmail", data)
      const { email, otp } = data;


      if (otp.length < 3) {
        return this.makeResponse(400, "Invalid OTP");
      }
      const users = await this.selectDataQuery("user_otp", `account_no='${email}' and otp='${otp}'`);
      if (users.length === 0) {
        return this.makeResponse(400, "Invalid OTP");
      }

      await this.updateData("users", `email='${email}'`, { email_verified: 'yes' });
      this.rewardGems(data.userId, 30, 'SIGN_UP_POINTS');

      let resp = {};

      let token1 = '';

      const token = await getItem(`admin_${email}`)
      if (token) {
        token1 = token
      }
      resp = {
        token: token1,
        type: 'admin'
      }


      return this.makeResponse(200, "Email verified successfully", resp);

    } catch (error) {
      logger.error("Error in verifyEmail:", error);
      return this.makeResponse(500, "Error verifying email");
    }
  }

  async login(data: any) {
    logger.info("loginInformation", { email: data.email });
    const { email, password } = data;

    try {
      const users: any = await this.callQuerySafe(`select email,user_id,email as username, first_name, last_name,status,email_verified, role, has_temporary_password, password from admin_users where email = ? and status='active' `, [email]);
      const user = users.length > 0 ? users[0] : null;
      console.log("loginInformation", users)

      if (users.length === 0) {
        // return this.makeResponse(404, "User not found");
      }

      // Verify password using the new method
      const isPasswordValid = this.verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return this.makeResponse(404, "Invalid credentials");
      }

      // If password was verified but it's SHA-256, upgrade to bcrypt
      if (this.isSha256Hash(user.password)) {
        await this.upgradePasswordHash(user.user_id, password);
      }
      const email_verified = user.email_verified
      if (email_verified == 'no') {
        return this.makeResponse(203, "Email not verified");
      }

      // Check if user has temporary password
      const has_temporary_password = user.has_temporary_password
      if (has_temporary_password == true) {
        // Issue a temporary token for password change flow
        let user_id = user.user_id;
        let role = user.role;
        const accessTokenTime = 3600; // 1 hour for temporary token
        const jwts: any = process.env.JWT_SECRET;
        const temporaryToken = jwt.sign({ role, user_id, username: email, type: 'temporary' }, jwts, {
          expiresIn: accessTokenTime,
        });

        return this.makeResponse(202, "Temporary password - change required", {
          user_id: user.user_id,
          has_temporary_password: true,
          temporary_token: temporaryToken
        });
      }

      try {
        logger.info(`userOj`, user)
        let user_id = user.user_id;
        let role = user.role;
        const accessTokenTime = 43200; // 2 hours in seconds
        //  const accessTokenTime = 86400
        const refreshTokenTime = 86400
        const jwts: any = process.env.JWT_SECRET;
        const token1 = jwt.sign({ role, user_id, username: email, type: 'access' }, jwts, {
          expiresIn: accessTokenTime,
        });

        setItem(`admin_${email}`, token1)
        logger.info(`userProfileLogin`, user)

        const response = { ...user, jwt: token1 };
        return this.makeResponse(200, "Login successful", response);
      } catch (error) {
        logger.error("login", error);
        return this.makeResponse(500, "Error logging in");
      }
    } catch (error) {
      logger.error("login", error);
      return this.makeResponse(500, "Error logging in");
    }
  }



  async addProperty(data: any) {
    try {
      // Validate required fields
      if (!data.propertyName || !data.propertyAssetCode || !data.totalPrice || !data.numberOfShares) {
        return this.makeResponse(400, "Missing required property information");
      }

      /*
      // If you're uploading images to S3, uncomment this section
      const imageUploadPromises = files.map(file => uploadToS3(file, 'properties'));
      const imageUploadResults = await Promise.all(imageUploadPromises);
      const imageUrls = imageUploadResults.map(upload => upload.url);
      */
      const imageUrls = ""; // Placeholder if images are not uploaded

      // Construct the new property object
      const newProperty = {
        name: data.propertyName,
        asset_code: data.propertyAssetCode,
        type: data.type,
        description: data.description,
        address: data.address,
        images: JSON.stringify(imageUrls), // Store as JSON string if multiple images
        size: data.size,
        currency: data.priceCurrency,
        total_price: data.totalPrice,
        number_of_shares: data.numberOfShares,
        minimum_investment: data.minimumInvestment,
        expected_return: data.expectedReturn,
        distribution_cycle: data.distributionCycle,
        created_at: new Date(),
      };

      // Insert the property into the database
      const insertedPropertyId = await this.insertData("properties", newProperty);

      // Response with the inserted property ID
      return this.makeResponse(201, "Property added successfully", { propertyId: insertedPropertyId });
    } catch (error) {
      logger.error("Error in addProperty:", error);
      return this.makeResponse(500, "Error adding property");
    }
  }



  // CRUD Operations for Adverts
  async addAdvert(data: any) {
    try {
      if (!data.title || !data.content || !data.start_date || !data.end_date) {
        return this.makeResponse(400, "Missing required advert information");
      }
      const newAdvert = {
        title: data.title,
        content: data.content,
        image_url: data.image_url || null,
        target_audience: data.target_audience || 'all',
        start_date: data.start_date,
        end_date: data.end_date,
        is_active: true,
        created_at: new Date()
      };
      const insertedAdvertId = await this.insertData("adverts", newAdvert);
      return this.makeResponse(201, "Advert added successfully", { advertId: insertedAdvertId });
    } catch (error) {
      logger.error("Error in addAdvert:", error);
      return this.makeResponse(500, "Error adding advert");
    }
  }

  async getAdverts() {
    return await this.callQuerySafe("SELECT * FROM adverts ORDER BY created_at DESC");
  }

  async getAdvertById(advert_id: any) {
    const advert: any = await this.callQuerySafe(`SELECT * FROM adverts WHERE advert_id = ${advert_id}`);
    return advert.length ? this.makeResponse(200, "Advert found", advert[0]) : this.makeResponse(404, "Advert not found");
  }

  async updateAdvert(advert_id: number, data: any) {
    try {
      const updatedData = {
        title: data.title,
        content: data.content,
        image_url: data.image_url,
        target_audience: data.target_audience,
        start_date: data.start_date,
        end_date: data.end_date,
        is_active: data.is_active
      };
      await this.updateData("adverts", `advert_id='${advert_id}'`, updatedData);
      return this.makeResponse(200, "Advert updated successfully");
    } catch (error) {
      logger.error("Error in updateAdvert:", error);
      return this.makeResponse(500, "Error updating advert");
    }
  }

  async deleteAdvert(advert_id: number) {
    try {
      await this.updateData("adverts", `advert_id='${advert_id}'`, { is_active: false });
      return this.makeResponse(200, "Advert deleted successfully");
    } catch (error) {
      logger.error("Error in deleteAdvert:", error);
      return this.makeResponse(500, "Error deleting advert");
    }
  }

  async userSocialSites(userId: string) {
    return await this.callQuerySafe(`select * from sm_site_users u INNER JOIN sm_sites s on u.site_id = s.site_id where user_id='${userId}' `)
  }

  async viewUserDetails(userId: string) {
    const profile = await this.getUsersProfile(userId)
    const acceptedUsersCount: any = await this.callQuerySafe(`select * from act_campaign_invites i inner join act_campaigns c on i.campaign_id=c.campaign_id where i.user_id = '${userId}' `)
    // const transactions = await this.getUserWalletTransactions(userId)
    const sites: any = await this.userSocialSites(userId)
    const userWallets = await this.getUserWallets(userId)
    const response = {
      profile,
      campaigns: acceptedUsersCount,
      sites,
      wallet: userWallets

    }

    return response;

  }

  async viewBrandDetails(userId: string) {
    const profile = await this.getBusinessProfile(userId)
    const transactions = await this.getUserWalletTransactions(userId)
    const acceptedUsersCount: any = await this.callQuerySafe(`select * from act_campaigns where created_by = '${userId}' `)
    const userWallets = await this.getUserWallets(userId)
    const response = {
      profile,
      campaigns: acceptedUsersCount,
      transactions: transactions,
      wallet: userWallets
    }
    return response
  }

  async getAllPosts(params: any) {
    try {
      const { page = 1, limit = 50, platform, status, search } = params;
      const posts: any = await getItemByFields<Post>("posts", {
        status: status || "active"
      });

      if (!posts || posts.length === 0) {
        return this.makeResponse(200, "No posts found", {
          posts: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0
          }
        });
      }

      // Filter posts based on criteria
      let filteredPosts = posts.filter((post: any) => {
        if (platform && post.platform !== platform) return false;
        if (search) {
          const searchLower = search.toLowerCase();
          const contentMatch = post.content?.toLowerCase().includes(searchLower);
          const usernameMatch = post.username?.toLowerCase().includes(searchLower);
          if (!contentMatch && !usernameMatch) return false;
        }
        return true;
      });

      // Sort by created_at descending
      filteredPosts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Apply pagination
      const totalCount = filteredPosts.length;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedPosts = filteredPosts.slice(startIndex, endIndex);

      // Enrich posts with user profile data
      const enrichedPosts = await Promise.all(
        paginatedPosts.map(async (post: any) => {
          try {
            const ownerProfile: any = await this.callQuerySafe(
              `SELECT profile_pic, username FROM users_profile WHERE user_id = '${post.user_id}'`
            );
            return {
              ...post,
              profile_pic: ownerProfile[0]?.profile_pic || '',
              username: ownerProfile[0]?.username || post.username || 'Unknown'
            };
          } catch (error) {
            logger.error(`Error fetching profile for user ${post.user_id}:`, error);
            return {
              ...post,
              profile_pic: '',
              username: post.username || 'Unknown'
            };
          }
        })
      );

      return this.makeResponse(200, "Posts retrieved successfully", {
        posts: enrichedPosts,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    } catch (error) {
      logger.error("Error in getAllPosts:", error);
      return this.makeResponse(500, "Error retrieving posts");
    }
  }

  async getReportedPosts(params: any) {
    try {
      const { page = 1, limit = 50, status } = params;
      const offset = (page - 1) * limit;

      let query = `
        SELECT rp.*, p.*, u.username, u.first_name, u.last_name 
        FROM reported_posts rp 
        LEFT JOIN posts p ON rp.post_id = p.post_id 
        LEFT JOIN users u ON p.user_id = u.user_id 
        WHERE 1=1
      `;
      const queryParams: any[] = [];

      if (status) {
        query += " AND rp.status = ?";
        queryParams.push(status);
      }

      query += " ORDER BY rp.created_at DESC LIMIT ? OFFSET ?";
      queryParams.push(limit, offset);

      const reportedPosts = await this.callQuerySafe(query, queryParams);
      const totalCount: any = await this.callQuerySafe("SELECT COUNT(*) as total FROM reported_posts");

      return this.makeResponse(200, "Reported posts retrieved successfully", {
        reportedPosts,
        pagination: {
          page,
          limit,
          total: totalCount[0]?.total || 0,
          totalPages: Math.ceil((totalCount[0]?.total || 0) / limit)
        }
      });
    } catch (error) {
      logger.error("Error in getReportedPosts:", error);
      return this.makeResponse(500, "Error retrieving reported posts");
    }
  }

  async deletePost(postId: string) {
    try {
      // First check if post exists
      const post: any = await this.callQuerySafe("SELECT * FROM posts WHERE post_id = ?", [postId]);
      if (!post || post.length === 0) {
        return this.makeResponse(404, "Post not found");
      }

      // Soft  by updating status
      await this.updateData("posts", `post_id='${postId}'`, {
        status: 'deleted',
        deleted_at: new Date()
      });

      // Also  any reported posts for this post
      await this.deleteData("reported_posts", `post_id='${postId}'`);

      return this.makeResponse(200, "Post deleted successfully");
    } catch (error) {
      logger.error("Error in deletePost:", error);
      return this.makeResponse(500, "Error deleting post");
    }
  }

  async getPostsAnalytics(params: any) {
    try {
      const { period = '30d', platform } = params;

      // Calculate date range based on period
      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }

      let query = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as total_posts,
          SUM(likes) as total_likes,
          SUM(comments) as total_comments,
          SUM(views) as total_views,
          AVG(likes) as avg_likes,
          AVG(comments) as avg_comments,
          AVG(views) as avg_views
        FROM posts 
        WHERE created_at >= ? AND status != 'deleted'
      `;
      const queryParams: any[] = [startDate.toISOString()];

      if (platform) {
        query += " AND platform = ?";
        queryParams.push(platform);
      }

      query += " GROUP BY DATE(created_at) ORDER BY date DESC";

      const analytics = await this.callQuerySafe(query, queryParams);

      // Get summary stats
      let summaryQuery = `
        SELECT 
          COUNT(*) as total_posts,
          SUM(likes) as total_likes,
          SUM(comments) as total_comments,
          SUM(views) as total_views,
          COUNT(DISTINCT user_id) as unique_users
        FROM posts 
        WHERE created_at >= ? AND status != 'deleted'
      `;
      const summaryParams: any = [startDate.toISOString()];

      if (platform) {
        summaryQuery += " AND platform = ?";
        summaryParams.push(platform);
      }

      const summary = await this.callQuerySafe(summaryQuery, summaryParams);

      return this.makeResponse(200, "Posts analytics retrieved successfully", {
        period,
        platform,
        summary: (summary as any[])[0] || {},
        dailyData: analytics
      });
    } catch (error) {
      logger.error("Error in getPostsAnalytics:", error);
      return this.makeResponse(500, "Error retrieving posts analytics");
    }
  }

  async getPostsFilters() {
    try {
      // Get available platforms
      const platforms: any = await this.callQuerySafe("SELECT DISTINCT platform FROM posts WHERE platform IS NOT NULL");

      // Get available statuses
      const statuses: any = await this.callQuerySafe("SELECT DISTINCT status FROM posts WHERE status IS NOT NULL");

      // Get date ranges for filtering
      const dateRanges = [
        { label: 'Last 7 days', value: '7d' },
        { label: 'Last 30 days', value: '30d' },
        { label: 'Last 90 days', value: '90d' },
        { label: 'Last 6 months', value: '6m' },
        { label: 'Last year', value: '1y' }
      ];

      return this.makeResponse(200, "Posts filters retrieved successfully", {
        platforms: platforms.map((p: any) => p.platform),
        statuses: statuses.map((s: any) => s.status),
        dateRanges
      });
    } catch (error) {
      logger.error("Error in getPostsFilters:", error);
      return this.makeResponse(500, "Error retrieving posts filters");
    }
  }

  // Agent Management Methods
  async getAgents(iso_code?: string) {
    try {
      const whereClause = iso_code && iso_code !== 'all' ? `WHERE a.iso_code = '${iso_code}'` : '';
      
      const agents = await this.callQuerySafe(`
        SELECT 
          a.agent_id,
          a.first_name,
          a.last_name,
          a.email,
          a.phone,
          a.country,
          a.iso_code,
          a.status,
          a.type,
          a.created_by,
          a.created_on,
          COUNT(DISTINCT aca.business_id) as company_count
        FROM agents a
        LEFT JOIN agent_company_assignments aca ON aca.agent_id = a.agent_id AND aca.status = 'active'
        ${whereClause}
        GROUP BY a.agent_id, a.first_name, a.last_name, a.email, a.phone, a.country, a.iso_code, a.status, a.type, a.created_by, a.created_on
        ORDER BY a.created_on DESC
      `);
      return this.makeResponse(200, "Agents retrieved successfully", agents);
    } catch (error) {
      logger.error("Error in getAgents:", error);
      return this.makeResponse(500, "Error retrieving agents");
    }
  }

  async getAgentCompanies(agentId: string) {
    try {
      const companies = await this.callQuerySafe(
        `
        SELECT 
          aca.business_id,
          b.name as business_name,
          b.verification_status,
          b.created_on,
          aca.status as agent_status,
          aca.created_on as assigned_on
        FROM agent_company_assignments aca
        JOIN business_profile b ON aca.business_id = b.business_id
        WHERE aca.agent_id = ?
        ORDER BY aca.created_on DESC
      `,
        [agentId]
      );
      return this.makeResponse(200, "Agent companies retrieved successfully", companies);
    } catch (error) {
      logger.error("Error in getAgentCompanies:", error);
      return this.makeResponse(500, "Error retrieving agent companies");
    }
  }

  async addAgentToCompany(data: any) {
    const { agent_id, business_id, business_ids, userId } = data;
    try {
      // Check if agent exists
      const agent = await this.callQuerySafe("SELECT * FROM agents WHERE agent_id = ?", [agent_id]);
      if ((agent as any[]).length === 0) {
        return this.makeResponse(400, "Agent not found");
      }

      // Support both single businessId and multiple businessIds
      let companyIds: string[] = [];
      if (business_ids && Array.isArray(business_ids)) {
        companyIds = business_ids;
      } else if (business_id) {
        companyIds = [business_id];
      } else {
        return this.makeResponse(400, "business_id or business_ids is required");
      }

      if (companyIds.length === 0) {
        return this.makeResponse(400, "At least one business ID is required");
      }

      const assignedCompanies: any[] = [];
      const skippedCompanies: any[] = [];
      const failedCompanies: any[] = [];

      for (const businessId of companyIds) {
        try {
          // Check if business exists and is approved
          const business = await this.callQuerySafe("SELECT * FROM business_profile WHERE business_id = ?", [businessId]);
          if ((business as any[]).length === 0) {
            failedCompanies.push({ business_id: businessId, reason: "Business not found" });
            continue;
          }
          if ((business as any[])[0].verification_status !== 'approved') {
            failedCompanies.push({ business_id: businessId, reason: "Business is not approved" });
            continue;
          }

          // Check if agent is already assigned to this company
          const existingAssignment = await this.callQuerySafe(
            "SELECT * FROM agent_company_assignments WHERE agent_id = ? AND business_id = ?",
            [agent_id, businessId]
          );
          if ((existingAssignment as any[]).length > 0) {
            skippedCompanies.push({
              business_id: businessId,
              business_name: (business as any[])[0].name,
              reason: "Already assigned"
            });
            continue;
          }

          // Add agent to company
          const newAssignment = {
            agent_id: agent_id,
            business_id: businessId,
            status: 'active',
            created_on: this.getMySQLDateTime()
          };

          await this.insertData("agent_company_assignments", newAssignment);

          assignedCompanies.push({
            business_id: businessId,
            business_name: (business as any[])[0].name
          });

        
        } catch (error) {
          logger.error(`Error assigning agent to company ${businessId}:`, error);
          failedCompanies.push({
            business_id: businessId,
            reason: "Error during assignment"
          });
        }
      }

      // Prepare response
      const responseData = {
        agent_id: agent_id,
        agent_name: `${(agent as any[])[0].first_name} ${(agent as any[])[0].last_name}`,
        assigned: assignedCompanies,
        skipped: skippedCompanies,
        failed: failedCompanies,
        summary: {
          total: companyIds.length,
          assigned: assignedCompanies.length,
          skipped: skippedCompanies.length,
          failed: failedCompanies.length
        }
      };

      if (assignedCompanies.length === 0 && failedCompanies.length > 0) {
        return this.makeResponse(400, "Failed to assign agent to any companies", responseData);
      }

      if (assignedCompanies.length > 0) {
        const message = assignedCompanies.length === companyIds.length
          ? "Agent assigned to all companies successfully"
          : `Agent assigned to ${assignedCompanies.length} of ${companyIds.length} companies`;
        return this.makeResponse(200, message, responseData);
      }

      return this.makeResponse(200, "No new assignments made", responseData);
    } catch (error) {
      logger.error("Error in addAgentToCompany:", error);
      return this.makeResponse(500, "Error assigning agent to company");
    }
  }

  async removeAgentFromCompany(data: any) {
    try {
      const { agent_id, business_id } = data;
      const userId = data.userId;
      // Check if assignment exists
      const assignment = await this.callQuerySafe(
        "SELECT aca.*, a.first_name, a.last_name, b.name as business_name FROM agent_company_assignments aca JOIN agents a ON aca.agent_id = a.agent_id JOIN business_profile b ON aca.business_id = b.business_id WHERE aca.agent_id = ? AND aca.business_id = ?",
        [agent_id, business_id]
      );
      if ((assignment as any[]).length === 0) {
        return this.makeResponse(400, "Agent assignment not found");
      }

      // Remove agent from company
      await this.callQuerySafe(
        "DELETE FROM agent_company_assignments WHERE agent_id = ? AND business_id = ?",
        [agent_id, business_id]
      );



      return this.makeResponse(200, "Agent removed from company successfully");
    } catch (error) {
      logger.error("Error in removeAgentFromCompany:", error);
      return this.makeResponse(500, "Error removing agent from company");
    }
  }

  async createAgent(data: any) {
    try {
      const {
        userId: userId,
        first_name: first_name,
        last_name: last_name,
        email: email,
        phone: phone,
        country: country,
        iso_code: iso_code,
      } = data;

      // Validate required fields
      if (!first_name || !last_name || !email || !country || !iso_code) {
        return this.makeResponse(400, "Missing required agent information (first_name, last_name, email, country, iso_code)");
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return this.makeResponse(400, "Invalid email format");
      }

      // Validate phone format if provided
      if (phone) {
        const phoneRegex = /^\+?[\d\s-]{10,}$/;
        if (!phoneRegex.test(phone)) {
          return this.makeResponse(400, "Invalid phone number format");
        }
      }

      // Check if agent already exists
      const existingAgent = await this.callQuerySafe("SELECT * FROM agents WHERE email = ?", [email]);
      if ((existingAgent as any[]).length > 0) {
        return this.makeResponse(400, "Agent with this email already exists");
      }

      // Check if phone already exists (if provided)
      if (phone) {
        const existingPhone = await this.callQuerySafe("SELECT * FROM agents WHERE phone = ?", [phone]);
        if ((existingPhone as any[]).length > 0) {
          return this.makeResponse(400, "Agent with this phone number already exists");
        }
      }

      const password = this.getTrimedString(10);
      const agent_id = "ag" + this.getRandomString();
      const newAgent: any = {
        agent_id: agent_id,
        first_name: first_name,
        last_name: last_name,
        email: email,
        country: country,
        iso_code: iso_code,
        type: 'agent',
        created_by: userId,
        password: this.hashPassword(password),
        status: 'active'
      };

      // Add optional phone if provided
      if (phone) newAgent.phone = phone;

      await this.insertData("agents", newAgent);

      const newUser = { user_id: agent_id, user_type:"agent", email:email, password: "", status: "active", source: "admin" };
      await this.insertData("users", newUser);
      
      this.sendEmail("ADD_AGENT", data.email, data.first_name, password);

      return this.makeResponse(200, "Agent created successfully", { agent_id, password });
    } catch (error) {
      console.log("error", error);
      logger.error("Error in createAgent:", error);
      return this.makeResponse(500, "Error creating agent");
    }
  }

  async updateAgent(agentId: string, data: any) {
    try {
      const { first_name, last_name, email, phone, country, iso_code, status } = data;

      const existing = await this.callQuerySafe("SELECT * FROM agents WHERE agent_id = ?", [agentId]);
      if ((existing as any[]).length === 0) {
        return this.makeResponse(404, "Agent not found");
      }

      // Prevent email collisions
      if (email) {
        const emailOwner = await this.callQuerySafe(
          "SELECT agent_id FROM agents WHERE email = ? AND agent_id <> ?",
          [email, agentId]
        );
        if ((emailOwner as any[]).length > 0) {
          return this.makeResponse(400, "Another agent already uses this email");
        }
      }

      // Prevent phone collisions
      if (phone) {
        const phoneOwner = await this.callQuerySafe(
          "SELECT agent_id FROM agents WHERE phone = ? AND agent_id <> ?",
          [phone, agentId]
        );
        if ((phoneOwner as any[]).length > 0) {
          return this.makeResponse(400, "Another agent already uses this phone number");
        }
      }

      // Validate phone format if provided
      if (phone) {
        const phoneRegex = /^\+?[\d\s-]{10,}$/;
        if (!phoneRegex.test(phone)) {
          return this.makeResponse(400, "Invalid phone number format");
        }
      }

      const updateData: any = {};
      if (first_name !== undefined) updateData.first_name = first_name;
      if (last_name !== undefined) updateData.last_name = last_name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (country !== undefined) updateData.country = country;
      if (iso_code !== undefined) updateData.iso_code = iso_code;
      if (status !== undefined) updateData.status = status;

      await this.updateData("agents", `agent_id='${agentId}'`, updateData);

      return this.makeResponse(200, "Agent updated successfully");
    } catch (error) {
      logger.error("Error in updateAgent:", error);
      return this.makeResponse(500, "Error updating agent");
    }
  }

  async deleteAgent(agentId: string, userId?: string) {
    try {
      const existing = await this.callQuerySafe("SELECT * FROM agents WHERE agent_id = ?", [agentId]);
      if ((existing as any[]).length === 0) {
        return this.makeResponse(404, "Agent not found");
      }

      // Soft delete: set inactive and remove all assignments
      await this.updateData("agents", `agent_id='${agentId}'`, { status: 'inactive' });
      await this.callQuerySafe(
        "DELETE FROM agent_company_assignments WHERE agent_id = ?",
        [agentId]
      );

      if (userId) {
        this.logOperation('AGENT_DEACTIVATED', userId, 'AGENT_DEACTIVATED', { agent_id: agentId });
      }

      return this.makeResponse(200, "Agent deactivated and assignments cleared");
    } catch (error) {
      logger.error("Error in deleteAgent:", error);
      return this.makeResponse(500, "Error deleting agent");
    }
  }

  async resetAgentPassword(agentId: string, userId?: string) {
    try {
      const existing: any = await this.callQuerySafe("SELECT * FROM agents WHERE agent_id = ?", [agentId]);
      if ((existing as any[]).length === 0) {
        return this.makeResponse(404, "Agent not found");
      }

      const agent = existing[0];
      if (agent.status !== 'active') {
        return this.makeResponse(400, "Cannot reset password for inactive agent");
      }

      // Generate new password
      const newPassword = this.getTrimedString(10);
      const hashedPassword = this.hashPassword(newPassword);

      // Update agent password
      await this.updateData("agents", `agent_id='${agentId}'`, { password: hashedPassword });

      // Send email with new password
      await this.sendEmail("RESET_AGENT_PASSWORD", agent.email, agent.first_name, newPassword);

      if (userId) {
        this.logOperation('AGENT_PASSWORD_RESET', userId, 'AGENT_PASSWORD_RESET', { agent_id: agentId });
      }

      return this.makeResponse(200, "Agent password reset successfully. New password sent to agent's email.");
    } catch (error) {
      logger.error("Error in resetAgentPassword:", error);
      return this.makeResponse(500, "Error resetting agent password");
    }
  }

  async getAvailableCompanies() {
    try {
      const companies = await this.callQuerySafe(`
        SELECT 
          business_id,
          name as business_name,
          verification_status,
          created_on
        FROM business_profile 
        WHERE verification_status = 'approved'
        ORDER BY name ASC
      `);
      return this.makeResponse(200, "Available companies retrieved successfully", companies);
    } catch (error) {
      logger.error("Error in getAvailableCompanies:", error);
      return this.makeResponse(500, "Error retrieving available companies");
    }
  }

  async getReferrals(userId?: string) {
    try {
      let query = '';
      let params: any[] = [];

      if (userId) {
        // Get referrals for specific user
        query = `
          SELECT 
            r.referral_id,
            r.referred_user_id,
            r.referrer_user_id,
            r.status,
            r.created_on,
            u.first_name,
            u.last_name,
            u.email,
            u.phone_number
          FROM referrals r
          LEFT JOIN users u ON r.referred_user_id = u.user_id
          WHERE r.referrer_user_id = ?
          ORDER BY r.created_on DESC
        `;
        params = [userId];
      } else {
        // Get admin referral analytics - most used codes and top referrers
        query = `
          SELECT 
            r.referrer_user_id,
            u.first_name,
            u.last_name,
            u.email,
            COUNT(r.referral_id) as total_referrals,
            COUNT(CASE WHEN r.status = 'active' THEN 1 END) as active_referrals,
            COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_referrals,
            MAX(r.created_on) as last_referral_date,
            MIN(r.created_on) as first_referral_date
          FROM referrals r
          LEFT JOIN users u ON r.referrer_user_id = u.user_id
          GROUP BY r.referrer_user_id, u.first_name, u.last_name, u.email
          ORDER BY total_referrals DESC, active_referrals DESC
        `;
      }

      const referrals = await this.callQuerySafe(query, params);

      // If admin view, also get referral code usage stats
      if (!userId) {
        const codeStats = await this.callQuerySafe(`
          SELECT 
            referral_code,
            COUNT(*) as usage_count,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
          FROM referrals 
          WHERE referral_code IS NOT NULL
          GROUP BY referral_code
          ORDER BY usage_count DESC
        `);

        const totalStats = await this.callQuerySafe(`
          SELECT 
            COUNT(*) as total_referrals,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as total_active,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as total_completed,
            COUNT(DISTINCT referrer_user_id) as unique_referrers
          FROM referrals
        `);

        return this.makeResponse(200, "Admin referral analytics retrieved successfully", {
          topReferrers: referrals,
          codeUsage: codeStats,
          summary: (totalStats as any[])[0] || {}
        });
      }

      return this.makeResponse(200, "Referrals retrieved successfully", referrals);
    } catch (error) {
      logger.error("Error in getReferrals:", error);
      return this.makeResponse(500, "Error retrieving referrals");
    }
  }


  public isBcryptHash(hash: string): boolean {
    // Bcrypt hashes start with $2a$, $2b$, $2x$, or $2y$ and are 60 characters long
    return /^\$2[abxy]\$\d{2}\$/.test(hash) && hash.length === 60;
  }

  public isSha256Hash(hash: string): boolean {
    // SHA-256 hashes are 64 characters long and contain only hex characters
    return /^[a-f0-9]{64}$/i.test(hash);
  }

  public verifyPassword(password: string, hashedPassword: string) {

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

  public async upgradePasswordHash(userId: string, password: string) {
    const saltRounds = 12;
    const newHash = bcrypt.hashSync(password, saltRounds);

    // Update the user's password to bcrypt
    await this.callQuerySafe(
      'UPDATE admin_users SET password = ? WHERE user_id = ?',
      [newHash, userId]
    );
  }

}

export default Admin;
