import Model from "../helpers/model";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger";

class Agents extends Model {
  constructor() {
    super();
  }

  async login(data: any) {
    const { email, password } = data;
    console.log("email", email, "password", password);
    const hashedPassword = this.hashPassword(password);

    console.log("newPassword", hashedPassword);

    try {
      // Get agent with password for verification
      const agent: any = await this.callQuerySafe(
        "SELECT agent_id, first_name, last_name, email, status, type, password FROM agents WHERE email = ?",
        [email]
      );
      console.log("agent", agent);

      if (!agent || agent.length === 0) {
        return this.makeResponse(404, "Incorrect email or password");
      }

      const agentMember = agent[0];

      // Verify password using the new method
      const isPasswordValid = this.verifyPassword(password, agentMember.password);
      if (!isPasswordValid) {
        return this.makeResponse(404, "Incorrect email or password");
      }

      // If password was verified but it's SHA-256, upgrade to bcrypt
      if (this.isSha256Hash(agentMember.password)) {
        await this.upgradePasswordHash(agentMember.agent_id, password);
      }

      if (agentMember.status !== 'active') {
        return this.makeResponse(403, "Account is inactive");
      }

      // Collect all company assignments from agent_company_assignments
      const companies: any[] = [];

      // Get assignments from agent_company_assignments
      const additionalAssignments: any = await this.callQuerySafe(
        `SELECT 
           aca.business_id,
           b.name as business_name,
           b.verification_status,
           aca.status as assignment_status,
           aca.created_on as assigned_on
         FROM agent_company_assignments aca
         JOIN business_profile b ON b.business_id = aca.business_id
         WHERE aca.agent_id = ? AND aca.status = 'active'
         ORDER BY aca.created_on DESC`,
        [agentMember.agent_id]
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
        // return this.makeResponse(403, "No company assignments found");
      }

      const wallet = await this.GenerateCurrencyWallet(agentMember.agent_id, "USD")
      const wallet_pin = wallet.wallet_pin
      let has_pin = false
      if (wallet_pin) {
        has_pin = true
      }
      wallet.wallet_pin = "*****"
      const accessTokenTime = 43200;
      const refreshTokenTime = 17280000;
      const jwts: any = process.env.JWT_SECRET;

      const token1 = jwt.sign(
        {
          role: 'agent',
          agentId: agentMember.agent_id,
          user_id: agentMember.agent_id,
          business_id: null,
          email: agentMember.email,
          type: 'access'
        },
        jwts,
        { expiresIn: accessTokenTime }
      );
      const token2 = jwt.sign(
        {
          role: 'none',
          agentId: agentMember.agent_id,
          user_id: agentMember.agent_id,
          business_id: null,
          email: agentMember.email,
          type: 'refresh'
        },
        jwts,
        { expiresIn: refreshTokenTime }
      );

      const response = {
        agentId: agentMember.agent_id,
        first_name: agentMember.first_name,
        last_name: agentMember.last_name,
        email: agentMember.email,
        type: 'access',
        business_id: null,
        jwt: token1,
        refreshToken: token2,
        wallet
      };

      return this.makeResponse(200, "Login successful", response);
    } catch (error) {
      logger.error("Error in agent login:", error);
      return this.makeResponse(500, "Agent login failed");
    }
  }

