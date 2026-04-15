import Model from "../helpers/model";
import { subscribeToTopic, unsubscribeFromTopic } from '../helpers/FCM';
import { getItem, setItem } from "../helpers/connectRedis";
import { calculateWeightedScore } from "../helpers/campaign.helper";
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import Groups from "./groups.model";
import Stellar from "../helpers/Stellar";
import * as StellarSdk from 'stellar-sdk';
import { UserStellarService } from '../helpers/UserStellarService';

const applicationStatus = ['pending', 'accepted', 'rejected'];

export default class Campaigns extends Model {
  private groupsModel: Groups;
  private userStellarService: UserStellarService;
  private stellar: Stellar;

  constructor() {
    super();
    this.groupsModel = new Groups();
    this.userStellarService = new UserStellarService();
    this.stellar = new Stellar();
  }


  async getStaffBusiness(staffId: string): Promise<any> {
    try {
      const staff: any = await this.callQuerySafe(
        `SELECT staff_id, business_id, status FROM business_staff WHERE staff_id = ?`,
        [staffId]
      );
      return staff.length > 0 ? staff[0] : null;
    } catch (error) {
      logger.error("Error getting staff business:", error);
      return null;
    }
  }

  async addReview(data: any) {
    const { campaign_id, user_id, rating, review, userId, liked_aspects, improvement_areas } = data;

    if (!campaign_id || !user_id || typeof rating === 'undefined' || typeof review === 'undefined') {
      return this.makeResponse(400, "Missing required fields");
    }

    // Check if the user participated in the campaign
    const participation: any = await this.callQuerySafe(`
      SELECT * FROM act_campaign_invites
      WHERE campaign_id = '${campaign_id}'
        AND user_id = '${user_id}'
        AND invite_status = 'accepted'
        AND (application_status = 'approved' OR application_status = 'completed')
      LIMIT 1
    `);

    if (!participation || participation.length === 0) {
      return this.makeResponse(403, "User did not participate in this campaign or is not eligible to review");
    }

    // Insert or update review
    const existingReview: any = await this.callQuerySafe(`
      SELECT * FROM act_campaign_reviews
      WHERE campaign_id = '${campaign_id}' AND user_id = '${user_id}'
      LIMIT 1
    `);

    let result;
    if (existingReview && existingReview.length > 0) {
      // Update existing review
      result = await this.updateData("act_campaign_reviews", `campaign_id = '${campaign_id}' AND user_id = '${user_id}'`, {
        rating: rating,
        review: review,
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      });
    } else {

      const reviewId = await this.insertData("act_campaign_reviews", {
        campaign_id: campaign_id,
        user_id: user_id,
        rating: rating,
        review: review,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        reviewed_by: userId,
        liked_aspects: liked_aspects,
        improvement_areas: improvement_areas
      })

    }

    return this.makeResponse(200, "Review submitted successfully", result);
  }


  async getInfluencerApplications(data: any) {
    const { userId } = data;
    const response = await this.callQuerySafe(`
      SELECT * FROM act_campaign_invites 
      WHERE user_id = '${userId}' 
        AND invite_status = 'accepted' 
        AND application_status = 'submitted'
    `);
    return this.makeResponse(200, "success", response);
  }



  async getApplicationsForCampaign(userId: any, campaign_id: any) {
    const campaignInfo = await this.getCampaignByIdAnyStatus(campaign_id);
    if (campaignInfo.length == 0) {
      return this.makeResponse(404, 'Campaign not found or already closed')
    }
    const { created_by } = campaignInfo[0];
    if (created_by !== userId) {
      return this.makeResponse(403, 'You are not authorized to view this campaign')
    }
    //  AND application_status = 'submitted'

    const response: any = await this.callQuerySafe(`
      SELECT campaign_id, i.user_id, influencer_rating, first_name, last_name, profile_pic,
             iso_code, payable_amount, invited_on, invite_status, application_status,
             i.action_status, i.delay_flagged, i.delay_flagged_at
      FROM act_campaign_invites i
      INNER JOIN users_profile up ON i.user_id = up.user_id
      WHERE campaign_id = '${campaign_id}'
        AND invite_status = 'accepted'
        AND application_status != 'pending'
    `);

    return this.makeResponse(200, "success", response);

  }


  async getApprovedInfluencers(campaign_id: any) {
    console.log("getApprovedInfluencers", campaign_id)
    const response: any = await this.callQuerySafe(`
      SELECT campaign_id, i.user_id, influencer_rating, first_name, last_name, profile_pic,
             iso_code, payable_amount, invited_on, invite_status, application_status,
             i.action_status, i.delay_flagged, i.delay_flagged_at
      FROM act_campaign_invites i
      INNER JOIN users_profile up ON i.user_id = up.user_id
      WHERE campaign_id = '${campaign_id}'
        AND invite_status = 'accepted'
        AND application_status = 'approved'
    `);

    return this.makeResponse(200, "success", response);
  }

  async actionApplications(data: any) {
    const { userId, campaign_id } = data;
    const response = await this.callQuerySafe(`
      SELECT * FROM act_campaign_invites 
      WHERE campaign_id = '${campaign_id}' 
        AND user_id = '${userId}'
    `);
    return this.makeResponse(200, "success", response);
  }

  async submitApplication(data: any) {
    const { userId, campaign_id } = data;
    const response = await this.callQuerySafe(`
      UPDATE act_campaign_invites
      SET invite_status = 'accepted',
          application_status = 'pending'
      WHERE campaign_id = '${campaign_id}'
        AND user_id = '${userId}'
    `);
    this.updateCampaignCounters(campaign_id);
    return this.makeResponse(200, "Application submitted", response);
  }


  async prefundCampaign(data: any) {
    const { campaign_id, userId } = data;
    try {
      const campaigns: any = await this.callQuerySafe(
        `SELECT * FROM act_campaigns WHERE campaign_id = '${campaign_id}'`
      );
      if (campaigns.length === 0) {
        return this.makeResponse(404, 'Campaign not found');
      }
      const campaign = campaigns[0];

      if (campaign.created_by_user_id !== userId) {
        return this.makeResponse(403, 'You do not own this campaign');
      }

      if (campaign.funding_status === 'funded') {
        return this.makeResponse(200, 'Campaign is already funded');
      }

      const budget = parseFloat(campaign.budget || '0');
      if (budget <= 0) {
        return this.makeResponse(400, 'Campaign budget must be set before funding. Please set a budget first.');
      }

      const wallet_id = await this.getWalletInfoByUserId(userId, 'USD');
      if (!wallet_id) {
        return this.makeResponse(404, 'USD wallet not found. Please set up your wallet first.');
      }

      const escrowWallet: string = (process.env.ESCROW_WALLET && process.env.ESCROW_WALLET !== 'undefined')
        ? process.env.ESCROW_WALLET
        : 'ESCROW000000';

      const trans_id = `pf${this.getRandomString()}`;
      const transferResult = await this.walletTransfer(
        trans_id, userId, escrowWallet, 'ESCROW', budget, 0, 'USD',
        `Campaign prefunding: ${campaign.title}`, wallet_id, campaign_id
      );

      if (transferResult.status !== 200) {
        return transferResult;
      }

      await this.updateData('act_campaigns', `campaign_id = '${campaign_id}'`, {
        funding_status: 'funded',
        funded_amount: budget,
      });

      this.sendAppNotification(userId, 'CAMPAIGN_FUNDED', '', budget.toString(), '', '', 'CAMPAIGN');
      logger.info('prefundCampaign success', { campaign_id, budget });
      return this.makeResponse(200, `Campaign funded with $${budget}. It is now ready to be activated.`);
    } catch (error: any) {
      logger.error('prefundCampaign error:', error);
      return this.makeResponse(500, 'Error prefunding campaign');
    }
  }

  async activateCampaign(data: any) {
    const { campaign_id, userId } = data;

    const validation = await this.validateCampaignOwnership(campaign_id, userId);
    if (!validation.valid) {
      return validation.error;
    }
    const campaignData = validation.campaign;

    if (campaignData.status == 'active') {
      return this.makeResponse(200, `Campaign is already active`);
    }

    if ( campaignData.status != 'open_to_applications') {
      return this.makeResponse(400, `Campaign is in a ${campaignData.status} status, can't be activated`);
    }

    if (campaignData.funding_status !== 'funded') {
      return this.makeResponse(400, "Campaign must be funded before activation. Please deposit the campaign budget first.");
    }


    

    const campaignTitle = campaignData.title;

    const approvedUsers: any = await this.callQuerySafe(`
      SELECT * FROM act_campaign_invites 
      WHERE campaign_id = '${campaign_id}' 
        AND invite_status = 'accepted' 
        AND application_status = 'approved'
    `);

    if (approvedUsers.length === 0) {
      return this.makeResponse(400, "Campaign must have at least one approved application before activation");
    }

    const today = new Date().toISOString().slice(0, 10);
    if (new Date(today) < new Date(campaignData.start_date)) {
      //   return this.makeResponse(400, "Campaign cannot be activated before the start date");
    }

    const activateon = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const update = {
      status: "active",
      start_date: activateon,
      activated_on: activateon
    };

    // Create group using Groups model
    const groupInfo = {
      name: campaignData.title,
      description: campaignData.description,
      rules: "Post relevant information",
      membership_type: "open",
      userId: campaignData.created_by_user_id
    };
    await this.updateData("act_campaigns", `campaign_id = '${campaign_id}'`, update);


    try {
      const groupCreateInfo = await this.groupsModel.createGroup(groupInfo, 'yes');
      const groupId = groupCreateInfo.data.groupId;
      const createdBy = campaignData.created_by_user_id

      const updatedCampaign = { group_id: groupId };
      await this.updateData("act_campaigns", `campaign_id = '${campaign_id}'`, updatedCampaign);

      await this.addInfluencersToGroup(approvedUsers, groupId, campaignTitle, createdBy);

      const messageToMembers = "Hello, this campaign has been activated and you can now start working on it. Good luck!"
      await this.sendGroupMessage(campaignData.created_by, messageToMembers, campaignData.group_id)
      const userEmail = await this.getUsersEmail(campaignData.created_by_user_id)

       if (userEmail) {
        this.sendEmail("CAMPAIGN_ACTIVATED_SENDER_EMAIL", userEmail, campaignData.title)
      }
    } catch (error) {
      logger.error("Error in activateCampaign:", error);
    }

    return this.makeResponse(200, "Campaign activated successfully");

  }

  async addInfluencersToGroup(approvedUsers: any, groupId: string, campaignTitle: string, createdBy: string) {
    console.log("addInfluencersToGroup", approvedUsers, groupId, campaignTitle)
    for (let i = 0; i < approvedUsers.length; i++) {
      const user_id = approvedUsers[i].user_id;
      const response = await this.addMember({ groupId: groupId, userId: user_id, addedBy: createdBy })
      this.logOperation("INVITE_MEMBER", groupId, user_id, createdBy, response)
      this.sendAppNotification(user_id, "CAMPAIGN_ACTIVATED", campaignTitle, "", "", "", "CAMPAIGN", createdBy)
    }
    return true;
  }

  async getObjectives() {
    const response = await this.callQuerySafe("SELECT * FROM objectives ORDER BY created_at DESC");
    return this.makeResponse(200, "success", response);
  }

  // =====================================
  // CAMPAIGN ACTIONS & ACTIVITIES  
  // =====================================

  async isUserApprovedForCampaign(userId: string, campaign_id: string) {
    const response: any = await this.callQuerySafe(`
      SELECT * FROM act_campaign_invites 
      WHERE user_id = '${userId}' AND campaign_id = '${campaign_id}' AND application_status = 'approved'
    `);
    return response.length > 0 ? true : false;
  }
  async startCampaign(data: any) {
    try {
      logger.info("startCampaign-1", data);
      const { userId, campaign_id } = data;

      const campaignInfo = await this.getActiveCampaignById(campaign_id);
      if (campaignInfo.length == 0) {
        logger.error("startCampaign-2", "Campaign not found or already closed");
        return this.makeResponse(404, 'Campaign not found or already closed')
      }

      const { start_date } = campaignInfo[0];
      const today = new Date().toISOString().slice(0, 10);
      if (new Date(today) < new Date(start_date)) {
        //  return this.makeResponse(400, "Campaign cannot be started as today is not the start date.");
      }

      const isUserApproved = await this.isUserApprovedForCampaign(userId, campaign_id);
      if (!isUserApproved) {
        return this.makeResponse(400, "User is not approved for this campaign");
      }

      const activityInfo = await this.selectDataQuery(`act_campaign_invites`, `campaign_id='${campaign_id}' AND user_id='${userId}' AND action_status ='not_started'`)
      if (activityInfo.length == 0) {
        return this.makeResponse(404, 'User campaign not in a status that can be started')
      }

      const newTask = { action_status: 'started' };
      const insertedTaskId = await this.updateData("act_campaign_invites", `campaign_id='${campaign_id}' AND user_id='${userId}'`, newTask);
      if (insertedTaskId == false) {
        throw new Error(`not added`)
      }

      return this.makeResponse(200, "Campaign marked as started, now perform the different tasks.");
    } catch (error) {
      logger.error("startCampaign-3", "Error adding task");
      return this.makeResponse(500, "Error adding task");
    }
  }

