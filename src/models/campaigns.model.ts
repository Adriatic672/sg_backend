import Model from "../helpers/model";
import { subscribeToTopic, unsubscribeFromTopic } from '../helpers/FCM';
import { getItem, setItem } from "../helpers/connectRedis";
import { uploadToS3 } from '../helpers/S3UploadHelper';
import { calculateWeightedScore } from "../helpers/campaign.helper";
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import Groups from "./groups.model";

const applicationStatus = ['pending', 'accepted', 'rejected'];

export default class Campaigns extends Model {
  private groupsModel: Groups;

  constructor() {
    super();
    this.groupsModel = new Groups();
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
      SELECT campaign_id, i.user_id,influencer_rating,first_name,last_name,profile_pic,iso_code,payable_amount,invited_on,invite_status,application_status FROM act_campaign_invites i inner join users_profile up on i.user_id=up.user_id  
      WHERE campaign_id = '${campaign_id}' 
        AND invite_status = 'accepted' 
        AND application_status != 'pending'
    `);



    return this.makeResponse(200, "success", response);

  }


  async getApprovedInfluencers(campaign_id: any) {
    console.log("getApprovedInfluencers", campaign_id)
    const response: any = await this.callQuerySafe(`
      SELECT campaign_id, i.user_id,influencer_rating,first_name,last_name,profile_pic,iso_code,payable_amount,invited_on,invite_status,application_status FROM act_campaign_invites i inner join users_profile up on i.user_id=up.user_id  
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
    return this.makeResponse(200, "Application submitted", response);
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
      this.sendAppNotification(user_id, "CAMPAIGN_ACTIVATED", campaignTitle)
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
      const activitystarted = await this.selectDataQuery(`act_campaign_invites`, `campaign_id='${campaign_id}' AND user_id='${userId}' AND action_status ='started'`)
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
      const update = {
        activity_url,
        action_status: 'completed'
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
        this.sendAppNotification(created_by, "CAMPAIGN_ADMIN_COMPLETED");
      } catch (error) {
        logger.error("activityComplete-5", error);
      }

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

      this.sendAppNotification(user_id, "SUBMISSION_REJECTED");

      return this.makeResponse(200, "Task submission rejected successfully");
    } catch (error) {
      logger.error("rejectSubmission error:", error);
      return this.makeResponse(500, "Error rejecting submission");
    }
  }

  // =====================================
  // CAMPAIGN STATISTICS & ANALYTICS
  // =====================================

  async getCampaignStats(campaignId: string) {
    try {
      const response: any = await this.callQuerySafe(`
        SELECT invite_status , action_status
        FROM act_campaign_invites i 
        INNER JOIN act_campaigns c ON i.campaign_id = c.campaign_id
        WHERE i.campaign_id = '${campaignId}'       `);

      let invited = response.length;
      let accepted = 0, rejected = 0, started = 0, completed = 0;

      response.forEach((row: any) => {
        const status = row.invite_status.toLowerCase();
        const action_status = row.action_status.toLowerCase();
        const count = 1

        switch (action_status) {
          case 'started':
            started += count;
            break;
          case 'completed':
            completed += count;
            break;
          default:
            break;
        }

        switch (status) {
          case 'accepted':
            accepted += count;
            break;
          case 'rejected':
            rejected += count;
            break;
          default:
            break;
        }
      });

      const pending = invited - (accepted + rejected);
      const droppedOut = started - completed;

      const campaignStats = {
        campaignId,
        invited,
        accepted,
        rejected,
        pending,
        started,
        completed,
        droppedOut,
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

      return this.makeResponse(200, "success", {
        completed_campaigns: completedCampaigns[0]?.count || 0,
        pending_campaigns: pendingCampaigns[0]?.count || 0,
        total_earnings: totalEarnings[0]?.total || 0
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

    const actedUsersArray = await this.callQuerySafe(`select i.invite_status, i.action_status,i.action_date, p.first_name, p.last_name,p.profile_pic from act_campaign_invites i INNER JOIN users_profile p ON  i.user_id = p.user_id where  invited_by = '${userId}' and action_status='completed'  LIMIT 5 `)
    const totalCampaigns = acceptedUsersCount[0].count || 0
    const paid = paidCount[0].count || 0
    const completed = hiredCount[0].count || 0
    const users = actedUsersArray
    const spentInfo: any = await this.callQuerySafe(`select sum(amount_spent) as amount from campaign_payments  where  created_by = '${userId}'  `)
    const spent = spentInfo[0].amount || 0

    return this.makeResponse(200, "success", {
      total_campaigns: totalCampaigns,
      actioned_users_top: users,
      total_completed_users: completed,
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

  async getMyCreatedCampaigns(userId: string) {
    const response = await this.callQuerySafe(`
SELECT c.*, COALESCE(COUNT(i.id), 0) AS invite_count 
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

    const acceptedUsersCount: any = await this.callQuerySafe(`select count(*) as count from act_campaign_invites where  campaign_id = '${campaign_id}' and invite_status ='accepted' `)
    const actedUsersArray = await this.callQuerySafe(`select i.invite_status, i.action_status,i.action_date, p.first_name, p.last_name,p.profile_pic from act_campaign_invites i INNER JOIN users_profile p ON  i.user_id = p.user_id where  campaign_id = '${campaign_id}' and invite_status='accepted'  LIMIT 5 `)
    campaignData.actioned_users_total = acceptedUsersCount[0].count || 0
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

      let crWalletId: any = process.env.ESCROW_WALLET
      let feeWallet: any = process.env.FEE_WALLET

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
          this.sendAppNotification(user.user_id, "INVITE_TO_CAMPAIGN");

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
      const transferObj = await this.walletTransfer(trans_id, "admin", feeWallet, "FEES", fee, 0, "USD", "CAMPAIGN CREATION FEE", wallet_id, refid)
      logger.info("transferObj", transferObj)
      const status = transferObj.status
      if (status != 200) {
        return transferObj;
      }

      const published_date = new Date().toISOString().slice(0, 19).replace('T', ' ')

      const budgetUpdate = { status: "open_to_applications", budget: budget, published_date: published_date };
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

      let crWalletId: any = process.env.ESCROW_WALLET
      let feeWallet: any = process.env.FEE_WALLET

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
          this.sendAppNotification(user.user_id, "INVITE_TO_CAMPAIGN");

        } catch (error) {
          console.error("Error in inviteUsers:", error);
        }
      }


      const transferObj1 = await this.walletTransfer(trans_id, userId, crWalletId, "TRANSFER", amountLessFee, 0, "USD", "INFLUENCER BUDGET", wallet_id, refid)
      const transferObj = await this.walletTransfer(trans_id, "admin", feeWallet, "FEES", fee, 0, "USD", "CAMPAIGN CREATION FEE", wallet_id, refid)
      logger.info("transferObj", transferObj)
      const status = transferObj.status
      if (status != 200) {
        return transferObj;
      }

      const published_date = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const budget = amountToPay;
      console.log("budget", budget)

      const budgetUpdate = { status: "open_to_applications", published_date: published_date };
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
      this.sendAppNotification(userId, "ACCEPT_INVITE");
    }

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
          this.sendAppNotification(invite.user_id, "APPLICATION_APPROVED");
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
          this.sendAppNotification(invite.user_id, "APPLICATION_REJECTED");
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
      const { title, role, userId, agentId, staffId, campaign_image, number_of_influencers, description, objective, requestId, start_date, end_date, budget, tasks } = data;
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
        image_urls: campaign_image,
        budget,
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
        image_urls: campaign_image,
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

    for (let i = 0; i < activityInfo.length; i++) {
      logger.info(`[payLog] Step 5.${i + 1}: Processing activity ${i + 1}/${activityInfo.length}`);

      const payable_amount = parseFloat(activityInfo[i].payable_amount) || 0;
      const fee = parseFloat(activityInfo[i].fee) || 0;

      const userId = activityInfo[i].user_id;
      const invite_id = activityInfo[i].invite_id;

      const netPayableAmount = payable_amount - fee;

      logger.info(`[payLog] Step 5.${i + 1}: Payable amount: ${payable_amount}, Fee: ${fee}, Net payable: ${netPayableAmount}`);

      const refId = this.getRandomString();
      const paymentRecord = {
        campaign_id,
        trans_id: refId,
        user_id: userId,
        amount_payable: payable_amount,
        amount_paid: netPayableAmount,
        trans_status: 'PENDING',
        fee: fee
      };

      await this.insertData("campaign_payments_users", paymentRecord);
      logger.info(`[payLog] Step 5.${i + 1}: Payment record inserted for user: ${userId}`);

      const wallet = await this.GenerateCurrencyWallet(userId, "USD");
      const wallet_id = wallet.wallet_id;

      let escrowWallet: any = process.env.ESCROW_WALLET;
      let feeWalletId: any = process.env.FEE_WALLET;
      const trans_id = `t${this.getRandomString()}`
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
    }

    const current_date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    logger.info(`[payLog] Step 6: All payments processed. Updating campaign status.`);

    await this.updateData("campaign_payments", `campaign_id='${campaign_id}'`, { completed_on: current_date, amount_spent: totalPaid });
    await this.updateData("act_campaigns", `campaign_id='${campaign_id}'`, { status: 'completed', completed_on: current_date, amount_spent: totalPaid });

    const balance = budget - totalPaid;
    const escrow = process.env.ESCROW_WALLET || "";
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

  async sendReminder(data: any) {
    try {
      const { user_id, campaign_id, reminder_type, invite_id } = data;

      if (!user_id || !campaign_id || !reminder_type) {
        return this.makeResponse(400, "user_id, campaign_id, and reminder_type are required");
      }

      // Get user and campaign details
      const user: any = await this.getUsersProfile(user_id);
      const campaign: any = await this.selectDataQuery("act_campaigns", `campaign_id = '${campaign_id}'`);

      if (!user || !campaign || campaign.length === 0) {
        return this.makeResponse(404, "User or campaign not found");
      }

      const campaignData = campaign[0];
      const userName = user.first_name || user.username;
      const userEmail = await this.getUsersEmail(user_id);

      // Send email based on reminder type
      await this.sendEmail(reminder_type, userEmail, userName, campaignData.title);

      logger.info(`Reminder sent to ${userEmail} for campaign ${campaign_id}, type: ${reminder_type}`);

      return this.makeResponse(200, "Reminder sent successfully");
    } catch (error) {
      logger.error("Error in sendReminder:", error);
      return this.makeResponse(500, "Error sending reminder");
    }
  }
}