  async createCampaign(data: any) {
    try {

      logger.info(`createCampaign`, data)
      console.log("createCampaignByUser", data)
      const { title, role, userId, agentId, staffId, campaign_image, number_of_influencers, description, objective, requestId, start_date, end_date, tasks } = data;
      const campaign_id = "cp" + this.getRandomString();

      if (!tasks || tasks.length === 0) {
        return this.makeResponse(400, "You need at least one task.");
      }

      if (!campaign_image || campaign_image.trim() === '') {
        return this.makeResponse(400, "Campaign image is required.");
      }

      // Determine business_id, creator_type, and created_by_user_id based on role
      let finalBusinessId: string;
      let creator_type: 'brand' | 'agent' | 'staff' = 'brand';
      let created_by_user_id: string;

      // CASE 1: Agent creating campaign
      if (role != 'agent') {
        return this.makeResponse(400, "Only agents can access this feature");
      }

      if (!agentId || !data.business_id) {
        return this.makeResponse(400, "agentId and business_id are required for agents");
      }

      // Verify agent has access to this business
      const hasAccess = await this.verifyAgentBusinessAccess(agentId, data.business_id);
      if (!hasAccess) {
        return this.makeResponse(403, "Agent is not assigned to this business");
      }

      finalBusinessId = data.business_id;
      creator_type = 'agent';
      created_by_user_id = agentId;


      console.log("Campaign creation:", { finalBusinessId, creator_type, created_by_user_id });

      const fees: any = await this.getCampaignFees();
      const daily_fee = fees[0].daily_fee;
      //  const creation_fee = fees[0].creation_fee;
      console.log("fees", fees)
      const creation_fee_type = fees[0].creation_fee_type;
      const min_amount = fees[0].min_amount;
      let creation_fee = fees[0].creation_fee;
      console.log("creation_fee", creation_fee)

     


      // Check if start date is in the future
      const today = new Date().toISOString().slice(0, 10);
      const min_end_date = new Date(start_date).setDate(new Date(start_date).getDate() + 1);

      const minStartDate = new Date();
      minStartDate.setDate(minStartDate.getDate() + 1);
      minStartDate.setHours(0, 0, 0, 0);

      const startDateObj = new Date(start_date);
      startDateObj.setHours(0, 0, 0, 0);
      console.log("startDateObj", startDateObj)
      console.log("minStartDate", minStartDate)
      console.log("startDateObj < minStartDate", startDateObj < minStartDate)

      if (startDateObj < minStartDate) {
       // return this.makeResponse(400, "Campaign start date should be at least 1 days from today " + minStartDate.toDateString());
      }



      if (new Date(end_date) <= new Date(min_end_date)) {
        return this.makeResponse(400, "Campaign end date must be at least 1 day after start date");
      }


    


      const wallet = await this.GenerateCurrencyWallet(userId, "USD")
      const wBalance = wallet.balance
      if (wBalance < min_amount) {
        //  return this.makeResponse(404, `You need atleast USD ${budg et} in your wallet to create a campaign`);
      }

      if (description.length < 200) {
        return this.makeResponse(400, "Campaign description is too short, make it atleast 200 characters");
      }

      const currentTime = new Date();
      const threeMinutesAgo = new Date(currentTime.getTime() - 3 * 60 * 1000);
      const formattedDate = threeMinutesAgo.toISOString().slice(0, 19).replace('T', ' ');

      const existingCampaigns: any = await this.callQuerySafe(`
        SELECT * FROM act_campaigns 
        WHERE title = '${title}' 
        AND business_id = '${finalBusinessId}' 
        AND created_on > '${formattedDate}'
      `);

      if (existingCampaigns.length > 0) {
        return this.makeResponse(400, "A campaign with the same title has already been posted within the last 3 minutes.");
      }

      const newCampaign = {
        campaign_id,
        request_id: requestId,
        title,
        description,
        start_date,
        objective,
        end_date,
        image_urls: campaign_image,
        budget:0,
        number_of_influencers,
        status: "draft",
        business_id: finalBusinessId,
        created_by_user_id: created_by_user_id,
        creator_type: creator_type,
        created_by: finalBusinessId
      };

      this.beginTransaction()
      await this.insertData("act_campaigns", newCampaign);

      try {
        //  const tasksObj = JSON.parse(tasks)
        for (const task of tasks) {
          const task_id = "t" + this.getRandomString();

          // Calculate period fields for repetitive tasks
          const currentPeriodId = this.defaultPeriod()
          let nextPeriodDate = null;
          if (task.is_repetitive == 'yes') {
            const startDate = new Date(start_date);
            if (task.repeats_after === 'daily') {
              startDate.setDate(startDate.getDate() + 1);
            } else if (task.repeats_after === 'weekly') {
              startDate.setDate(startDate.getDate() + 7);
            } else if (typeof task.repeats_after === 'number') {
              startDate.setDate(startDate.getDate() + Number(task.repeats_after));
            } else {
              // Default to daily
              startDate.setDate(startDate.getDate() + 1);
            }
            nextPeriodDate = startDate.toISOString().slice(0, 19).replace('T', ' ');
          }
          const allowedRequeiredTypes = ['yes', 'no'];
          if (!allowedRequeiredTypes.includes(task.requires_url)) {
            this.rollbackTransaction()
            return this.makeResponse(400, "Invalid requires_url type for one of the tasks, should be yes or no");
          }
          if (!allowedRequeiredTypes.includes(task.is_repetitive)) {
            this.rollbackTransaction()
            return this.makeResponse(400, "Invalid repetitive type for one of the tasks, should be yes or no");
          }

          const newTask = {
            task_id,
            campaign_id,
            title: task.task,
            task_type: "campaign",
            description: task.description,
            end_date: end_date,
            image_url: "",
            reward: 0,
            created_by: created_by_user_id,
            requires_url: task.requires_url,
            is_repetitive: task.is_repetitive,
            site_id: task.site_id,
            repeats_after: task.repeats_after,
            period_id: currentPeriodId,
            next_period_date: nextPeriodDate
          };
          await this.insertData("act_tasks", newTask);
        }
      } catch (error) {
        this.rollbackTransaction()
        return this.makeResponse(400, "Tasks object not properly formulated");
      }

      this.commitTransaction()


      if (requestId) {
        await this.updateData("elig_searches", `search_id = '${requestId}'`, { campaign_id: campaign_id });
      }

      return this.makeResponse(200, "Campaign added successfully", newCampaign);
    } catch (error) {
      this.rollbackTransaction()
      console.error("Error in createCampaign:", error);
      return this.makeResponse(500, "Error adding campaign");
    }
  }