  async activityComplete(data: any) {
    try {
      logger.info("activityComplete-1", data);
      const { activity_url, userId, campaign_id } = data;

      const campaignInfo = await this.getActiveCampaignById(campaign_id);
      if (campaignInfo.length == 0) {
        return this.makeResponse(404, 'Campaign not found or already closed')
      }

      const { created_by } = campaignInfo[0];
      const activitystarted = await this.callQuerySafe(`
        SELECT * FROM act_campaign_invites
        WHERE campaign_id='${campaign_id}' AND user_id='${userId}'
          AND action_status IN ('started', 'revision_required')
      `);
      if (activitystarted.length == 0) {
        return this.makeResponse(404, 'User campaign not in a status that can be completed')
      }

      // Check if all campaign tasks are completed
      const campaignTasks: any = await this.callQuerySafe(`select * from act_tasks where campaign_id='${campaign_id}' `)
      logger.info("activityComplete-2", campaignTasks)
      for (let i = 0; i < campaignTasks.length; i++) {
        const taskId = campaignTasks[i].task_id
        logger.info("activityComplete-3", taskId)

        const tasks: any = await this.callQuerySafe(`select * from act_task_users where activity_id='${taskId}' AND status='complete' `)
        logger.info("activityComplete-4", tasks)

        if (tasks.length == 0) {
          return this.makeResponse(404, 'Please complete all campaign tasks before marking the campaign as finished')
        }
      }

      const id = activitystarted[0].id
      const completedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const update = {
        activity_url,
        action_status: 'completed',
        completed_at: completedAt,
      }
      await this.updateData(`act_campaign_invites`, `id=${id}`, update)

      try {
        const userInfo = await this.getUsersEmail(userId)
        const userEmail = userInfo

        const creatorEmail = await this.getUsersEmail(created_by)
        const userTitle = 'User complete one of your campaigns'
        const infTitle = 'You have marked the campaign as done'
        if (userEmail) {
          this.sendEmail("CAMPAIGN_USER_COMPLETED", userEmail, infTitle);
        }
        if (creatorEmail) {
          this.sendEmail("CAMPAIGN_ADMIN_COMPLETED", creatorEmail, userTitle);
        }
        this.sendAppNotification(created_by, "CAMPAIGN_ADMIN_COMPLETED", "", "", "", "", "CAMPAIGN", userId);
      } catch (error) {
        logger.error("activityComplete-5", error);
      }

      this.updateCampaignCounters(campaign_id);
      return this.makeResponse(200, "Campaign marked as complete, you will be notified about the final status");
    } catch (error) {
      logger.error("activityComplete-6", error);
      return this.makeResponse(500, "Error completing task");
    }
  }

  async rejectSubmission(data: any) {
    try {
      const { campaign_id, user_id, task_id, reason } = data;

      const taskSubmission = await this.selectDataQuery(
        `act_task_users`,
        `activity_id='${task_id}' AND user_id='${user_id}' AND status='complete'`
      );

      if (taskSubmission.length === 0) {
        return this.makeResponse(404, 'Task submission not found or not in completed status');
      }

      await this.updateData(
        `act_task_users`,
        `activity_id='${task_id}' AND user_id='${user_id}'`,
        { status: 'rejected', rejection_reason: reason }
      );

      await this.updateData(
        `act_campaign_invites`,
        `campaign_id='${campaign_id}' AND user_id='${user_id}' `,
        { action_status: 'rejected' }
      );

      const campaign = await this.getCampaignByIdAnyStatus(campaign_id);
      if (campaign.length === 0) { throw new Error("Campaign not found"); }
      this.sendAppNotification(user_id, "SUBMISSION_REJECTED", "", "", "", "", "CAMPAIGN", campaign[0].created_by);

      return this.makeResponse(200, "Task submission rejected successfully");
    } catch (error) {
      logger.error("rejectSubmission error:", error);
      return this.makeResponse(500, "Error rejecting submission");
    }
  }

  async requestRevision(data: any) {
    try {
      const { campaign_id, user_id, reason } = data;
      if (!campaign_id || !user_id || !reason) {
        return this.makeResponse(400, "campaign_id, user_id, and reason are required");
      }

      const invite: any = await this.callQuerySafe(`
        SELECT * FROM act_campaign_invites
        WHERE campaign_id='${campaign_id}' AND user_id='${user_id}' AND action_status='completed'
      `);
      if (invite.length === 0) {
        return this.makeResponse(404, "No completed submission found for this creator on this campaign");
      }

      await this.updateData(
        `act_campaign_invites`,
        `campaign_id='${campaign_id}' AND user_id='${user_id}'`,
        { action_status: 'revision_required', reason }
      );

      const campaign = await this.getCampaignByIdAnyStatus(campaign_id);
      if (campaign.length === 0) { throw new Error("Campaign not found"); }
      this.sendAppNotification(user_id, "REVISION_REQUIRED", reason, "", "", "", "CAMPAIGN", campaign[0].created_by);

      this.updateCampaignCounters(campaign_id);
      return this.makeResponse(200, "Revision requested successfully");
    } catch (error) {
      logger.error("requestRevision error:", error);
      return this.makeResponse(500, "Error requesting revision");
    }
  }

  // =====================================
  // CAMPAIGN STATISTICS & ANALYTICS
  // =====================================

  async getCampaignStats(campaignId: string) {
    try {
      const response: any = await this.callQuerySafe(`
        SELECT i.invite_status, i.action_status, i.application_status,
               i.delay_flagged,
               c.budget, c.title, c.objective, c.start_date, c.end_date
        FROM act_campaign_invites i
        INNER JOIN act_campaigns c ON i.campaign_id = c.campaign_id
        WHERE i.campaign_id = '${campaignId}'`);

      // Fetch campaign info even if no invites yet
      const campaignInfo: any = await this.callQuerySafe(`
        SELECT budget, title, objective, start_date, end_date
        FROM act_campaigns WHERE campaign_id = '${campaignId}'`);

      const budget = campaignInfo[0]?.budget ?? 0;
      const campaignTitle = campaignInfo[0]?.title ?? '';
      const campaignObjective = campaignInfo[0]?.objective ?? '';
      const startDate = campaignInfo[0]?.start_date ?? null;
      const endDate = campaignInfo[0]?.end_date ?? null;

      // Fetch total paid out for this campaign
      const paymentsResult: any = await this.callQuerySafe(`
        SELECT COALESCE(SUM(amount_paid), 0) AS total_spent
        FROM campaign_payments_users
        WHERE campaign_id = '${campaignId}' AND trans_status = 'SUCCESS'`);

      const budgetSpent = parseFloat(paymentsResult[0]?.total_spent ?? 0);

      let invited = response.length;
      let accepted = 0, rejected = 0, started = 0, completed = 0;
      let submitted = 0, approved = 0, revisionRequired = 0, delayed = 0;

      response.forEach((row: any) => {
        const status = row.invite_status.toLowerCase();
        const action_status = row.action_status.toLowerCase();
        const application_status = (row.application_status || '').toLowerCase();

        switch (action_status) {
          case 'started': started++; break;
          case 'completed': completed++; break;
        }
        switch (status) {
          case 'accepted': accepted++; break;
          case 'rejected': rejected++; break;
        }
        switch (application_status) {
          case 'submitted': submitted++; break;
          case 'approved': approved++; break;
          case 'revision_required': revisionRequired++; break;
        }
        if (row.delay_flagged) delayed++;
      });

      const pending = invited - (accepted + rejected);
      const droppedOut = started - completed;

      const campaignStats = {
        campaignId,
        campaignTitle,
        campaignObjective,
        startDate,
        endDate,
        budget: parseFloat(budget),
        budgetSpent,
        invited,
        accepted,
        rejected,
        pending,
        submitted,
        approved,
        revisionRequired,
        started,
        completed,
        droppedOut,
        delayed,
      };

      return this.makeResponse(200, "success", campaignStats);
    } catch (error) {
      console.error("Error fetching campaign stats:", error);
      return this.makeResponse(500, "Failed to fetch campaign stats");
    }
  }

  async influencerStats(userId: string) {
    try {
      const completedCampaigns: any = await this.callQuerySafe(`
        SELECT COUNT(*) AS count 
        FROM act_campaign_invites 
        WHERE user_id = '${userId}' AND action_status = 'completed'
      `);

      const pendingCampaigns: any = await this.callQuerySafe(`
        SELECT COUNT(*) AS count 
        FROM act_campaign_invites 
        WHERE user_id = '${userId}' AND action_status = 'started'
      `);

      const totalEarnings: any = await this.callQuerySafe(`
        SELECT SUM(amount_paid) AS total
        FROM campaign_payments_users
        WHERE user_id = '${userId}' AND trans_status = 'SUCCESS'
      `);

      const jobBoardEarnings: any = await this.callQuerySafe(`
        SELECT SUM(amount) AS total
        FROM wl_transactions
        WHERE user_id = '${userId}' AND trans_type = 'CR'
        AND system_status = 'SUCCESS' AND op_type = 'JOB_PAYMENT'
      `);

      const totalEarningsAmount = (parseFloat(totalEarnings[0]?.total) || 0)
        + (parseFloat(jobBoardEarnings[0]?.total) || 0);

      return this.makeResponse(200, "success", {
        completed_campaigns: completedCampaigns[0]?.count || 0,
        pending_campaigns: pendingCampaigns[0]?.count || 0,
        total_earnings: totalEarningsAmount
      });
    } catch (error) {
      console.error("Error in influencerStats:", error);
      return this.makeResponse(500, "Error fetching influencer stats");
    }
  }

  async businessStats(userId: string) {
    const acceptedUsersCount: any = await this.callQuerySafe(`select count(*) as count from act_campaigns where  created_by = '${userId}' `)
    const hiredCount: any = await this.callQuerySafe(`select  count(*) as count from act_campaign_invites  where  invited_by = '${userId}' and action_status='completed'  `)
    const paidCount: any = await this.callQuerySafe(`select  count(*) as count from act_campaign_invites  where  invited_by = '${userId}' and pay_status='paid'  `)

    // Also count job board accepted/completed jobs - count DISTINCT influencers (creator_id)
    const jobBoardHiredCount: any = await this.callQuerySafe(`
      SELECT COUNT(DISTINCT creator_id) as count FROM jb_job_interests ji
      JOIN jb_job_posts j ON j.job_id = ji.job_id
      WHERE j.brand_id = '${userId}' AND ji.status IN ('accepted', 'work_done', 'completed')
    `)

    // Count total jobs (not unique influencers)
    const jobBoardJobsCount: any = await this.callQuerySafe(`
      SELECT COUNT(*) as count FROM jb_job_interests ji
      JOIN jb_job_posts j ON j.job_id = ji.job_id
      WHERE j.brand_id = '${userId}' AND ji.status IN ('accepted', 'work_done', 'completed')
    `)

    const actedUsersArray = await this.callQuerySafe(`select i.invite_status, i.action_status,i.action_date, p.first_name, p.last_name,p.profile_pic from act_campaign_invites i INNER JOIN users_profile p ON  i.user_id = p.user_id where  invited_by = '${userId}' and action_status='completed'  LIMIT 5 `)
    const totalCampaigns = acceptedUsersCount[0].count || 0
    const paid = paidCount[0].count || 0
    const completed = hiredCount[0].count || 0
    const uniqueJobBoardInfluencers = jobBoardHiredCount[0].count || 0
    const jobBoardJobs = jobBoardJobsCount[0].count || 0
    const users = actedUsersArray
    const spentInfo: any = await this.callQuerySafe(`select sum(amount_spent) as amount from campaign_payments  where  created_by = '${userId}'  `)
    const campaignSpentInfo: any = await this.callQuerySafe(`select sum(amount_spent) as amount from act_campaigns where created_by = '${userId}' `)
    const jobBoardSpentInfo: any = await this.callQuerySafe(`
      SELECT SUM(amount) AS amount FROM wl_transactions
      WHERE user_id = '${userId}' AND trans_type = 'DR'
      AND system_status = 'SUCCESS' AND op_type = 'JOB_PAYMENT'
    `)
    const spent = (parseFloat(spentInfo[0].amount) || 0)
      + (parseFloat(campaignSpentInfo[0].amount) || 0)
      + (parseFloat(jobBoardSpentInfo[0].amount) || 0)

    return this.makeResponse(200, "success", {
      total_campaigns: totalCampaigns,
      actioned_users_top: users,
      total_completed_users: completed + uniqueJobBoardInfluencers,
      total_completed_campaigns: completed,
      total_completed_jobs: jobBoardJobs,
      total_unique_influencers: uniqueJobBoardInfluencers,
      total_paid_users: paid,
      total_amount_spent: spent
    });
  }


  async getSentInvitesForCampaign(campaign_id: string) {
    const response: any = await this.callQuerySafe(`
    SELECT i.*, p.first_name, p.last_name, p.profile_pic FROM act_campaign_invites i inner join users_profile p on i.user_id=p.user_id  
    WHERE campaign_id = '${campaign_id}'
  `);
    console.log("getSentInvitesForCampaign::response", response);
    return this.makeResponse(200, "success", response);
  }

  async getSentInvitesForUser(userId: string) {
    const response = await this.callQuerySafe(`
      SELECT * FROM act_campaign_invites i 
      INNER JOIN act_campaigns c ON i.campaign_id = c.campaign_id
      WHERE i.invited_by = '${userId}'`);
    return this.makeResponse(200, "success", response);
  }

  async getAcceptedUsers(id: string) {
    const response = await this.callQuerySafe(`
     SELECT i.campaign_id,p.user_id, p.username, p.first_name, p.last_name, p.profile_pic FROM users_profile p INNER JOIN act_campaign_invites i ON p.user_id = i.user_id WHERE i.campaign_id = '${id}' AND i.invite_status = 'accepted'
 `);
    return this.makeResponse(200, "success", response);
  }

  async receivedInvites(userId: string, status: string = 'accepted') {
    // ${status}
    // AND i.invite_status = 'pending'

    const statuses = ['accepted', 'pending', 'submitted']
    const response = await this.callQuerySafe(`
     SELECT i.*, c.*, 
    JSON_OBJECT('user_id', p.business_id, 'username', p.name, 'first_name', p.name, 'last_name', '','profile_pic',p.logo) AS campaign_owner
FROM act_campaign_invites i
INNER JOIN act_campaigns c ON i.campaign_id = c.campaign_id
INNER JOIN business_profile p ON c.created_by = p.business_id
WHERE i.user_id = '${userId}'  and i.invite_status IN (${statuses.map(s => `'${s}'`).join(',')})
`);
    return this.makeResponse(200, "success", response);
  }

  async getMyCampaigns(userId: string, status: string = 'accepted') {
    const response = await this.callQuerySafe(`
     SELECT i.*, c.*, 
    JSON_OBJECT('user_id', p.business_id, 'username', p.name, 'first_name', p.name, 'last_name', '','profile_pic',p.logo) AS campaign_owner
FROM act_campaign_invites i
INNER JOIN act_campaigns c ON i.campaign_id = c.campaign_id
INNER JOIN business_profile p ON c.created_by = p.business_id
WHERE i.user_id = '${userId}' AND i.invite_status = '${status}' AND i.application_status = 'approved'
`);
    return this.makeResponse(200, "success", response);
  }