  async changeBusiness(data: any) {
    const { agentId, businessId } = data;

    try {
      if (!agentId) {
        return this.makeResponse(401, "Unauthorized: agentId is required");
      }

      if (!businessId) {
        return this.makeResponse(400, "businessId is required");
      }

      // Get agent information
      const agent: any = await this.callQuerySafe(
        "SELECT agent_id, first_name, last_name, email, status, type FROM agents WHERE agent_id = ?",
        [agentId]
      );

      if (!agent || agent.length === 0) {
        return this.makeResponse(404, "Agent not found");
      }

      const agentMember = agent[0];

      if (agentMember.status !== 'active') {
        return this.makeResponse(403, "Account is inactive");
      }

      // Collect all company assignments to verify access
      const companies: any[] = [];

      // Get assignments from agent_company_assignments
      const additionalAssignments: any = await this.callQuerySafe(
        `SELECT 
           aca.business_id,
           b.name as business_name,
           b.verification_status,
           aca.status as assignment_status
         FROM agent_company_assignments aca
         JOIN business_profile b ON b.business_id = aca.business_id
         WHERE aca.agent_id = ? AND aca.status = 'active'`,
        [agentMember.agent_id]
      );

      // Merge assignments
      if (additionalAssignments && additionalAssignments.length > 0) {
        for (const assignment of additionalAssignments) {
          companies.push(assignment);
        }
      }

      // Verify the agent has access to the requested business
      const hasAccess = companies.some((c: any) => c.business_id === businessId);
      if (!hasAccess) {
        return this.makeResponse(403, "You do not have access to this business");
      }

      // Generate new JWTs for agent with new businessId
      const accessTokenTime = 7200;
      const refreshTokenTime = 17280000;
      const jwts: any = process.env.JWT_SECRET;

      const token1 = jwt.sign(
        {
          role: 'agent',
          agentId: agentMember.agent_id,
          user_id: agentMember.agent_id,
          business_id: businessId,
          email: agentMember.email,
          type: 'access'
        },
        jwts,
        { expiresIn: accessTokenTime }
      );

      const token2 = jwt.sign(
        {
          role: 'none',
          agentId: agentMember.agent_id,
          user_id: agentMember.agent_id,
          business_id: businessId,
          email: agentMember.email,
          type: 'refresh'
        },
        jwts,
        { expiresIn: refreshTokenTime }
      );

      const selectedBusiness = companies.find((c: any) => c.business_id === businessId);

      const response = {
        agentId: agentMember.agent_id,
        first_name: agentMember.first_name,
        last_name: agentMember.last_name,
        email: agentMember.email,
        type: 'access',
        user_id: agentMember.agent_id,
        business_id: businessId,
        business_name: selectedBusiness?.business_name || '',
        jwt: token1,
        refreshToken: token2,
      };

      return this.makeResponse(200, "Business changed successfully", response);
    } catch (error) {
      logger.error("Error in change business:", error);
      return this.makeResponse(500, "Failed to change business");
    }
  }

  async getAgentBusinesses(data: any) {
    const { agentId } = data;

    try {
      if (!agentId) {
        return this.makeResponse(401, "Unauthorized: agentId is required");
      }

      // Get agent information
      const agent: any = await this.callQuerySafe(
        "SELECT agent_id, first_name, last_name, email, status FROM agents WHERE agent_id = ?",
        [agentId]
      );

      if (!agent || agent.length === 0) {
        return this.makeResponse(404, "Agent not found");
      }

      const agentMember = agent[0];

      if (agentMember.status !== 'active') {
        return this.makeResponse(403, "Account is inactive");
      }

      // Get all businesses assigned to this agent
      const businesses: any = await this.callQuerySafe(
        `SELECT 
           aca.business_id,
           b.name as business_name,
           b.verification_status,
           aca.status as assignment_status,
           aca.created_on as assigned_on
         FROM agent_company_assignments aca
         JOIN business_profile b ON b.business_id = aca.business_id
         WHERE aca.agent_id = ? AND aca.status = 'active'
         ORDER BY aca.created_on DESC`,
        [agentId]
      );

      return this.makeResponse(200, "Businesses retrieved successfully", {
        agentId: agentMember.agent_id,
        agentName: `${agentMember.first_name} ${agentMember.last_name}`,
        businesses: businesses || []
      });
    } catch (error) {
      logger.error("Error in getAgentBusinesses:", error);
      return this.makeResponse(500, "Failed to retrieve businesses");
    }
  }

  async getAgentCampaigns(data: any) {
    const { agentId, business_id, status } = data;

    try {
      if (!agentId) {
        return this.makeResponse(401, "Unauthorized: agentId is required");
      }

      // Get agent information
      const agent: any = await this.callQuerySafe(
        "SELECT agent_id, first_name, last_name, email, status FROM agents WHERE agent_id = ?",
        [agentId]
      );

      if (!agent || agent.length === 0) {
        return this.makeResponse(404, "Agent not found");
      }

      const agentMember = agent[0];

      if (agentMember.status !== 'active') {
        return this.makeResponse(403, "Account is inactive");
      }

      // Build query with optional filters
      let query = `
        SELECT 
               b.name as business_name,
       c.*
        FROM act_campaigns c
        LEFT JOIN business_profile b ON b.business_id COLLATE utf8mb4_unicode_ci = c.business_id COLLATE utf8mb4_unicode_ci
        WHERE c.creator_type = 'agent' AND c.created_by_user_id = ?
      `;

      const params: any[] = [agentId];

      // Add optional filters
      if (business_id) {
        query += ' AND c.business_id = ?';
        params.push(business_id);
      }

      if (status) {
        query += ' AND c.status = ?';
        params.push(status);
      }

      query += ' ORDER BY c.created_on DESC';

      const campaigns: any = await this.callQuerySafe(query, params);

      return this.makeResponse(200, "Agent campaigns retrieved successfully", campaigns);
    } catch (error) {
      logger.error("Error in getAgentCampaigns:", error);
      return this.makeResponse(500, "Failed to retrieve agent campaigns");
    }
  }