  async exploreCampaigns(userId: string) {
    // Returns all visible campaigns with invite status for this user
    const response = await this.callQuerySafe(`
      SELECT
        c.campaign_id, c.title, c.description, c.objective, c.image_urls,
        c.start_date, c.end_date, c.status, c.budget, c.number_of_influencers,
        c.earning_type,
        p.name AS brand_name, p.logo AS brand_logo,
        CASE WHEN c.status = 'open_to_applications' THEN 1 ELSE 0 END AS is_open,
        CASE WHEN i.invite_id IS NOT NULL THEN 1 ELSE 0 END AS is_invited,
        i.invite_status, i.action_status,
        i.application_status,
        i.delay_flagged, i.delay_flagged_at
      FROM act_campaigns c
      INNER JOIN business_profile p ON c.created_by = p.business_id
      LEFT JOIN act_campaign_invites i ON c.campaign_id = i.campaign_id AND i.user_id = '${userId}'
      WHERE c.status IN ('active', 'open_to_applications')
      ORDER BY c.created_on DESC
    `);
    return this.makeResponse(200, "success", response);
  }

  async getMyCreatedCampaigns(userId: string) {
    const response: any = await this.callQuerySafe(`
SELECT 
  c.*, 
  COALESCE(COUNT(i.id), 0) AS invite_count,
  COALESCE(SUM(CASE WHEN i.invite_status = 'accepted' THEN 1 ELSE 0 END), 0) AS count_accepted,
  COALESCE(SUM(CASE WHEN i.application_status = 'submitted' THEN 1 ELSE 0 END), 0) AS count_submitted,
  COALESCE(SUM(CASE WHEN i.application_status = 'approved' THEN 1 ELSE 0 END), 0) AS count_approved,
  COALESCE(SUM(CASE WHEN i.application_status = 'revision_required' THEN 1 ELSE 0 END), 0) AS count_revision_required,
  COALESCE(SUM(CASE WHEN i.action_status = 'completed' THEN 1 ELSE 0 END), 0) AS count_completed,
  COALESCE(SUM(CASE WHEN i.delay_flagged = 1 THEN 1 ELSE 0 END), 0) AS count_delayed
FROM act_campaigns c 
LEFT JOIN act_campaign_invites i ON c.campaign_id = i.campaign_id 
WHERE c.created_by = '${userId}'  
GROUP BY c.campaign_id;
    `);
    logger.info("Fetching campaigns created by user:", userId);
    return this.makeResponse(200, "success", response);
  }

  async getCampaignDetails(data: any, campaign_id: string) {
    const { userId } = data;
    const campaignResponse: any = await this.callQuerySafe(`
      SELECT 
        c.*, 
        JSON_OBJECT(
          'user_id', p.business_id, 
          'username', p.name, 
          'first_name', p.name, 
          'last_name', '', 
          'profile_pic', p.logo
        ) AS campaign_owner
      FROM act_campaigns c 
      INNER JOIN business_profile p ON c.created_by = p.business_id
      WHERE c.campaign_id = '${campaign_id}';
    `);

    if (campaignResponse.length === 0) {
      return this.makeResponse(404, "not found", {});
    }

    const campaignData = campaignResponse[0];
    const userAction = await this.selectDataQuery(
      `act_campaign_invites`,
      `user_id = '${userId}' AND campaign_id = '${campaign_id}'`
    );

    if (userAction.length > 0) {
      campaignData.user_action = userAction[0];
    } else {
      campaignData.user_action = null;
    }

    const counts: any = await this.callQuerySafe(`
SELECT
  COUNT(*) AS count_invited,
  COALESCE(SUM(CASE WHEN invite_status = 'accepted' THEN 1 ELSE 0 END), 0) AS count_accepted,
  COALESCE(SUM(CASE WHEN application_status = 'submitted' THEN 1 ELSE 0 END), 0) AS count_submitted,
  COALESCE(SUM(CASE WHEN application_status = 'approved' THEN 1 ELSE 0 END), 0) AS count_approved,
  COALESCE(SUM(CASE WHEN application_status = 'revision_required' THEN 1 ELSE 0 END), 0) AS count_revision_required,
  COALESCE(SUM(CASE WHEN action_status = 'completed' THEN 1 ELSE 0 END), 0) AS count_completed
FROM act_campaign_invites
WHERE campaign_id = '${campaign_id}'`);

    const actedUsersArray = await this.callQuerySafe(`select i.invite_status, i.action_status,i.action_date, p.first_name, p.last_name,p.profile_pic from act_campaign_invites i INNER JOIN users_profile p ON  i.user_id = p.user_id where  campaign_id = '${campaign_id}' and invite_status='accepted'  LIMIT 5 `)
    
    campaignData.count_invited = counts[0].count_invited || 0;
    campaignData.count_accepted = counts[0].count_accepted || 0;
    campaignData.count_submitted = counts[0].count_submitted || 0;
    campaignData.count_approved = counts[0].count_approved || 0;
    campaignData.count_revision_required = counts[0].count_revision_required || 0;
    campaignData.count_completed = counts[0].count_completed || 0;
    campaignData.actioned_users_total = counts[0].count_accepted || 0;
    campaignData.actioned_users_top = actedUsersArray
    campaignData.sent_invites = userAction.length
    campaignData.tasks = await this.getCampaignTasks(campaign_id)

    return this.makeResponse(200, "success", campaignData);
  }

  async getActiveCampaignById(campaignId: string) {
    return await this.selectDataQuery("act_campaigns", `campaign_id = '${campaignId}' and status='active'`);
  }

  async getCampaignByIdAnyStatus(campaignId: string) {
    return await this.selectDataQuery("act_campaigns", `campaign_id = '${campaignId}'`);
  }

  async validateCampaignOwnership(campaignId: string, userId: string) {
    const campaign = await this.getCampaignByIdAnyStatus(campaignId);
    if (campaign.length === 0) {
      return { valid: false, error: this.makeResponse(404, "Campaign not found") };
    }

    const campaignData = campaign[0];
    if (campaignData.created_by !== userId) {
      //  return { valid: false, error: this.makeResponse(403, "You are not authorized to perform this action") };
    }

    return { valid: true, campaign: campaignData };
  }

  async updateCampaignCounters(campaignId: string) {
    try {
      const response: any = await this.callQuerySafe(`
        SELECT invite_status, action_status, application_status
        FROM act_campaign_invites
        WHERE campaign_id = '${campaignId}'`);

      let invited = response.length;
      let accepted = 0, submitted = 0, approved = 0, revisionRequired = 0, completed = 0;

      response.forEach((row: any) => {
        const status = row.invite_status.toLowerCase();
        const action_status = (row.action_status || '').toLowerCase();
        const application_status = (row.application_status || '').toLowerCase();

        if (status === 'accepted') accepted++;
        if (action_status === 'completed') completed++;
        if (application_status === 'submitted') submitted++;
        if (application_status === 'approved') approved++;
        if (application_status === 'revision_required') revisionRequired++;
      });

      await this.updateData("act_campaigns", `campaign_id = '${campaignId}'`, {
        count_invited: invited,
        count_accepted: accepted,
        count_submitted: submitted,
        count_approved: approved,
        count_revision_required: revisionRequired,
        count_completed: completed
      });

      return true;
    } catch (error) {
      logger.error("Error updating campaign counters:", error);
      return false;
    }
  }

  async calculateReliabilityScores() {
    try {
      // All creators who have at least one accepted campaign invite.
      const creators: any = await this.callQuerySafe(`
        SELECT DISTINCT i.user_id
        FROM act_campaign_invites i
        WHERE i.invite_status = 'accepted'
      `);

      let updated = 0;
      const now = this.getMySQLDateTime();

      for (const row of creators) {
        const userId = row.user_id;

        const stats: any = await this.callQuerySafe(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN i.action_status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN i.application_status = 'approved' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN i.application_status = 'revision_required' THEN 1 ELSE 0 END) AS revisions,
            -- On-time: completed before the campaign end_date
            SUM(
              CASE
                WHEN i.action_status = 'completed'
                  AND i.completed_at IS NOT NULL
                  AND c.end_date IS NOT NULL
                  AND i.completed_at <= c.end_date
                THEN 1 ELSE 0
              END
            ) AS on_time,
            -- Responsiveness: accepted within the original 24-hour invite window.
            -- expiry_date is set to invite_time + 24h so it serves as the deadline proxy.
            SUM(
              CASE
                WHEN i.action_date IS NOT NULL
                  AND i.expiry_date IS NOT NULL
                  AND i.action_date <= i.expiry_date
                THEN 1 ELSE 0
              END
            ) AS responsive
          FROM act_campaign_invites i
          INNER JOIN act_campaigns c ON i.campaign_id = c.campaign_id
          WHERE i.user_id = '${userId}' AND i.invite_status = 'accepted'
        `);

        const s = stats[0];
        const total         = parseInt(s.total)      || 0;
        const completed     = parseInt(s.completed)  || 0;
        const approved      = parseInt(s.approved)   || 0;
        const revisions     = parseInt(s.revisions)  || 0;
        const onTime        = parseInt(s.on_time)    || 0;
        const responsive    = parseInt(s.responsive) || 0;

        if (total === 0) continue;

        // Completion rate (35%): accepted invites that were completed.
        const completionRate = completed / total;

        // Approval rate (30%): approved / (approved + revision_required).
        const reviewable   = approved + revisions;
        const approvalRate = reviewable > 0 ? approved / reviewable : completionRate;

        // On-time delivery (20%): completed before campaign end_date.
        const onTimeRate = completed > 0 ? onTime / completed : 0;

        // Responsiveness (15%): accepted within the 24-hour invite window.
        const responsivenessRate = total > 0 ? responsive / total : 0;

        // Weighted score 0–5 (stored in dedicated reliability_score column,
        // NOT in influencer_rating which remains user-facing).
        const score   = (
          (completionRate    * 0.35) +
          (approvalRate      * 0.30) +
          (onTimeRate        * 0.20) +
          (responsivenessRate * 0.15)
        ) * 5;
        const rounded = Math.round(score * 10) / 10;

        await this.updateData(`users_profile`, `user_id = '${userId}'`, {
          reliability_score:            rounded,
          reliability_score_updated_at: now,
        });
        updated++;
      }

      logger.info(`calculateReliabilityScores: updated ${updated} creators`);
      return updated;
    } catch (error) {
      logger.error("calculateReliabilityScores error:", error);
      return 0;
    }
  }

  /**
   * Delay Monitoring
   *
   * Finds every accepted campaign invite where the campaign's end_date has
   * passed but the creator has not yet completed their submission, and that
   * invite has not already been flagged.
   *
   * For each hit it:
   *   1. Marks the invite as delay_flagged so it won't fire again.
   *   2. Sends an in-app / push notification to the creator.
   *   3. Returns the list of overdue items for admin alerting (caller decides
   *      how to surface this — the cron logs it; the admin endpoint exposes it).
   *
   * @returns { flagged: number, items: any[] }
   */
  async monitorCampaignDelays(): Promise<{ flagged: number; items: any[] }> {
    try {
      // Overdue = campaign ended AND creator hasn't completed AND not flagged yet.
      // Include the campaign's created_by (brand user ID) so we can notify them.
      const overdue: any = await this.callQuerySafe(`
        SELECT
          i.invite_id,
          i.user_id,
          i.campaign_id,
          i.invite_status,
          i.action_status,
          i.application_status,
          c.title        AS campaign_title,
          c.end_date,
          c.created_by   AS brand_user_id,
          p.first_name,
          p.last_name,
          p.username
        FROM act_campaign_invites i
        INNER JOIN act_campaigns   c ON i.campaign_id = c.campaign_id
        INNER JOIN users_profile   p ON i.user_id     = p.user_id
        WHERE i.invite_status  = 'accepted'
          AND i.action_status <> 'completed'
          AND c.end_date       < NOW()
          AND i.delay_flagged  = 0
      `);

      if (overdue.length === 0) {
        logger.info('monitorCampaignDelays: no overdue invites found');
        return { flagged: 0, items: [] };
      }

      const now = this.getMySQLDateTime();

      // Track which brands have already been notified per campaign so we send
      // at most one brand notification per campaign per cron run, not one per creator.
      const notifiedBrands = new Set<string>();

      for (const row of overdue) {
        try {
          // 1. Flag so the cron doesn't fire again.
          await this.updateData(
            'act_campaign_invites',
            `invite_id = '${row.invite_id}'`,
            { delay_flagged: 1, delay_flagged_at: now }
          );

          // 2. Notify the creator.
          const creatorName = `${row.first_name} ${row.last_name}`.trim() || row.username;
          this.sendAppNotification(
            row.user_id,
            'CAMPAIGN_DELAY_CREATOR',
            creatorName,
            '',
            '',
            row.campaign_title,
            'CAMPAIGN'
          );

          // 3. Notify the brand owner once per campaign per run.
          const brandKey = `${row.brand_user_id}:${row.campaign_id}`;
          if (row.brand_user_id && !notifiedBrands.has(brandKey)) {
            notifiedBrands.add(brandKey);
            this.sendAppNotification(
              row.brand_user_id,
              'CAMPAIGN_DELAY_BRAND',
              '',
              '',
              '',
              row.campaign_title,
              'CAMPAIGN'
            );
          }
        } catch (innerErr) {
          logger.error(`monitorCampaignDelays: error processing invite ${row.invite_id}`, innerErr);
        }
      }

      logger.info(`monitorCampaignDelays: flagged ${overdue.length} overdue invites, notified ${notifiedBrands.size} brand(s)`);
      return { flagged: overdue.length, items: overdue };
    } catch (error) {
      logger.error('monitorCampaignDelays error:', error);
      return { flagged: 0, items: [] };
    }
  }

  async getDraftCampaign(campaignId: string) {
    const campaign = await this.getCampaignByIdAnyStatus(campaignId);
    if (campaign.length == 0 || campaign[0].status !== 'draft') {
      return this.makeResponse(404, "Draft campaign not found");
    }
    const tasks = await this.getCampaignTasks(campaignId);
    const searchLog = await this.callQuerySafe(`select * from elig_searches where campaign_id = '${campaignId}' order by id desc limit 1`);
    return this.makeResponse(200, "success", {
      campaign: campaign[0],
      tasks: tasks,
      eligibleFilter: searchLog
    });
  }


  async getEligibleUsers(data: any) {
    logger.info("getEligibleUsers-1", data);

    const MAX_LIMIT = 100; // global query limit


    const {
      campaign_id,
      requestId,
      iso_codes,
      gender,
      category_type,
      content_types,
      industry_ids: rawIndustryIds,
      userId,
    } = data;

    if (campaign_id == '') {
      return this.makeResponse(400, "Campaign ID is required");
    }

    let industry_ids = rawIndustryIds;
    if (!requestId || requestId == '') {
      return this.makeResponse(400, "Request ID is required");
    }

    const campaign = await this.getCampaignByIdAnyStatus(campaign_id);
    if (!campaign || campaign.length === 0) {
      return this.makeResponse(404, "Campaign not found");
    }


    const tasksSites: any = await this.getDistinctcampaignTasksSites(campaign_id);
    const platforms = tasksSites.map((task: any) => task.site_id);
    data.platforms = platforms;

    const { status, number_of_influencers, budget, start_date, end_date } = campaign[0];
    if (status !== 'draft') {
      return this.makeResponse(400, "Campaign must be in draft status");
    }
    console.log("getEligibleUsers::campaign", campaign[0]);

    const numberOfUsers = parseInt(number_of_influencers);
    if (typeof industry_ids === 'string') {
      try {
        industry_ids = JSON.parse(industry_ids);
      } catch {
        return this.makeResponse(400, "Invalid industry_ids format.");
      }
    }

    if (!Array.isArray(industry_ids) || industry_ids.length === 0) {
      return this.makeResponse(400, "industry_ids must be a non-empty array.");
    }

    if (iso_codes && (!Array.isArray(iso_codes) || iso_codes.length === 0)) {
      return this.makeResponse(400, "iso_codes must be a non-empty array.");
    }

    if (platforms && (!Array.isArray(platforms) || platforms.length === 0)) {
      return this.makeResponse(400, "platforms must be a non-empty array of site IDs.");
    }

    try {
      const settings: any = await this.getCampaignFees();
      // we have added the min_level_id to the settings table as requested by Angel on 9th Sept
      // angel instructed me to remove the fee and make it 0 as the fee is not used in the campaign
      console.log("settings", settings[0])
      let { daily_fee, creation_fee, min_amount, min_level_id, creation_fee_type } = settings[0]

      if (creation_fee_type.toUpperCase() == "PERCENTAGE") {
        creation_fee = (creation_fee / 100) * budget;
      }

      const number_of_influencers_you_can_get = budget / min_amount
      console.log("number_of_influencers_you_can_get", Number(number_of_influencers_you_can_get))

      if ((budget / numberOfUsers) < min_amount) {
        // return this.makeResponse(400, `Minimum budget should be ${min_amount} to create a campaign`);
      }

      const categoryOrderMap: Record<string, string> = {
        followers: 'ANY_VALUE(s.followers) DESC',
        views: 'ANY_VALUE(s.total_views) DESC',
        engagement: 'ANY_VALUE(s.engagement_rating) DESC',
      };
      const orderByClause = categoryOrderMap[category_type?.toLowerCase()] || 'ANY_VALUE(u.level_id) DESC';

      const whereClauses: string[] = [
        `u.user_type = 'influencer'`,
        `s.is_verified = 'yes'`,
      ];
      if (gender) whereClauses.push(`p.gender = '${gender}'`);
      if (iso_codes && iso_codes.length > 0) {
        const isoList = iso_codes.map((code: any) => `'${code}'`).join(',');
        whereClauses.push(`p.iso_code IN (${isoList})`);
      }
      const requiredCount = platforms.length;
      if (platforms && platforms.length > 0) {
        const siteList = platforms.join(',');
        whereClauses.push(`s.site_id IN (${siteList})`);
      }

      // if(min_level_id){
      whereClauses.push(`u.level_id >= ${min_level_id}`);
      //   }

      const whereSQL = whereClauses.join(' AND ');

      // Use hard MAX_LIMIT to reduce resource load
      const eligibleUsers: any = await this.callQuerySafe(`
        SELECT 
          u.user_id,
          ANY_VALUE(u.level_id) AS level_id,
          ANY_VALUE(p.username) AS username,
          ANY_VALUE(p.gender) AS gender,
          ANY_VALUE(p.iso_code) AS country_id,
          0 AS balance,
          ANY_VALUE(s.engagement_rating) AS engagement_rating,
          ANY_VALUE(s.total_views) AS total_views,
          ANY_VALUE(s.followers) AS followers,
          ANY_VALUE(s.username) as sm_username,
          COUNT(DISTINCT s.site_id) AS platform_count
        FROM users u
        INNER JOIN users_profile p ON u.user_id = p.user_id
        INNER JOIN user_industries ui ON u.user_id = ui.user_id
        INNER JOIN sm_site_users s ON u.user_id = s.user_id
        WHERE ${whereSQL}
        GROUP BY u.user_id
        HAVING COUNT(DISTINCT s.site_id) >= ${requiredCount}
        ORDER BY ${orderByClause}
        LIMIT ${MAX_LIMIT}

      `);

      if (eligibleUsers.length == 0) {
        return this.makeResponse(404, "No users fit the criteria");
      }

      console.log("getEligibleUsers::eligibleUsers", eligibleUsers.length);

      const validCandidates = eligibleUsers;
      /*
      const validCandidates = eligibleUsers.filter((user: any) =>
        Array.isArray(user.industry_ids) &&
        user.industry_ids.some((id: number) => industry_ids.includes(id))
      );
*/
      const selectedCandidates: any = validCandidates.slice(0, numberOfUsers);
      const count = selectedCandidates.length;

      const otherCandidates: any = validCandidates.slice(numberOfUsers);
      const otherCount = otherCandidates.length;

      const campaignDuration = Math.ceil(
        (new Date(end_date).getTime() - new Date(start_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      const durationFee = daily_fee * campaignDuration;

      let uniformPayout = 0;
      if (count > 0) {
        uniformPayout = (budget - creation_fee - durationFee) / count;
      }

      const payableToInfluencer = uniformPayout;
      console.log("payableToInfluencer", payableToInfluencer);
      if (payableToInfluencer < min_amount) {
        return this.makeResponse(400, `Minimum payout per influencer should be ${min_amount} to create a campaign`);
      }

      console.log(`Budget: ${budget}, Creation Fee: ${creation_fee}, Duration Fee: ${durationFee}, Uniform Payout: ${uniformPayout}`);

      const finalUsers = selectedCandidates.map((candidate: any, index: number) => ({
        ...candidate,
        rank: index + 1,
        usBudget: parseFloat(uniformPayout.toFixed(2))
      }));
      const finalOtherUsers = otherCandidates.map((candidate: any, index: number) => ({
        ...candidate,
        rank: 0,
        usBudget: parseFloat(uniformPayout.toFixed(2))
      }));


      const totalCampaignCost = uniformPayout * count + durationFee;
      const totalBudget = totalCampaignCost + creation_fee;


      const searchHash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
      console.log("getEligibleUsers::searchHash", searchHash);
      const response = {
        status: 200,
        message: 'success',
        searchHash: searchHash,
        requestId,
        campaign_id: campaign_id,
        fee: creation_fee,
        budget: totalCampaignCost,
        totalBudget,
        perUserBudget: uniformPayout.toFixed(2),
        eligibleCount: count,
        totalCount: eligibleUsers.length,
        currency: "USD",
        eligibleInfluencers: finalUsers,
        otherEligibleInfluencers: finalOtherUsers,
        otherEligibleInfluencersCount: otherCount
      };

      if (requestId) {
        const resp = await this.saveSearch(userId, requestId, data, response, searchHash);
      }

      logger.info("getEligibleUsers-5", response);
      return response;

    } catch (err: any) {
      logger.error("getEligibleUsers-4", "Error fetching eligible users");
      return this.makeResponse(400, "Error when trying to fetch eligible users: ");
    }
  }




  async getSearch(requestId: string) {
    const search: any = await this.callQuerySafe(`SELECT * FROM elig_searches WHERE search_id = '${requestId}' order by created_at desc`);
    if (search.length == 0) {
      return null;
    }
    return search[0];
  }

  async updateSearch(data: any) {
    try {
      const { search_id, eligible_users } = data;
      const currentSearch = await this.getSearch(search_id);
      if (currentSearch.length == 0) {
        return this.makeResponse(404, "Search not found");
      }
      const currentEligibleUsers = JSON.parse(currentSearch.eligible_users);

      for (const user of eligible_users) {
        if (!currentEligibleUsers.includes(user)) {
          currentEligibleUsers.push(user);
        }
      }

      await this.updateData("elig_searches", `search_id = '${search_id}'`, { eligible_users: JSON.stringify(eligible_users) });
    } catch (error) {
      console.error("Error in updateSearch:", error);
    }
  }

  async saveSearch(userId: string, requestId: string, request: any, data: any, searchHash: string) {
    try {

      const newSearch = {
        search_id: requestId,
        user_id: userId,
        search_query: JSON.stringify(request),
        response: JSON.stringify(data),
        eligible_users: JSON.stringify(data.eligibleInfluencers),
        search_hash: searchHash,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };
      const insertedSearchId = await this.insertData("elig_searches", newSearch);
      if (!insertedSearchId) {
        throw new Error("Search not saved");
      }

      return this.makeResponse(200, "Search saved successfully");
    } catch (error) {
      console.error("Error in saveSearch:", error);
      return this.makeResponse(500, "Error saving search");
    }
  }

  async proposedInfluencers(campaignId: string) {
    // This is dummy funtion and will be replaces with AI search

    const campaign = await this.getCampaignByIdAnyStatus(campaignId);
    if (campaign.length == 0 || campaign[0].status !== 'active') {
      return this.makeResponse(404, "Campaign not found");
    }



    return this.makeResponse(200, "success", []);
  }



  private mapPlatformNamesToIds(platforms: string[]): number[] {
    const platformMap: { [key: string]: number } = {
      'LINKEDIN': 5,
      'YOUTUBE': 6,
      'TIKTOK': 2,
      'TWITTER': 1,
      'X': 1,
      'FACEBOOK': 3,
      'INSTAGRAM': 4,
      'WHATSAPP': 7,
      'TWITCH': 8,
      'REDDIT': 9,
      'SNAPCHAT': 10,
      'PINTEREST': 11,
      'QUORA': 12
    };

    return platforms.map(platform => platformMap[platform.toUpperCase()]).filter(id => id);
  }



  async campaignSettings() {
    const fees: any = await this.getCampaignFees();
    return this.makeResponse(200, "success", fees);
  }

  async agentInviteUsers(data: any) {
    console.log("agentInviteUsers", JSON.stringify(data))

    const { min_level_id, min_points, role, userId, campaign_id, number_of_users, industry_ids } = data;
    try {
      const dynamic_fees = data.dynamic_fees || false;
      let businessId = userId;


      const campaignInfo = await this.getCampaignByIdAnyStatus(campaign_id)
      if (campaignInfo.length == 0) {
        return this.makeResponse(404, "Campaign not found");
      }
      const campaignBudget = campaignInfo[0].budget
      const eligibl = data.adjusted_search
      console.log("eligibl", eligibl)




      const eligibleUsers = eligibl.eligibleInfluencers
      const otherEligibleUsers: any = []
      const grossBudget = eligibl.totalBudget
      // const fee = eligibl.fee

      if (campaignBudget != grossBudget) {
        console.log("campaignBudget", campaignBudget)
        console.log("grossBudget", grossBudget)
        console.log("The total budget set during campaign creation (${campaignBudget}) does not match the total payable to influencers (${grossBudget}). Please review the amounts and try again.")

      }

 



      const fees: any = await this.getCampaignFees();
     


      if (eligibleUsers.length == 0) {
        return this.makeResponse(404, "No users fit the criteria");
      }

      const wallet = await this.GenerateCurrencyWallet(userId, "USD")
      const wBalance = wallet.balance
      const wallet_id = wallet.wallet_id
      const trans_id = `t${this.getRandomString()}`
      if (wBalance < grossBudget) {
        return this.makeResponse(404, `You need atleast USD ${grossBudget} to invite users`);
      }

      let crWalletId: any = (process.env.ESCROW_WALLET && process.env.ESCROW_WALLET !== 'undefined') ? process.env.ESCROW_WALLET : "ESCROW000000";
      let feeWallet: any = (process.env.FEE_WALLET && process.env.FEE_WALLET !== 'undefined') ? process.env.FEE_WALLET : "FEE000000";

      const refid = campaign_id


      //alread sent invites


      let commissionFeePercentage = fees[0].commission_percentage / 100;


      const oneDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
      //set expiry of the campaign to be 24hrs
      this.beginTransaction();

      const allInfluencers = eligibleUsers
      let amountToPay = 0;

      for (const user of allInfluencers) {
        try {
          console.log("allInfluencers1", user);
          const userAmount = user.usBudget || 0
          const existingInvite: any = await this.userAlreadyInvited(user.user_id, campaign_id)
          if (existingInvite && existingInvite.length > 0) {
            // User already invited, skip to next user
            continue;
          }
          const commissionFee = parseFloat((userAmount * commissionFeePercentage).toFixed(2));
          amountToPay += userAmount;
          const newCampaignInvite = {
            invite_id: 'ci' + this.getRandomString(),
            campaign_id,
            invite_status: 'pending',
            user_id: user.user_id,
            invited_by: userId,
            fee: commissionFee,
            expiry_date: oneDay,
            requires_application: 0,
            influencer_rank: user.rank ? user.rank : 0,
            payable_amount: userAmount
          };
          console.log("newCampaignInvite", newCampaignInvite);

          await this.insertData("act_campaign_invites", newCampaignInvite);
          this.sendAppNotification(user.user_id, "INVITE_TO_CAMPAIGN", "", "", "", "", "CAMPAIGN", userId);

        } catch (error) {
          console.error("Error in inviteUsers:", error);
        }
      }

      const budget = amountToPay;
       let fee = fees[0].creation_fee;
       const creation_fee_type = fees[0].creation_fee_type;
       if (creation_fee_type.toUpperCase() == "PERCENTAGE") {
         fee = (fee / 100) * budget;
       }
 

      const transferObj1 = await this.walletTransfer(trans_id, userId, crWalletId, "TRANSFER", budget, 0, "USD", "INFLUENCER BUDGET", wallet_id, refid)
      const transferObj = await this.walletTransfer(trans_id, "admin", feeWallet, "FEE", fee, 0, "USD", "CAMPAIGN CREATION FEE", wallet_id, refid)
      logger.info("transferObj", transferObj)
      const status = transferObj.status
      if (status != 200) {
        return transferObj;
      }

      const published_date = new Date().toISOString().slice(0, 19).replace('T', ' ')

      const budgetUpdate = { status: "open_to_applications", budget: budget, published_date: published_date, funding_status: 'funded', funded_amount: budget };
      await this.updateData("act_campaigns", `campaign_id = '${campaign_id}'`, budgetUpdate);

      this.commitTransaction();
      return this.makeResponse(200, "Request successful");
    } catch (error) {
      this.rollbackTransaction();
      console.error("Error in inviteUsers:", error);
      return this.makeResponse(500, "Error sending invites");
    }
  }
  async inviteUsers(data: any) {
    const { min_level_id, min_points, role, userId, campaign_id, number_of_users, industry_ids } = data;
    try {
      const dynamic_fees = data.dynamic_fees || false;
      let eligibl = null
      let businessId = userId;


      const campaignInfo = await this.getCampaignByIdAnyStatus(campaign_id)
      if (campaignInfo.length == 0) {
        return this.makeResponse(404, "Campaign not found");
      }
      const campaignBudget = campaignInfo[0].budget



      try {
        const requestId = data.requestId || ""
        if (requestId == "") {
          return this.makeResponse(404, "Request is required");
        }

        // risk of someone sending in more budget than they had in the first place

        if (role === 'agent' && dynamic_fees == true) {
          businessId = data.business_id;
          eligibl = data.adjusted_search;
          this.updateSearch({ search_id: requestId, eligible_users: eligibl.eligibleInfluencers });
        }

        const savedSearch = await this.getSearch(requestId);
        if (savedSearch != null) {
          eligibl = savedSearch.response
          eligibl.eligibleInfluencers = JSON.parse(savedSearch.eligible_users);
        } else {
          return this.makeResponse(404, "Previous search not found");
        }
      } catch (error) {
        logger.error("Error in inviteUsers:", error);

        return this.makeResponse(500, "Search  has not been saved");
      }

      logger.info("eligiblility", eligibl)


      const eligibleUsers = eligibl.eligibleInfluencers
      const otherEligibleUsers = eligibl.otherEligibleInfluencers
      const grossBudget = eligibl.totalBudget
      // const fee = eligibl.fee

      if (campaignBudget != grossBudget) {
        return this.makeResponse(
          400,
          `The total budget set during campaign creation (${campaignBudget}) does not match the total payable to influencers (${grossBudget}). Please review the amounts and try again.`
        );
      }

      const fees: any = await this.getCampaignFees();
      //  const daily_fee = fees[0].daily_fee;
      let fee = fees[0].creation_fee;
      const creation_fee_type = fees[0].creation_fee_type;
      if (creation_fee_type.toUpperCase() == "PERCENTAGE") {
        fee = (fee / 100) * grossBudget;
      }
      const amountLessFee = grossBudget - fee;


      if (eligibl.status != 200 || eligibleUsers.length == 0) {
        return this.makeResponse(404, "No users fit the criteria");
      }

      const wallet = await this.GenerateCurrencyWallet(userId, "USD")
      const wBalance = wallet.balance
      const wallet_id = wallet.wallet_id
      const trans_id = `t${this.getRandomString()}`
      if (wBalance < grossBudget) {
        return this.makeResponse(404, `You need atleast USD ${grossBudget} to invite users`);
      }

      let crWalletId: any = (process.env.ESCROW_WALLET && process.env.ESCROW_WALLET !== 'undefined') ? process.env.ESCROW_WALLET : "ESCROW000000";
      let feeWallet: any = (process.env.FEE_WALLET && process.env.FEE_WALLET !== 'undefined') ? process.env.FEE_WALLET : "FEE000000";

      const refid = campaign_id


      //alread sent invites


      let commissionFeePercentage = fees[0].commission_percentage / 100;


      const oneDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
      //set expiry of the campaign to be 24hrs
      this.beginTransaction();

      const allInfluencers = [...eligibleUsers, ...otherEligibleUsers];
      let amountToPay = 0;

      for (const user of allInfluencers) {
        try {
          console.log("allInfluencers1", user);
          const userAmount = user.usBudget || 0
          const existingInvite: any = await this.userAlreadyInvited(user.user_id, campaign_id)
          if (existingInvite && existingInvite.length > 0) {
            // User already invited, skip to next user
            continue;
          }
          const commissionFee = parseFloat((userAmount * commissionFeePercentage).toFixed(2));
          amountToPay += userAmount;
          const newCampaignInvite = {
            invite_id: 'ci' + this.getRandomString(),
            campaign_id,
            invite_status: 'pending',
            user_id: user.user_id,
            invited_by: userId,
            fee: commissionFee,
            expiry_date: oneDay,
            influencer_rank: user.rank ? user.rank : 0,
            payable_amount: userAmount
          };
          console.log("newCampaignInvite", newCampaignInvite);

          await this.insertData("act_campaign_invites", newCampaignInvite);
          this.sendAppNotification(user.user_id, "INVITE_TO_CAMPAIGN", "", "", "", "", "CAMPAIGN", userId);

        } catch (error) {
          console.error("Error in inviteUsers:", error);
        }
      }


      const transferObj1 = await this.walletTransfer(trans_id, userId, crWalletId, "TRANSFER", amountLessFee, 0, "USD", "INFLUENCER BUDGET", wallet_id, refid)
      const transferObj = await this.walletTransfer(trans_id, "admin", feeWallet, "FEE", fee, 0, "USD", "CAMPAIGN CREATION FEE", wallet_id, refid)
      logger.info("transferObj", transferObj)
      const status = transferObj.status
      if (status != 200) {
        return transferObj;
      }

      const published_date = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const budget = amountToPay;
      console.log("budget", budget)

      const budgetUpdate = { status: "open_to_applications", published_date: published_date, funding_status: 'funded', funded_amount: amountToPay };
      await this.updateData("act_campaigns", `campaign_id = '${campaign_id}'`, budgetUpdate);

      this.commitTransaction();
      return this.makeResponse(200, "Request successful");
    } catch (error) {
      this.rollbackTransaction();
      console.error("Error in inviteUsers:", error);
      return this.makeResponse(500, "Error sending invites");
    }
  }




  async getUserCampaign(userId: string, campaignId: string) {
    return await this.callQuerySafe(`
      SELECT * FROM act_campaign_invites 
      WHERE user_id = '${userId}' AND campaign_id = '${campaignId}'
    `);
  }

  async handleCampaignInvite(data: any) {
    console.log("handleCampaignInvite", data)
    const { userId, campaign_id, action } = data;
    const reason = data.reason || "";

    const inviteExists: any = await this.getUserCampaign(userId, campaign_id);
    if (inviteExists.length === 0) {
      return this.makeResponse(404, "Invite not found");
    }

    if (inviteExists[0].invite_status != 'pending') {
      return this.makeResponse(400, `You cannot ${action} this invite, it is in a ${inviteExists[0].invite_status} status`);
    }

    const campaign: any = await this.getCampaignByIdAnyStatus(campaign_id)
    const group_id = campaign[0].group_id
    const start_date = campaign[0].start_date

    const status = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : null;
    if (!status) {
      return this.makeResponse(400, "Invalid action");
    }
    const formattedDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

    let requires_application = inviteExists[0].requires_application
    let application_status = 'submitted'
    if (requires_application == 0) {
      application_status = 'approved'
    }

    await this.callQuerySafe(`
      UPDATE act_campaign_invites 
      SET invite_status = '${status}' , application_status='${application_status}' , action_date='${formattedDate}', reason='${reason}'
      WHERE user_id = '${userId}' AND campaign_id = '${campaign_id}' 
    `);

    if (status == "accepted") {
      this.addMember({ groupId: group_id, userId, addedBy: userId })
      this.sendAppNotification(userId, "ACCEPT_INVITE", "", "", "", "", "CAMPAIGN", campaign[0].created_by);
    }

    this.updateCampaignCounters(campaign_id);
    return this.makeResponse(200, `Invite ${status}`);
  }

  async batchProcessApplications(data: any) {
    const { userId, campaign_id, accepted_applications = [], rejected_applications = [] } = data;
    // limit the capaign to be the max number of uses for the cmapign
    // Validate ownership
    const campaign = await this.getCampaignByIdAnyStatus(campaign_id)
    if (campaign.length === 0) {
      return this.makeResponse(404, "Campaign not found");
    }
    const number_of_influencers = campaign[0].number_of_influencers


    const getApprovedInfluencers = await this.getApprovedInfluencers(campaign_id)
    console.log("getApprovedInfluencers", getApprovedInfluencers)
    const approvedInfluencers = getApprovedInfluencers.data.length
    if (approvedInfluencers >= number_of_influencers) {
      return this.makeResponse(400, "Campaign has reached the maximum number of users, please activate the campaign, or this will be auto activated in 24 hours");
    }



    const validation = await this.validateCampaignOwnership(campaign_id, userId);
    if (!validation.valid) {
      return validation.error;
    }
    const campaignData = validation.campaign;

    // Check if campaign is in a status that allows application processing
    if (!['open_to_applications', 'active'].includes(campaignData.status)) {
      return this.makeResponse(400, `Cannot process applications for campaign with status '${campaignData.status}'`);
    }

    // Validate that we have applications to process
    const totalApplications = accepted_applications.length + rejected_applications.length;
    if (totalApplications === 0) {
      return this.makeResponse(400, "No applications provided to process");
    }

    // Validate all invite_ids exist and belong to this campaign
    const allInviteIds = [...accepted_applications, ...rejected_applications];
    const existingInvites: any = await this.callQuerySafe(`
      SELECT invite_id, user_id, invite_status, application_status 
      FROM act_campaign_invites 
      WHERE campaign_id = '${campaign_id}' 
        AND user_id IN (${allInviteIds.map((id: string) => `'${id}'`).join(',')})
        AND invite_status = 'accepted'
        AND application_status = 'submitted'
    `);

    if (existingInvites.length !== allInviteIds.length) {
      return this.makeResponse(400, "Some invite IDs are invalid or not in pending status");
    }

    const formattedDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const results = {
      accepted_count: 0,
      rejected_count: 0,
      errors: []
    };

    try {
      this.beginTransaction();

      // Process accepted applications
      if (accepted_applications.length > 0) {
        const acceptedResult = await this.callQuerySafe(`
          UPDATE act_campaign_invites 
          SET application_status = 'approved', 
              action_date = '${formattedDate}' 
          WHERE user_id IN (${accepted_applications.map((id: string) => `'${id}'`).join(',')})
            AND campaign_id = '${campaign_id}'
        `);

        results.accepted_count = accepted_applications.length;

        // Send notifications to accepted users
        const acceptedUsers = existingInvites.filter((invite: any) =>
          accepted_applications.includes(invite.invite_id)
        );

        for (const invite of acceptedUsers) {
          this.sendAppNotification(invite.user_id, "APPLICATION_APPROVED", "", "", "", "", "CAMPAIGN", campaignData.created_by);
        }
      }

      // Process rejected applications
      if (rejected_applications.length > 0) {
        const rejectedResult = await this.callQuerySafe(`
          UPDATE act_campaign_invites 
          SET application_status = 'rejected', 
              action_date = '${formattedDate}' 
          WHERE user_id IN (${rejected_applications.map((id: string) => `'${id}'`).join(',')})
            AND campaign_id = '${campaign_id}'
        `);

        results.rejected_count = rejected_applications.length;

        // Send notifications to rejected users
        const rejectedUsers = existingInvites.filter((invite: any) =>
          rejected_applications.includes(invite.invite_id)
        );

        for (const invite of rejectedUsers) {
          this.sendAppNotification(invite.user_id, "APPLICATION_REJECTED", "", "", "", "", "CAMPAIGN", campaignData.created_by);
        }
      }

      this.commitTransaction();

      const getApprovedInfluencers2 = await this.getApprovedInfluencers(campaign_id)
      const approvedInfluencers2 = getApprovedInfluencers2.data.length
      const activateon = new Date().toISOString().slice(0, 19).replace('T', ' ')
      console.log("approvedInfluencers2", approvedInfluencers2, number_of_influencers)
      if (approvedInfluencers2 >= number_of_influencers) {
        this.activateCampaign({ campaign_id, userId })
      }
      this.updateCampaignCounters(campaign_id);
      return this.makeResponse(200, "Applications processed successfully", results);
    } catch (error) {
      this.rollbackTransaction();
      console.error("Error in batchProcessApplications:", error);
      return this.makeResponse(500, "Error processing applications");
    }
  }

  async createCampaign(data: any) {
    try {

      logger.info(`createCampaign`, data)
      console.log("createCampaignByUser", data)
      const { title, role, userId, agentId, staffId, campaign_image, number_of_influencers, description, objective, requestId, start_date, end_date, budget, tasks, earning_type } = data;
      const campaign_id = "cp" + this.getRandomString();

      if (!tasks || tasks.length === 0) {
        return this.makeResponse(400, "You need at least one task.");
      }

      let final_campaign_image = campaign_image;
      if (!campaign_image || campaign_image.trim() === '') {
        final_campaign_image = "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1600&q=80";
      }

      // Determine business_id, creator_type, and created_by_user_id based on role
      let finalBusinessId: string;
      let creator_type: 'brand' | 'agent' | 'staff' = 'brand';
      let created_by_user_id: string;

      // CASE 1: Agent creating campaign
      if (role === 'agent') {
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
      } else if (role === 'staff') {
        if (!staffId) {
          return this.makeResponse(400, "staffId is required for staff");
        }

        // Get staff's business
        const staffBusiness = await this.getStaffBusiness(staffId);
        if (!staffBusiness) {
          return this.makeResponse(404, "Staff member not found");
        }
        if (staffBusiness.status !== 'active') {
          return this.makeResponse(403, "Staff account is inactive");
        }

        finalBusinessId = staffBusiness.business_id;
        creator_type = 'staff';
        created_by_user_id = staffId;
      }
      // CASE 3: Brand owner creating campaign
      else {
        const userInfo = await this.getUserById(userId);
        if (!userInfo || userInfo.length === 0) {
          return this.makeResponse(404, "User not found");
        }
        const userType = userInfo[0].user_type;
        if (userType !== 'brand') {
          return this.makeResponse(400, "Only brand users can create campaigns");
        }

        finalBusinessId = userId;
        creator_type = 'brand';
        created_by_user_id = userId;
      }

      console.log("Campaign creation:", { finalBusinessId, creator_type, created_by_user_id });

      const fees: any = await this.getCampaignFees();
      const daily_fee = fees[0].daily_fee;
      //  const creation_fee = fees[0].creation_fee;
      console.log("fees", fees)
      const creation_fee_type = fees[0].creation_fee_type;
      const min_amount = fees[0].min_amount;
      let creation_fee = fees[0].creation_fee;
      console.log("creation_fee", creation_fee)

      if (creation_fee_type.toUpperCase() == "PERCENTAGE") {
        creation_fee = (creation_fee / 100) * budget;
      }



      // Check if start date is in the future
      const today = new Date().toISOString().slice(0, 10);
      const min_end_date = new Date(start_date).setDate(new Date(start_date).getDate() + 1);


      const minStartDate = new Date();
      minStartDate.setDate(minStartDate.getDate() + 3);
      minStartDate.setHours(0, 0, 0, 0);

      const startDateObj = new Date(start_date);
      startDateObj.setHours(0, 0, 0, 0);
      console.log("startDateObj", startDateObj)
      console.log("minStartDate", minStartDate)
      console.log("startDateObj < minStartDate", startDateObj < minStartDate)

      if (startDateObj < minStartDate) {
        return this.makeResponse(400, "Campaign start date should be at least 3 days from today " + minStartDate.toDateString());
      }



      if (new Date(end_date) <= new Date(min_end_date)) {
        return this.makeResponse(400, "Campaign end date must be at least 1 day after start date");
      }

      const totalCampaignCost = budget - creation_fee;

      if ((totalCampaignCost / number_of_influencers) < min_amount) {
        return this.makeResponse(400, `Minimum payout per influencer should be atleast ${min_amount} USD, therefore increase your budget or reduce the number of influencers you intend to invite`);
      }


      const wallet = await this.GenerateCurrencyWallet(userId, "USD")
      const wBalance = wallet.balance
      if (wBalance < min_amount) {
        //  return this.makeResponse(404, `You need atleast USD ${budget} in your wallet to create a campaign`);
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
        image_urls: final_campaign_image,
        budget,
        number_of_influencers,
        earning_type: earning_type || 'paid',
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


  async getCampaignTasks(campaignId: string) {
    return await this.callQuerySafe(`SELECT * FROM act_tasks WHERE campaign_id = '${campaignId}'`);
  }
  async getDistinctcampaignTasksSites(campaignId: string) {
    return await this.callQuerySafe(`SELECT site_id FROM act_tasks WHERE campaign_id = '${campaignId}' group by site_id`);
  }

  async updateCampaign(data: any) {
    try {
      logger.info(`updateCampaign`, data)
      const { title, userId, campaign_image, number_of_influencers, description, objective, requestId, start_date, end_date, budget, tasks, campaign_id } = data;

      if (!tasks || tasks.length === 0) {
        return this.makeResponse(400, "You need at least one task.");
      }

      // Validate ownership
      const validation = await this.validateCampaignOwnership(campaign_id, userId);
      if (!validation.valid) {
        return validation.error;
      }
      const campaignData = validation.campaign;

      // Check if campaign is in a status that allows updates
      if (campaignData.status !== 'draft') {
        return this.makeResponse(400, `Cannot update campaign with status '${campaignData.status}'. Only draft campaigns can be updated.`);
      }

      let final_campaign_image = campaign_image;
      if (!campaign_image || campaign_image.trim() === '') {
        final_campaign_image = campaignData.image_urls || "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1600&q=80";
      }

      const fees: any = await this.getCampaignFees();
      const daily_fee = fees[0].daily_fee;
      //  const creation_fee = fees[0].creation_fee;
      console.log("fees", fees)
      const creation_fee_type = fees[0].creation_fee_type;
      let creation_fee = fees[0].creation_fee;
      console.log("creation_fee", creation_fee)

      if (creation_fee_type == "PERCENTAGE") {
        creation_fee = (creation_fee / 100) * budget;
      }
      const min_amount = fees[0].min_amount;

      // Check if start date is in the future
      const today = new Date().toISOString().slice(0, 10);
      const min_end_date = new Date(start_date).setDate(new Date(start_date).getDate() + 1);



      const minStartDate = new Date();
      minStartDate.setDate(minStartDate.getDate() + 3);
      minStartDate.setHours(0, 0, 0, 0); // reset to midnight


      const startDateObj = new Date(start_date);
      startDateObj.setHours(0, 0, 0, 0); // reset to midnight
      console.log("startDateObj", startDateObj)
      console.log("minStartDate", minStartDate)
      console.log("startDateObj < minStartDate", startDateObj < minStartDate)

      if (startDateObj < minStartDate) {
        return this.makeResponse(400, "Campaign start date should be at least 3 days from today " + minStartDate.toDateString());
      }


      if (new Date(end_date) <= new Date(min_end_date)) {
        return this.makeResponse(400, "Campaign end date must be at least 3 days after start date");
      }

      const totalCampaignCost = budget - creation_fee;

      if ((totalCampaignCost / number_of_influencers) < min_amount) {
        return this.makeResponse(400, `Minimum payout per influencer should be atleast ${min_amount} USD, therefor increase your budget or reduce the number of influencers you intend to invite`);
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
        AND created_by = '${userId}' 
        AND created_on > '${formattedDate}'
        AND campaign_id != '${campaign_id}'
      `);

      if (existingCampaigns.length > 0) {
        return this.makeResponse(400, "A campaign with the same title has already been posted within the last 3 minutes.");
      }

      const updatedCampaign = {
        title,
        description,
        start_date,
        objective,
        end_date,
        image_urls: final_campaign_image,
        budget,
        number_of_influencers
      };

      this.beginTransaction()
      const result = await this.updateData("act_campaigns", `campaign_id = '${campaign_id}'`, updatedCampaign);
      if (!result) {
        throw new Error("Campaign not updated");
      }

      try {
        await this.deleteData("act_tasks", `campaign_id = '${campaign_id}'`);
        for (const task of tasks) {
          const task_id = "t" + this.getRandomString();
          let currentPeriodId = this.defaultPeriod();
          let nextPeriodDate = null;

          if (task.is_repetitive == 'yes') {
            currentPeriodId = "TS" + this.getRandomString();
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
            created_by: userId,
            is_repetitive: task.is_repetitive,
            site_id: task.site_id,
            repeats_after: task.repeats_after,
            period_id: currentPeriodId,
            requires_url: task.requires_url,
            next_period_date: nextPeriodDate
          };
          await this.insertData("act_tasks", newTask);
        }
      } catch (error) {
        logger.error("Error in updateCampaign:", error)
        this.rollbackTransaction()
        return this.makeResponse(400, "Tasks object not properly formulated");
      }

      if (requestId) {
        await this.updateData("elig_searches", `search_id = '${requestId}'`, { campaign_id: campaign_id });
      }

      this.commitTransaction()

      return this.makeResponse(200, "Campaign updated successfully", updatedCampaign);
    } catch (error) {
      this.rollbackTransaction()
      console.error("Error in updateCampaign:", error);
      return this.makeResponse(500, "Error updating campaign");
    }
  }