  async getProfile(data: any) {
    const { agentId } = data;

    try {
      if (!agentId) {
        return this.makeResponse(401, "Unauthorized: agentId is required");
      }

      // Get agent full profile
      const agent: any = await this.callQuerySafe(
        `SELECT 
          agent_id, 
          first_name, 
          last_name, 
          email, 
          phone,
          country,
          iso_code,
          status, 
          type,
          verification_status,
          created_on,
          updated_on
        FROM agents 
        WHERE agent_id = ?`,
        [agentId]
      );

      if (!agent || agent.length === 0) {
        return this.makeResponse(404, "Agent not found");
      }

      const agentProfile = agent[0];

      // Get assigned businesses count
      const businessesCount: any = await this.callQuerySafe(
        `SELECT COUNT(*) as total 
         FROM agent_company_assignments 
         WHERE agent_id = ? AND status = 'active'`,
        [agentId]
      );

      // Get campaigns created count
      const campaignsCount: any = await this.callQuerySafe(
        `SELECT COUNT(*) as total 
         FROM act_campaigns 
         WHERE creator_type = 'agent' AND created_by_user_id = ?`,
        [agentId]
      );

      return this.makeResponse(200, "Agent profile retrieved successfully", {
        agent: agentProfile,
        statistics: {
          assignedBusinesses: businessesCount[0]?.total || 0,
          campaignsCreated: campaignsCount[0]?.total || 0
        }
      });
    } catch (error) {
      logger.error("Error in getProfile:", error);
      return this.makeResponse(500, "Failed to retrieve agent profile");
    }
  }

  async updateProfile(data: any) {
    const { agentId, first_name, last_name, phone, country, iso_code } = data;

    try {
      if (!agentId) {
        return this.makeResponse(401, "Unauthorized: agentId is required");
      }

      // Get current agent to verify exists
      const agent: any = await this.callQuerySafe(
        "SELECT agent_id, email, status FROM agents WHERE agent_id = ?",
        [agentId]
      );

      if (!agent || agent.length === 0) {
        return this.makeResponse(404, "Agent not found");
      }

      if (agent[0].status !== 'active') {
        return this.makeResponse(403, "Account is inactive");
      }

      // Build update object with only provided fields
      const updateData: any = {};

      if (first_name) updateData.first_name = first_name;
      if (last_name) updateData.last_name = last_name;
      if (phone !== undefined) updateData.phone = phone; // Allow null to clear
      if (country) updateData.country = country;
      if (iso_code) updateData.iso_code = iso_code;

      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        return this.makeResponse(400, "No fields to update");
      }

      // Update agent profile
      await this.updateData("agents", `agent_id = '${agentId}'`, updateData);

      // Get updated profile
      const updatedAgent: any = await this.callQuerySafe(
        `SELECT 
          agent_id, 
          first_name, 
          last_name, 
          email, 
          phone,
          country,
          iso_code,
          status, 
          type,
          verification_status,
          created_on,
          updated_on
        FROM agents 
        WHERE agent_id = ?`,
        [agentId]
      );

      return this.makeResponse(200, "Profile updated successfully", updatedAgent[0]);
    } catch (error) {
      logger.error("Error in updateProfile:", error);
      return this.makeResponse(500, "Failed to update agent profile");
    }
  }

  async resetPasswordRequest(data: any) {
    try {
      const { email } = data;

      if (!email) {
        return this.makeResponse(400, "Email is required");
      }

      const agent: any = await this.callQuerySafe(
        "SELECT agent_id, first_name, last_name, email, status FROM agents WHERE email = ?",
        [email]
      );

      if (!agent || agent.length === 0) {
        return this.makeResponse(404, "Email not found");
      }

      if (agent[0].status !== 'active') {
        return this.makeResponse(403, "Account is inactive");
      }

      const first_name = agent[0].first_name;
      const otp = await this.getOTP(email);

      await this.sendEmail("RESET_PASSWORD_REQUEST", email, first_name, otp);

      return this.makeResponse(200, "Reset password OTP sent to your email");
    } catch (error) {
      logger.error("Error in resetPasswordRequest:", error);
      return this.makeResponse(500, "Error processing reset password request");
    }
  }

  async resetPassword(data: any) {
    try {
      const { otp, email, newPassword } = data;

      if (!otp || !email || !newPassword) {
        return this.makeResponse(400, "OTP, email, and new password are required");
      }

      if (newPassword.length < 8) {
        return this.makeResponse(400, "Password must be at least 8 characters");
      }

      // Verify OTP
      const otpResult = await this.selectDataQuery(
        "user_otp",
        `account_no = '${email}' AND otp = '${otp}'`
      );

      if (otpResult.length === 0) {
        return this.makeResponse(400, "Invalid or expired OTP");
      }

      // Hash the new password
      const hashedNewPassword = this.hashPassword(newPassword);

      // Update agent password
      await this.updateData("agents", `email = '${email}'`, {
        password: hashedNewPassword
      });

      // Send confirmation email
      await this.sendEmail("RESET_PASSWORD_COMPLETE", email, "");

      return this.makeResponse(200, "Password reset successful");
    } catch (error) {
      logger.error("Error in resetPassword:", error);
      return this.makeResponse(500, "Error resetting password");
    }
  }

  async changePassword(data: any) {
    try {
      const { agentId, currentPassword, newPassword } = data;

      if (!agentId) {
        return this.makeResponse(401, "Unauthorized: agentId is required");
      }

      if (!currentPassword || !newPassword) {
        return this.makeResponse(400, "Current password and new password are required");
      }

      if (newPassword.length < 8) {
        return this.makeResponse(400, "New password must be at least 8 characters");
      }

      // Get agent with password
      const agent: any = await this.callQuerySafe(
        "SELECT agent_id, first_name, email, password, status FROM agents WHERE agent_id = ?",
        [agentId]
      );

      if (!agent || agent.length === 0) {
        return this.makeResponse(404, "Agent not found");
      }

      const agentData = agent[0];

      if (agentData.status !== 'active') {
        return this.makeResponse(403, "Account is inactive");
      }

      // Verify current password
      const isPasswordValid = this.verifyPassword(currentPassword, agentData.password);
      if (!isPasswordValid) {
        return this.makeResponse(400, "Current password is incorrect");
      }

      // Hash the new password
      const hashedNewPassword = this.hashPassword(newPassword);

      // Update password
      await this.updateData("agents", `agent_id = '${agentId}'`, {
        password: hashedNewPassword
      });

      // Send notification email
      await this.sendEmail("PASSWORD_CHANGE_NOTIFICATION", agentData.email, agentData.first_name);

      return this.makeResponse(200, "Password changed successfully");
    } catch (error) {
      logger.error("Error in changePassword:", error);
      return this.makeResponse(500, "Error changing password");
    }
  }

  async updateCampaign(data: any) {
    try {
      const { campaign_id, agentId, title, description, objective, start_date, end_date, campaign_image, number_of_influencers, tasks } = data;

      if (!campaign_id || !agentId) {
        return this.makeResponse(400, "campaign_id and agentId are required");
      }

      // Verify agent has access to this campaign
      const campaign: any = await this.callQuerySafe(
        "SELECT * FROM act_campaigns WHERE campaign_id = ? AND creator_type = 'agent' AND created_by_user_id = ?",
        [campaign_id, agentId]
      );

      if (!campaign || campaign.length === 0) {
        return this.makeResponse(404, "Campaign not found or you don't have permission to update it");
      }

      const existingCampaign = campaign[0];

      // Check if campaign is in a state that allows updates
      if (existingCampaign.status === 'active' || existingCampaign.status === 'completed') {
        return this.makeResponse(400, "Cannot update campaign that is active or completed");
      }

      // Validate campaign image if provided
      if (campaign_image && campaign_image.trim() === '') {
        return this.makeResponse(400, "Campaign image is required.");
      }

      // Validate description length if provided
      if (description && description.length < 200) {
        return this.makeResponse(400, "Campaign description is too short, make it at least 200 characters");
      }

      // Validate dates if provided
      if (start_date && end_date) {
        const min_end_date = new Date(start_date).setDate(new Date(start_date).getDate() + 1);
        if (new Date(end_date) <= new Date(min_end_date)) {
          return this.makeResponse(400, "Campaign end date must be at least 1 day after start date");
        }
      }

      // Build update object with only provided fields
      const updateData: any = {};
      if (title) updateData.title = title;
      if (description) updateData.description = description;
      if (objective) updateData.objective = objective;
      if (start_date) updateData.start_date = start_date;
      if (end_date) updateData.end_date = end_date;
      if (campaign_image) updateData.image_urls = campaign_image;
      if (number_of_influencers) updateData.number_of_influencers = number_of_influencers;

      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        return this.makeResponse(400, "No fields to update");
      }

      // Update campaign
      await this.updateData("act_campaigns", `campaign_id = '${campaign_id}'`, updateData);

      // Update tasks if provided
      if (tasks && tasks.length > 0) {
        // Delete existing tasks
        await this.callQuerySafe("DELETE FROM act_tasks WHERE campaign_id = ?", [campaign_id]);

        // Add new tasks
        for (const task of tasks) {
          const task_id = "t" + this.getRandomString();

          // Calculate period fields for repetitive tasks
          const currentPeriodId = this.defaultPeriod();
          let nextPeriodDate = null;
          if (task.is_repetitive == 'yes') {
            const startDate = new Date(start_date || existingCampaign.start_date);
            if (task.repeats_after === 'daily') {
              startDate.setDate(startDate.getDate() + 1);
            } else if (task.repeats_after === 'weekly') {
              startDate.setDate(startDate.getDate() + 7);
            } else if (typeof task.repeats_after === 'number') {
              startDate.setDate(startDate.getDate() + Number(task.repeats_after));
            } else {
              startDate.setDate(startDate.getDate() + 1);
            }
            nextPeriodDate = startDate.toISOString().slice(0, 19).replace('T', ' ');
          }

          const allowedRequiredTypes = ['yes', 'no'];
          if (!allowedRequiredTypes.includes(task.requires_url)) {
            return this.makeResponse(400, "Invalid requires_url type for one of the tasks, should be yes or no");
          }
          if (!allowedRequiredTypes.includes(task.is_repetitive)) {
            return this.makeResponse(400, "Invalid repetitive type for one of the tasks, should be yes or no");
          }

          const newTask = {
            task_id,
            campaign_id,
            title: task.task,
            task_type: "campaign",
            description: task.description,
            end_date: end_date || existingCampaign.end_date,
            image_url: "",
            reward: 0,
            created_by: agentId,
            requires_url: task.requires_url,
            is_repetitive: task.is_repetitive,
            site_id: task.site_id,
            repeats_after: task.repeats_after,
            period_id: currentPeriodId,
            next_period_date: nextPeriodDate
          };
          await this.insertData("act_tasks", newTask);
        }
      }

      // Get updated campaign
      const updatedCampaign: any = await this.callQuerySafe(
        "SELECT * FROM act_campaigns WHERE campaign_id = ?",
        [campaign_id]
      );

      return this.makeResponse(200, "Campaign updated successfully", updatedCampaign[0]);
    } catch (error) {
      logger.error("Error in updateCampaign:", error);
      return this.makeResponse(500, "Error updating campaign");
    }
  }

  async createBusiness(data: any) {
    try {
      const { agentId, business_name, business_email, business_phone, country, address, website, description, is_registered, registration_number } = data;

      if (!agentId) {
        return this.makeResponse(401, "Unauthorized: agentId is required");
      }

      if (!business_name || !business_email || !business_phone || !country || !address) {
        return this.makeResponse(400, "Business name, email, phone, country, and address are required");
      }
      // Check if the business email already exists
      const existingBusiness = await this.callQuerySafe(
        "SELECT business_id FROM business_profile WHERE email = ?",
        [business_email]
      );
      if (existingBusiness && existingBusiness.length > 0) {
        return this.makeResponse(400, "A business with this email already exists");
      }

      const businessId = "br" + this.getRandomString();
      const newBusiness = {
        business_id: businessId,
        name: business_name,
        email: business_email,
        phone: business_phone,
        country: country,
        address: address,
        created_by_user_id: agentId,
        created_by_type: 'agent',
        website: website || null,
        description: description || null,
        owner_id: agentId,
        is_registered: is_registered || 'no',
        registration_number: registration_number || null,
        verification_status: 'pending',
        phone_verified: 'no',
        rejection_reason: ''
      };

      const newUser = {
        user_id: businessId,
        user_type: 'brand',
        email: business_email,
        password: this.hashPassword(this.getRandomString()),
        status: 'draft'
      };

      //  await this.insertData("users", newUser);
      await this.insertData("business_profile", newBusiness);
      await this.insertData("agent_company_assignments", {
        agent_id: agentId,
        business_id: businessId,
        status: 'active'
      });

      return this.makeResponse(200, "Business created successfully", newBusiness);
    } catch (error) {
      logger.error("Error in createBusiness:", error);
      return this.makeResponse(500, "Error creating business");
    }
  }
}

export default Agents;