  async getCampaignInvites(campaign_id: string) {
    return await this.selectDataQuery(`act_campaign_invites`, `campaign_id = '${campaign_id}'`);
  }

  async deleteCampaign(data: any) {
    try {
      const { userId, campaign_id } = data;

      // Validate ownership
      const validation = await this.validateCampaignOwnership(campaign_id, userId);
      if (!validation.valid) {
        return validation.error;
      }
      const campaignData = validation.campaign;

      // Check if campaign is in a status that allows deletion
      if (!['draft', 'open_to_applications'].includes(campaignData.status)) {
        return this.makeResponse(400, `Cannot delete campaign with status '${campaignData.status}'. Only draft or published campaigns can be deleted.`);
      }

      const invites = await this.getCampaignInvites(campaign_id);
      if (invites.length > 0) {
        return this.makeResponse(400, "Campaign can't be deleted, it already has sent invites");
      }

      const { group_id } = campaignData;

      const updatedCampaign = {
        status: 'deleted',
        closed_by: userId
      };

      const updatedGroup = {
        group_status: 'deleted',
        closed_by: userId
      };

      const result = await this.updateData("act_campaigns", `campaign_id = '${campaign_id}'`, updatedCampaign);
      const result2 = await this.updateData("sc_groups", `group_id = '${group_id}'`, updatedGroup);
      if (!result) {
        throw new Error("Campaign not deleted");
      }

      return this.makeResponse(200, "Campaign deleted successfully", { campaign_id });
    } catch (error) {
      console.error("Error in deleteCampaign:", error);
      return this.makeResponse(500, "Error deleting campaign");
    }
  }

  // =====================================
  // CAMPAIGN CLOSURE & COMPLETION
  // =====================================

  async closeCampaignManually(data: any) {
    try {
      const { campaignId } = data
      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const expiredCampaigns: any = await this.callQuerySafe(`
        SELECT *
        FROM act_campaigns
        WHERE campaign_id='${campaignId}' and  status = 'active'
      `);

      if (expiredCampaigns.length === 0) {
        return this.makeResponse(404, "Campaign not found");
      }

      const { campaign_id, created_by, budget, title, group_id } = expiredCampaigns[0];

      const pay = { campaign_id, budget, created_by, closed_date: currentDate }
      await this.insertData("campaign_payments", pay)

      await this.updateData("act_campaigns", `campaign_id = '${campaign_id}'`, {
        status: 'closed',
        closed_date: currentDate,
      });

      await this.updateData("sc_groups", `group_id = '${group_id}'`, {
        group_status: 'archived',
      });

      await this.updateData(`act_campaign_invites`, `campaign_id='${campaign_id}' AND action_status ='completed' and pay_status='not_paid'`, {
        pay_status: 'in_review',
      })

      const creatorEmail = await this.getUsersEmail(created_by)
      if (creatorEmail) {
        this.sendEmail("CAMPAIGN_CLOSED", creatorEmail, title);
      }
      return this.makeResponse(200, "Campaign closed successfully");
    } catch (error) {
      console.error("Error in closeCampaignManually:", error);
      return this.makeResponse(500, "Error closing campaign");
    }
  }

  async closeExpiredCampaigns() {
    try {
      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const expiredCampaigns: any = await this.callQuerySafe(`
        SELECT * 
        FROM act_campaigns 
        WHERE end_date < '${currentDate}' AND status = 'active'
      `);
      logger.info(`expiredCampaigns==>1`, expiredCampaigns.length)

      if (expiredCampaigns.length === 0) {
        logger.info("No expired campaigns found.");
        return;
      }

      for (const campaign of expiredCampaigns) {
        this.closeCampaignManually({ campaignId: campaign.campaign_id });
      }

      return this.makeResponse(200, "Expired campaigns closed successfully");
    } catch (error) {
      console.error("Error in closeExpiredCampaigns:", error);
      return this.makeResponse(500, "Error closing expired campaigns");
    }
  }

  async closeExpiredCampaignInvitations() {
    try {
      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
      logger.info(`Checking for expired invitations. Current time (UTC): ${currentDate}`);

      // Use callQuerySafe directly because selectDataQuery doesn't support < operator
      const query = `SELECT * FROM act_campaign_invites WHERE expiry_date < ? AND invite_status = ? LIMIT 100`;
      const expiredInvitations: any = await this.callQuerySafe(query, [currentDate, 'pending']);
      logger.info(`Expired invitations found: ${expiredInvitations.length}`);

      if (expiredInvitations.length === 0) {
        logger.info("No expired campaign invitations found.");
        return this.makeResponse(200, "No expired campaign invitations found");
      }

      for (const invitation of expiredInvitations) {
        try {
          await this.updateData("act_campaign_invites", `invite_id = '${invitation.invite_id}'`, {
            invite_status: 'expired',
            updated_on: currentDate,
          });

          logger.info(`Campaign invitation ${invitation.invite_id} expired successfully.`);
        } catch (error) {
          logger.error(`Error expiring invitation ${invitation.invite_id}:`, error);
        }
      }

      return this.makeResponse(200, `${expiredInvitations.length} expired campaign invitations closed successfully`);
    } catch (error) {
       return this.makeResponse(500, "Error closing expired campaign invitations");
    }
  }

  async getActionedInfluencers(campaign_id: string) {
    try {
      // for now show all wh have been invited
      //  const activityInfo = await this.selectDataQuery(`act_campaign_invites`,`campaign_id='${campaign_id}' AND invite_status ='accepted'`);
      const activityInfo = await this.selectDataQuery(`act_campaign_invites`, `campaign_id='${campaign_id}'`);

      if (activityInfo.length === 0) {
        return this.makeResponse(404, 'No completed actions found for this campaign');
      }

      const campaignTasks: any = await this.callQuerySafe(
        `SELECT * FROM act_tasks WHERE campaign_id='${campaign_id}'`
      );


      const influencers = await Promise.all(activityInfo.map(async (activity: any) => {
        const userProfile: any = await this.callQuerySafe(
          `SELECT * FROM users_profile WHERE user_id='${activity.user_id}'`
        );

        const completedTasks: any = await this.callQuerySafe(
          `SELECT * FROM act_task_users WHERE user_id='${activity.user_id}'  `
        );

        const influencerTasks = campaignTasks.map((task: any) => {
          const usCompleted = completedTasks.find((ct: any) => ct.activity_id === task.task_id);
         
         let activity_url = '';
         let status = 'not_started';
         let rejection_reason = '';
          if (usCompleted) {
            activity_url = usCompleted.activity_url || '';
            status = usCompleted.status || 'not_started';
            rejection_reason = usCompleted.rejection_reason || '';
          }

          return {
            ...task,
            status: status,
            activity_url: activity_url || '',
            rejection_reason: rejection_reason || ''
          };
        });

        return {
          ...activity,
          userProfile: userProfile.length > 0 ? userProfile[0] : null,
          tasks: influencerTasks
        };
      }));

      return this.makeResponse(200, "Success", influencers);
    } catch (error) {
      console.error("Error in getActionedInfluencers:", error);
      return this.makeResponse(500, "Error fetching actioned influencers");
    }
  }

  // =====================================
  // PAYMENT MANAGEMENT
  // =====================================

  async payAllCampaigns() {
    try {
      logger.info(`payAllCampaigns1`)
      const campaigns: any = await this.callQuerySafe(`SELECT * FROM act_campaigns WHERE status = 'closed' AND end_date <= NOW() - INTERVAL 3 DAY;`);

      if (campaigns.length === 0) {
        logger.info("No campaigns to pay.");
        return;
      }

      for (const campaign of campaigns) {
        await this.payInfluencers(campaign.campaign_id);
      }

      return this.makeResponse(200, "All campaigns processed successfully");
    } catch (error) {
      console.error("Error in payAllCampaigns:", error);
      return this.makeResponse(500, "Error processing campaigns");
    }
  }

  async rejectPayout(data: any) {
    const { status, invite_id } = data
    const activityInfo = await this.selectDataQuery(`act_campaign_invites`, `invite_id ='${invite_id}' and pay_status='in_review'`)
    if (activityInfo.length == 0) {
      return this.makeResponse(404, 'Invite not found or not in review')
    }

    if (status == "rejected") {
      const updateInfo = {
        pay_status: "rejected",
        pay_transId: null
      }
      const updatedGroup = await this.updateData("act_campaign_invites", `invite_id='${invite_id}'`, updateInfo);
      return this.makeResponse(200, "Payout rejected successfully");
    } else {
      return this.makeResponse(400, "Invalid status");
    }
  }

  async payInfluencers(campaign_id: string) {
    logger.info(`[payLog] Step 1: Start processing campaign: ${campaign_id}`);
    const closed = await this.selectDataQuery("act_campaigns", `campaign_id = '${campaign_id}' and status='closed'`);
    if (closed.length == 0) {
      logger.info(`[payLog] Step 2: Campaign not found or not closed: ${campaign_id}`);
      return this.makeResponse(500, "campaign not found.");
    }
    logger.info(`[payLog] Step 2: Campaign found and closed: ${campaign_id}`);

    const activityInfo = await this.selectDataQuery(`act_campaign_invites`, `campaign_id='${campaign_id}' AND action_status ='completed' and pay_status='in_review'`);
    if (activityInfo.length == 0) {
      logger.info(`[payLog] Step 3: No completed actions found for campaign: ${campaign_id}`);
      const current_date = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await this.updateData("act_campaigns", `campaign_id='${campaign_id}'`, { status: 'completed', completed_on: current_date });
      return this.makeResponse(404, 'No completed actions found for campaign');
    }

    let budget = closed[0].budget;
    let amount_paid_out = 0;

    const feeInfo: any = await this.getCampaignFees();
    logger.info(`[payLog] Step 4: Fee percentage: ${feeInfo[0].commission_percentage}%`);

    let totalFee = 0;
    let totalPaid = 0;
    const escrowSecret = process.env.ESCROW_SECRET_KEY;

    for (let i = 0; i < activityInfo.length; i++) {
      logger.info(`[payLog] Step 5.${i + 1}: Processing activity ${i + 1}/${activityInfo.length}`);

      const payable_amount = parseFloat(activityInfo[i].payable_amount) || 0;
      const fee = parseFloat(activityInfo[i].fee) || 0;

      const userId = activityInfo[i].user_id;
      const invite_id = activityInfo[i].invite_id;

      const netPayableAmount = payable_amount - fee;
      const exchangeRate = 150; // KES to USD rate
      const usdAmount = payable_amount / exchangeRate;

      logger.info(`[payLog] Step 5.${i + 1}: Payable amount: ${payable_amount}, Fee: ${fee}, Net payable: ${netPayableAmount}, USD equivalent: ${usdAmount}`);

      const refId = this.getRandomString();
      let stellarTxHash = null;
      let paymentMethod = 'OFF_CHAIN';

      // Try Stellar payment first if user has wallet
      try {
        const userStellarWallet = await this.userStellarService.getUserStellarWallet(userId);
        
        if (userStellarWallet && escrowSecret) {
          logger.info(`[payLog] Step 5.${i + 1}: User ${userId} has Stellar wallet. Attempting blockchain payment.`);
          
          const escrowBalance = await this.userStellarService.getUserStellarBalance('admin');
          if (parseFloat(escrowBalance) >= usdAmount) {
            const transferResult = await this.userStellarService.transferFromUserWallet(
              'admin',
              userStellarWallet.stellar_public_key,
              usdAmount.toString(),
              `Campaign payment for ${closed[0].title}`
            );
            
            if (transferResult.success) {
              stellarTxHash = transferResult.transactionId;
              paymentMethod = 'STELLAR';
              logger.info(`[payLog] Step 5.${i + 1}: Stellar payment successful: ${stellarTxHash}`);
            } else {
              logger.warn(`[payLog] Step 5.${i + 1}: Stellar payment failed, falling back to off-chain`);
            }
          }
        }
      } catch (stellarError) {
        logger.warn(`[payLog] Step 5.${i + 1}: Stellar payment error: ${stellarError}. Falling back to off-chain.`);
      }

      const paymentRecord = {
        campaign_id,
        trans_id: refId,
        user_id: userId,
        amount_payable: payable_amount,
        amount_paid: netPayableAmount,
        trans_status: 'PENDING',
        fee: fee,
        payment_method: paymentMethod,
        stellar_tx_hash: stellarTxHash
      };

      await this.insertData("campaign_payments_users", paymentRecord);
      logger.info(`[payLog] Step 5.${i + 1}: Payment record inserted for user: ${userId}`);

      const wallet = await this.GenerateCurrencyWallet(userId, "USD");
      const wallet_id = wallet.wallet_id;

      let escrowWallet: any = (process.env.ESCROW_WALLET && process.env.ESCROW_WALLET !== 'undefined') ? process.env.ESCROW_WALLET : "ESCROW000000";
      let feeWalletId: any = (process.env.FEE_WALLET && process.env.FEE_WALLET !== 'undefined') ? process.env.FEE_WALLET : "FEE000000";
      const trans_id = `t${this.getRandomString()}`
      
      // Only do off-chain transfer if Stellar payment failed or wasn't attempted
      if (paymentMethod === 'OFF_CHAIN') {
        const transferObj = await this.walletTransfer(trans_id, userId, wallet_id, "TRANSFER", netPayableAmount, fee, "USD", "CAMPAIGN PAYMENT", escrowWallet, campaign_id);
        const transferObjfee = await this.walletTransfer(trans_id, "admin", feeWalletId, "FEE", fee, 0, "USD", "CAMPAIGN FEES", escrowWallet, campaign_id);

        logger.info(`TRANSACTION_OBJS`, transferObj.data.trans_id)

        if (transferObj.status == 200) {
          const updateInfo = {
            pay_status: "paid",
            pay_transId: transferObj.data.trans_id
          };
          totalPaid += payable_amount;
          await this.updateData("act_campaign_invites", `invite_id='${invite_id}'`, updateInfo);
          await this.updateData("campaign_payments_users", `trans_id='${refId}'`, { trans_status: "SUCCESS" });
          logger.info(`[payLog] Step 5.${i + 1}: Payment successful for user: ${userId}`);
        } else {
          await this.updateData("campaign_payments_users", `trans_id='${refId}'`, { trans_status: "FAILED", rsp_data: JSON.stringify(transferObj) });
          logger.info(`[payLog] Step 5.${i + 1}: Payment failed for user: ${userId}`);
        }
      } else {
        // Stellar payment was successful
        const updateInfo = {
          pay_status: "paid",
          pay_transId: stellarTxHash
        };
        totalPaid += payable_amount;
        await this.updateData("act_campaign_invites", `invite_id='${invite_id}'`, updateInfo);
        await this.updateData("campaign_payments_users", `trans_id='${refId}'`, { trans_status: "SUCCESS", stellar_tx_hash: stellarTxHash });
        logger.info(`[payLog] Step 5.${i + 1}: Stellar payment successful for user: ${userId}`);
      }
    }

    const current_date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    logger.info(`[payLog] Step 6: All payments processed. Updating campaign status.`);

    await this.updateData("campaign_payments", `campaign_id='${campaign_id}'`, { completed_on: current_date, amount_spent: totalPaid });
    await this.updateData("act_campaigns", `campaign_id='${campaign_id}'`, { status: 'completed', completed_on: current_date, amount_spent: totalPaid });

    const balance = budget - totalPaid;
    const escrow = (process.env.ESCROW_WALLET && process.env.ESCROW_WALLET !== 'undefined') ? process.env.ESCROW_WALLET : "ESCROW000000";
    const creatorWallet = await this.GenerateCurrencyWallet(closed[0].created_by_user_id, "USD");
    const creatorWalletId = creatorWallet.wallet_id;
    const trans_id = `t${this.getRandomString()}`
    logger.info(`[payLog] Step 6: Reversing remaining balance: ${balance}`);
    const transferReversal = await this.walletTransfer(trans_id, campaign_id, creatorWalletId, "TRANSFER", balance, 0, "USD", "CAMPAIGN_BALANCE", escrow, campaign_id);

    if (transferReversal.status == 200) {
      await this.updateData("campaign_payments", `campaign_id='${campaign_id}'`, { amount_reversed: balance });
      logger.info(`[payLog] Step 6: Balance reversed successfully.`);
    } else {
      logger.info(`[payLog] Step 6: Balance reversal failed.`);
    }

    logger.info(`[payLog] Step 7: Campaign processing completed: ${campaign_id}`);
    return this.makeResponse(200, "Campaign processing completed successfully");
  }

  // ─── Pay single influencer from Job Board job ─────────────────────────────────
  
  async payInfluencer(data: any) {
    const { campaign_id, userId, amount, displayCurrency = 'KES' } = data;
    
    // Use USD for blockchain payments (Stellar only supports XLM/SBX which map to USD)
    const currency = 'USD';
    
    // Convert KES to USD (approximate rate: 150 KES = 1 USD)
    const exchangeRate = 150;
    const usdAmount = displayCurrency === 'KES' ? amount / exchangeRate : amount;
    
    if (!campaign_id || !userId || !amount) {
      return this.makeResponse(400, "campaign_id, userId, and amount are required");
    }
    
    logger.info(`[JobBoardPayment] Starting payment: ${amount} ${displayCurrency} (${usdAmount} USD) to user ${userId} for campaign ${campaign_id}`);
    
    // Get campaign info
    const campaign: any[] = await this.callQuerySafe(
      `SELECT campaign_id, title, created_by, budget, status FROM act_campaigns WHERE campaign_id = ? LIMIT 1`,
      [campaign_id]
    );
    
    if (campaign.length === 0) {
      return this.makeResponse(404, "Campaign not found");
    }
    
    if (campaign[0].status !== 'active' && campaign[0].status !== 'open_to_applications') {
      return this.makeResponse(400, "Campaign is not active");
    }
    
    // Get the brand's wallet
    const brandWallet = await this.GenerateCurrencyWallet(campaign[0].created_by, currency);
    
    if (!brandWallet) {
      return this.makeResponse(500, "Could not find brand wallet");
    }
    
    const brandWalletId = brandWallet.wallet_id;
    
    // Get or create influencer's wallet
    const influencerWallet = await this.GenerateCurrencyWallet(userId, currency);
    
    if (!influencerWallet) {
      return this.makeResponse(500, "Could not find influencer wallet");
    }
    
    const influencerWalletId = influencerWallet.wallet_id;
    
    // Calculate fee (e.g., 10% platform fee) on USD amount
    const feePercentage = 10; // Can be made configurable
    const fee = (usdAmount * feePercentage) / 100;
    const netAmount = usdAmount - fee;
    
    logger.info(`[JobBoardPayment] Fee: ${fee} USD, Net: ${netAmount} USD (from ${amount} ${displayCurrency})`);
    
    // Get escrow wallet secret for making payments
    const escrowSecret = process.env.ESCROW_SECRET_KEY;

    let stellarTxHash = null;
    let paymentMethod = 'OFF_CHAIN'; // Default to off-chain
    const refId = this.getRandomString(); // Generate reference ID for payment record

    try {
      // Check if user has a Stellar wallet
      const userStellarWallet = await this.userStellarService.getUserStellarWallet(userId);

      const escrowAccount = process.env.ESCROW_ACCOUNT || '';
      const tokenIssuer = process.env.BET_TOKEN_ISSUER || '';

      if (userStellarWallet && escrowSecret && escrowAccount && tokenIssuer) {
        // User has Stellar wallet - attempt blockchain payment
        logger.info(`[JobBoardPayment] User ${userId} has Stellar wallet. Attempting blockchain payment.`);

        // Get escrow SBX balance directly from Stellar
        const escrowBalance = await this.stellar.getBalance(
          escrowAccount,
          'SBX',
          tokenIssuer
        );
        logger.info(`[JobBoardPayment] Escrow SBX balance: ${escrowBalance}`);
        
        if (parseFloat(escrowBalance) >= usdAmount) {
          // Perform Stellar transfer from escrow
          const transferResult = await this.stellar.makePayment({
            senderKeyPair: StellarSdk.Keypair.fromSecret(escrowSecret),
            recipientPublicKey: userStellarWallet.stellar_public_key,
            assetCode: 'SBX',
            assetIssuer: tokenIssuer,
            amount: usdAmount.toString(),
            memo: `Job payment for campaign ${campaign[0].title}`
          });

          if (transferResult && transferResult !== 'failed') {
            stellarTxHash = transferResult;
            paymentMethod = 'STELLAR';
            logger.info(`[JobBoardPayment] Stellar payment successful: ${stellarTxHash}`);
          } else {
            logger.warn(`[JobBoardPayment] Stellar payment failed: ${transferResult}`);
            // Fall back to off-chain payment
          }
        } else {
          logger.warn(`[JobBoardPayment] Insufficient escrow balance for Stellar payment. Balance: ${escrowBalance}, Required: ${usdAmount}`);
        }
      } else {
        logger.info(`[JobBoardPayment] User ${userId} does not have Stellar wallet or escrow not configured. Using off-chain payment.`);
      }
      
      // Create payment record in campaign_payments_users
      await this.insertData("campaign_payments_users", {
        campaign_id,
        trans_id: refId,
        user_id: userId,
        amount_payable: amount,
        amount_paid: netAmount,
        fee: fee,
        trans_status: 'SUCCESS', // Payment processed successfully
        currency: displayCurrency, // Record original currency (KES) for display
        payment_type: 'JOB_BOARD',
        stellar_tx_hash: stellarTxHash,
        payment_status: 'COMPLETED', // Payment completed
        created_on: new Date().toISOString().slice(0, 19).replace('T', ' ')
      });
      
      // Update campaign's amount_spent
      const currentSpent: any[] = await this.callQuerySafe(
        `SELECT amount_spent FROM act_campaigns WHERE campaign_id = ? LIMIT 1`,
        [campaign_id]
      );
      const currentSpentAmount = currentSpent.length > 0 ? (parseFloat(currentSpent[0].amount_spent) || 0) : 0;
      const newSpentAmount = currentSpentAmount + usdAmount;
      await this.updateData("act_campaigns", `campaign_id = '${campaign_id}'`, {
        amount_spent: newSpentAmount
      });
      logger.info(`[JobBoardPayment] Campaign ${campaign_id} spent updated: ${newSpentAmount}`);
      
      // Update brand wallet balance (debit) and create transaction
      let newBrandBalance = 0;
      let brandBalanceUpdated = false;
      try {
        const brandWalletQuery: any[] = await this.callQuerySafe(
          `SELECT balance FROM user_wallets WHERE wallet_id = ? LIMIT 1`,
          [brandWalletId]
        );
        if (brandWalletQuery.length > 0) {
          const currentBrandBalance = parseFloat(brandWalletQuery[0].balance) || 0;
          
          // Check if brand has sufficient balance
          if (currentBrandBalance < usdAmount) {
            logger.error(`[JobBoardPayment] Brand has insufficient balance. Required: ${usdAmount}, Available: ${currentBrandBalance}`);
            return this.makeResponse(400, "Brand has insufficient wallet balance for this payment");
          }
          
          newBrandBalance = currentBrandBalance - usdAmount;
          await this.updateData("user_wallets", `wallet_id = '${brandWalletId}'`, {
            balance: newBrandBalance
          });
          brandBalanceUpdated = true;
          logger.info(`[JobBoardPayment] Brand wallet balance updated: ${currentBrandBalance} -> ${newBrandBalance}`);
          
          // Create wallet transaction for the brand (debit)
          const brandTransId = 'JB_' + this.getRandomString();
          await this.insertData("wl_transactions", {
            trans_id: brandTransId,
            user_id: campaign[0].created_by,
            dr_wallet_id: brandWalletId,
            cr_wallet_id: 'OFFCHAIN000',
            asset: currency,
            currency: currency,
            amount: usdAmount,
            trans_type: "DR",
            narration: `Job: ${campaign[0].title}`.substring(0, 40),
            status: 'SUCCESS',
            running_balance: newBrandBalance,
            system_status: 'SUCCESS'
          });
          logger.info(`[JobBoardPayment] Brand wallet transaction created: ${brandTransId}`);
        } else {
          logger.error("[JobBoardPayment] Brand wallet not found:", brandWalletId);
        }
      } catch (balanceError) {
        logger.error("[JobBoardPayment] Error updating brand balance or creating transaction:", balanceError);
      }
      
      // If brand balance wasn't updated, we cannot proceed with the payment
      if (!brandBalanceUpdated) {
        return this.makeResponse(500, "Failed to update brand wallet balance");
      }
      
      // Update influencer wallet balance (credit)
      // Use the influencerWallet that was already created/retrieved earlier
      try {
        if (influencerWallet) {
          const currentInfBalance = parseFloat(influencerWallet.balance) || 0;
          const newInfBalance = currentInfBalance + netAmount;
          await this.updateData("user_wallets", `wallet_id = '${influencerWalletId}'`, {
            balance: newInfBalance
          });
          logger.info(`[JobBoardPayment] Influencer wallet balance updated: ${currentInfBalance} -> ${newInfBalance}`);
          
          // Create wallet transaction for influencer (credit)
          const infTransId = 'JB_CR_' + this.getRandomString();
          await this.insertData("wl_transactions", {
            trans_id: infTransId,
            user_id: userId,
            dr_wallet_id: 'OFFCHAIN000',
            cr_wallet_id: influencerWalletId,
            asset: currency,
            currency: currency,
            amount: netAmount,
            trans_type: "CR",
            narration: `Job: ${campaign[0].title}`.substring(0, 40),
            status: 'SUCCESS',
            running_balance: newInfBalance,
            system_status: 'SUCCESS'
          });
          logger.info(`[JobBoardPayment] Influencer wallet transaction created: ${infTransId}`);
        } else {
          logger.warn("[JobBoardPayment] Could not find or create influencer wallet - payment will not be reflected in internal balance");
        }
      } catch (infBalanceError) {
        logger.error("[JobBoardPayment] Error updating influencer balance:", infBalanceError);
      }
      
      // Update or create payment config with status
      const paymentConfigModel = new (await import('./paymentConfig.model')).default();
      await paymentConfigModel.updatePaymentStatus(
        campaign_id, 
        stellarTxHash ? 'AVAILABLE' : 'PENDING',
        stellarTxHash || undefined
      );
      
      logger.info(`[JobBoardPayment] Payment record created: ${refId}, Stellar: ${stellarTxHash || 'N/A'}`);
      
      // Send payment notification to influencer
            try {
              this.sendAppNotification(
                userId,
                'PAYMENT_RECEIVED',
                campaign[0].title,  // task/campaign name
                netAmount.toString(),  // amount
                "", "", "WALLET", campaign[0].created_by
              );
              logger.info(`[JobBoardPayment] Payment notification sent to ${userId}`);
            } catch (notifError) {
              logger.error("[JobBoardPayment] Error sending payment notification:", notifError);
            }      
      return this.makeResponse(200, "Payment processed successfully", {
        transaction_id: refId,
        amount_paid: netAmount,
        fee: fee,
        stellar_tx_hash: stellarTxHash
      });
      
    } catch (error) {
      logger.error("[JobBoardPayment] Error processing payment:", error);
      return this.makeResponse(500, "Error processing payment: " + error);
    }
  }

  // Direct payment from brand wallet to influencer wallet (for standalone job board jobs without campaign)
  async payInfluencerDirect(data: any) {
    const { brandId, userId, amount, jobTitle, interestId, displayCurrency = 'KES' } = data;
    
    const currency = 'USD';
    const exchangeRate = 150;
    const usdAmount = displayCurrency === 'KES' ? amount / exchangeRate : amount;
    
    logger.info(`[DirectPayment] Starting direct payment: ${amount} ${displayCurrency} (${usdAmount} USD) from brand ${brandId} to user ${userId} for job: ${jobTitle}`);
    
    try {
      // Get brand's USD wallet
      const brandWallet = await this.GenerateCurrencyWallet(brandId, currency);
      if (!brandWallet) {
        logger.error("[DirectPayment] Brand wallet not found");
        return this.makeResponse(404, "Brand wallet not found");
      }
      
      // Get influencer's USD wallet
      const influencerWallet = await this.GenerateCurrencyWallet(userId, currency);
      if (!influencerWallet) {
        logger.error("[DirectPayment] Influencer wallet not found");
        return this.makeResponse(404, "Influencer wallet not found");
      }
      
      // Check brand has sufficient balance
      const brandBalance = parseFloat(brandWallet.balance) || 0;
      if (brandBalance < usdAmount) {
        logger.error(`[DirectPayment] Brand has insufficient balance. Required: ${usdAmount}, Available: ${brandBalance}`);
        return this.makeResponse(400, "Brand has insufficient wallet balance");
      }
      
      // Calculate fee (10%)
      const feePercentage = 10;
      const fee = (usdAmount * feePercentage) / 100;
      const netAmount = usdAmount - fee;
      
      // Update brand wallet (debit)
      const newBrandBalance = brandBalance - usdAmount;
      await this.updateData("user_wallets", `wallet_id = '${brandWallet.wallet_id}'`, {
        balance: newBrandBalance
      });
      
      // Create brand transaction (debit)
      const brandTransId = 'JB_DIR_DR_' + this.getRandomString();
      const narration = `Job: ${jobTitle}`.substring(0, 40);
      await this.insertData("wl_transactions", {
        trans_id: brandTransId,
        user_id: brandId,
        dr_wallet_id: brandWallet.wallet_id,
        cr_wallet_id: influencerWallet.wallet_id,
        asset: currency,
        currency: currency,
        amount: usdAmount,
        trans_type: "DR",
        op_type: 'JOB_PAYMENT',
        ref_id: interestId || null,
        narration,
        status: 'SUCCESS',
        running_balance: newBrandBalance,
        system_status: 'SUCCESS'
      });
      
      // Update influencer wallet (credit)
      const infBalance = parseFloat(influencerWallet.balance) || 0;
      const newInfBalance = infBalance + netAmount;
      await this.updateData("user_wallets", `wallet_id = '${influencerWallet.wallet_id}'`, {
        balance: newInfBalance
      });
      
      // Create influencer transaction (credit)
      const infTransId = 'JB_DIR_CR_' + this.getRandomString();
      await this.insertData("wl_transactions", {
        trans_id: infTransId,
        user_id: userId,
        dr_wallet_id: brandWallet.wallet_id,
        cr_wallet_id: influencerWallet.wallet_id,
        asset: currency,
        currency: currency,
        amount: netAmount,
        trans_type: "CR",
        op_type: 'JOB_PAYMENT',
        ref_id: interestId || null,
        narration,
        status: 'SUCCESS',
        running_balance: newInfBalance,
        system_status: 'SUCCESS'
      });
      
      logger.info(`[DirectPayment] Direct payment completed: ${netAmount} USD to ${userId}`);
      
      return this.makeResponse(200, "Payment processed successfully", {
        amount_paid: netAmount,
        fee: fee
      });
      
    } catch (error) {
      logger.error("[DirectPayment] Error processing direct payment:", error);
      return this.makeResponse(500, "Error processing payment: " + error);
    }
  }

  async userAlreadyInvited(userId: string, campaignId: string) {
    return await this.callQuerySafe(`
      SELECT * FROM act_campaign_invites 
      WHERE user_id = '${userId}' AND campaign_id = '${campaignId}'
    `);
  }


  async getActiveCampaignsForRepetitiveTasks() {
    try {
      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // Get campaigns that are active and have repetitive tasks ready for period change
      const activeCampaigns = await this.callQuerySafe(`
        SELECT DISTINCT c.campaign_id, c.title, c.status
        FROM act_campaigns c
        INNER JOIN act_tasks t ON c.campaign_id = t.campaign_id
        WHERE c.status IN ('active', 'open_to_applications')
        AND t.is_repetitive = 'yes'
        AND t.next_period_date <= '${currentDate}'
        AND t.end_date > '${currentDate}'
      `);

      return this.makeResponse(200, "Active campaigns with repetitive tasks ready for period change", activeCampaigns);
    } catch (error) {
      console.error("Error in getActiveCampaignsForRepetitiveTasks:", error);
      return this.makeResponse(500, "Error getting active campaigns");
    }
  }

  async updateRepetitiveTaskPeriods(campaignId: string) {
    try {
      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // Get tasks that need period update
      const repetitiveTasksResult = await this.callQuerySafe(`
        SELECT * FROM act_tasks
        WHERE campaign_id = '${campaignId}' 
        AND is_repetitive = 'yes' 
        AND next_period_date <= '${currentDate}'
        AND end_date > '${currentDate}'
      `);

      const repetitiveTasks: any[] = Array.isArray(repetitiveTasksResult) ? repetitiveTasksResult : [];

      if (repetitiveTasks.length === 0) {
        return this.makeResponse(404, "No repetitive tasks ready for period update");
      }

      let updatedCount = 0;
      for (const task of repetitiveTasks) {
        try {
          // Generate new period ID
          const newPeriodId = "TS" + this.getRandomString();

          // Calculate next period date based on repeats_after
          let nextPeriodDate: Date;
          const currentEndDate = new Date(task.end_date);

          if (task.repeats_after === 'daily') {
            nextPeriodDate = new Date(currentEndDate);
            nextPeriodDate.setDate(nextPeriodDate.getDate() + 1);
          } else if (task.repeats_after === 'weekly') {
            nextPeriodDate = new Date(currentEndDate);
            nextPeriodDate.setDate(nextPeriodDate.getDate() + 7);
          } else if (typeof task.repeats_after === 'number') {
            nextPeriodDate = new Date(currentEndDate);
            nextPeriodDate.setDate(nextPeriodDate.getDate() + Number(task.repeats_after));
          } else {
            // Default to daily
            nextPeriodDate = new Date(currentEndDate);
            nextPeriodDate.setDate(nextPeriodDate.getDate() + 1);
          }

          // Log the period change
          await this.insertData("act_task_periods", {
            period_id: task.period_id || "INITIAL",
            task_id: task.task_id,
            start_date: task.created_at,
            end_date: currentDate,
            status: "expired",
            created_at: currentDate
          });

          // Update the task with new period
          await this.updateData("act_tasks", `task_id = '${task.task_id}'`, {
            period_id: newPeriodId,
            next_period_date: nextPeriodDate.toISOString().slice(0, 19).replace('T', ' ')
          });

          updatedCount++;
          logger.info(`Updated task ${task.task_id} to new period ${newPeriodId}, next update: ${nextPeriodDate.toISOString()}`);
        } catch (error) {
          logger.error(`Error updating period for task ${task.task_id}:`, error);
          // Continue with other tasks even if one fails
        }
      }

      return this.makeResponse(200, `${updatedCount} repetitive task periods updated successfully`, { updatedCount });
    } catch (error) {
      console.error("Error in updateRepetitiveTaskPeriods:", error);
      return this.makeResponse(500, "Error updating repetitive task periods");
    }
  }

  async validateTaskPeriod(taskId: string, periodId: string) {
    try {
      const task: any = await this.callQuerySafe(`
        SELECT period_id, is_repetitive, end_date 
        FROM act_tasks 
        WHERE task_id = '${taskId}'
      `);

      if (!task || task.length === 0) {
        return this.makeResponse(404, "Task not found");
      }

      const taskData = task[0];

      // Check if period is valid
      if (taskData.period_id !== periodId) {
        return this.makeResponse(400, "Invalid period ID. Task period has expired or changed.");
      }

      // Check if task is still active
      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
      if (taskData.end_date <= currentDate) {
        return this.makeResponse(400, "Task has expired");
      }

      return this.makeResponse(200, "Period validation successful");
    } catch (error) {
      console.error("Error in validateTaskPeriod:", error);
      return this.makeResponse(500, "Error validating task period");
    }
  }
}