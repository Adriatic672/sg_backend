import Model from "../helpers/model";
import { getUserTier, tierAtLeast, type SubscriptionTier } from "../helpers/subscriptionTier";
import { logger } from "../utils/logger";
import ChatModel from "./chat.model";
import AdminSettings from "./admin.settings.model";

const FREE_POST_LIMIT = 1222222;
type JobAccessTier = SubscriptionTier;
const DEFAULT_CREATOR_PLUS_MAX_KES = 20000;
const DEFAULT_CREATOR_PRO_MIN_KES = 25000;

export default class JobBoard extends Model {
  private settings: AdminSettings;

  constructor() {
    super();
    this.settings = new AdminSettings();
  }

  private normaliseCompType(compType?: string | null): string {
    return (compType || "").toString().trim().toLowerCase();
  }

  private isFreeProductOrService(compType?: string | null): boolean {
    return ["product", "service", "barter"].includes(this.normaliseCompType(compType));
  }

  private deriveJobAccessTier(compType?: string | null, compAmount?: any): JobAccessTier {
    const type = this.normaliseCompType(compType);
    const amount = Number(compAmount || 0);

    if (type === "affiliate") return "plus";
    if (this.isFreeProductOrService(type)) return "free";
    if (amount >= DEFAULT_CREATOR_PRO_MIN_KES) return "pro";
    if (amount > 0) return "plus";
    return "free";
  }

  private async deriveConfiguredJobAccessTier(compType?: string | null, compAmount?: any): Promise<JobAccessTier> {
    const type = this.normaliseCompType(compType);
    const amount = Number(compAmount || 0);

    if (type === "affiliate") return "plus";
    if (this.isFreeProductOrService(type)) return "free";

    const proMinKes = await this.settings.getSettingNumber(
      "creator_pro_min_kes",
      DEFAULT_CREATOR_PRO_MIN_KES
    );
    const plusMaxKes = await this.settings.getSettingNumber(
      "creator_plus_max_kes",
      DEFAULT_CREATOR_PLUS_MAX_KES
    );

    if (amount >= proMinKes) return "pro";
    if (amount > 0 && amount <= plusMaxKes) return "plus";
    if (amount > 0) return "plus";
    return "free";
  }

  private formatJobRow(row: any) {
    const compType = row.comp_type || "cash";
    return {
      ...row,
      access_tier: row.access_tier || this.deriveJobAccessTier(compType, row.comp_amount),
      comp_amount: Number(row.comp_amount || 0),
      min_followers: Number(row.min_followers || 0),
      niche: row.niche || "",
      comp_currency: row.comp_currency || "KES",
      comp_type: compType,
    };
  }

  private normaliseJobStatus(status?: string | null): "draft" | "active" | "closed" | "deleted" {
    const value = (status || "active").toString().trim().toLowerCase();
    if (["draft", "active", "closed", "deleted"].includes(value)) {
      return value as "draft" | "active" | "closed" | "deleted";
    }
    return "active";
  }

  private defaultDraftDeadline(): string {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30);
    return deadline.toISOString().slice(0, 10);
  }

  private validatePublishableJob(data: any): string | null {
    if (!data.title || !data.title.toString().trim()) return "title is required";
    if (!data.description || data.description.toString().trim().length < 20) {
      return "description must be at least 20 characters";
    }
    if (!data.deadline) return "deadline is required";
    return null;
  }

  // ─── Quota ────────────────────────────────────────────────────────────────

  async checkPostQuota(brandId: string, compType?: string): Promise<{ canPost: boolean; requiresUpgrade?: boolean }> {
    if (!this.isFreeProductOrService(compType)) return { canPost: true };

    const rows: any[] = await this.callQuerySafe(
      `SELECT COUNT(*) AS total
       FROM jb_job_posts
       WHERE brand_id = ?
         AND status != 'deleted'
         AND LOWER(COALESCE(comp_type, '')) IN ('product', 'service', 'barter')`,
      [brandId]
    );
    const total = Number(rows[0]?.total ?? 0);
    if (total < FREE_POST_LIMIT) return { canPost: true };

    const sub: any[] = await this.callQuerySafe(
      `SELECT id FROM user_subscriptions WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [brandId]
    );
    if (sub.length > 0) return { canPost: true };

    return { canPost: false, requiresUpgrade: true };
  }

  // ─── Brand: Create / Close ─────────────────────────────────────────────────

  async createJob(data: any) {
    const { userId, title, description, comp_amount, comp_currency, comp_type,
      min_followers, niche, deadline, campaign_id, guidelines_attachment, guidelines_text } = data;
    const status = this.normaliseJobStatus(data.status);

    if (status === "active") {
      const validationError = this.validatePublishableJob({ title, description, deadline });
      if (validationError) {
        return this.makeResponse(400, validationError);
      }
    }

    // If campaign_id is provided, verify it belongs to the brand
    if (campaign_id) {
      const campaignCheck: any[] = await this.callQuerySafe(
        `SELECT campaign_id, created_by FROM act_campaigns WHERE campaign_id = ? AND created_by = ? LIMIT 1`,
        [campaign_id, userId]
      );
      if (campaignCheck.length === 0) {
        return this.makeResponse(404, "Campaign not found or not owned by you");
      }
    }

    if (status === "active") {
      const quota = await this.checkPostQuota(userId, comp_type);
      if (!quota.canPost) {
        // Generate upgrade URL for brand to upgrade their account
        const domain = process.env.DOMAIN || process.env.PROD_DOMAIN || 'https://socialgems.me';
        const upgradeUrl = `${domain}/upgrade?brand=${userId}`;
        return this.makeResponse(402, `Free product/service job post limit reached. Upgrade after ${FREE_POST_LIMIT} free posts.`, {
          requiresUpgrade: true,
          checkoutUrl: upgradeUrl,
        });
      }
    }

    if (status === "active" && comp_type === "cash" && comp_amount > 0) {
      const walletAsset = (comp_currency ?? "KES").toUpperCase();
      const walletRow: any[] = await this.callQuerySafe(
        `SELECT balance_available FROM user_wallets WHERE user_id = ? AND asset = ? AND status = 'active' LIMIT 1`,
        [userId, walletAsset]
      );
      const available = parseFloat(walletRow[0]?.balance_available ?? "0") || 0;
      if (available < comp_amount) {
        return this.makeResponse(400, `Insufficient wallet balance to post this job. You need ${walletAsset} ${comp_amount} but have ${walletAsset} ${available.toFixed(2)} available. Please top up your wallet.`);
      }
    }

    const job_id = this.getRandomString();
    const access_tier = await this.deriveConfiguredJobAccessTier(comp_type, comp_amount);
    await this.insertData("jb_job_posts", {
      job_id,
      brand_id: userId,
      title: title?.toString().trim() || "Untitled job draft",
      description: description?.toString().trim() || "",
      comp_amount: comp_amount ?? 0,
      comp_currency: comp_currency ?? "KES",
      comp_type: comp_type ?? "cash",
      access_tier,
      min_followers: min_followers ?? 0,
      niche: niche ?? null,
      deadline: deadline || this.defaultDraftDeadline(),
      campaign_id: campaign_id ?? null,
      guidelines_attachment: guidelines_attachment ?? null,
      guidelines_text: guidelines_text ?? null,
      status,
    });

    return this.makeResponse(
      200,
      status === "draft" ? "Job draft saved successfully" : "Job posted successfully",
      { job_id, campaign_id, access_tier, status }
    );
  }

  async closeJob(data: any) {
    const { userId, job_id } = data;
    if (!job_id) return this.makeResponse(400, "job_id is required");

    const job: any[] = await this.callQuerySafe(
      `SELECT job_id, brand_id FROM jb_job_posts WHERE job_id = ? LIMIT 1`,
      [job_id]
    );
    if (job.length === 0) return this.makeResponse(404, "Job not found");
    if (job[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");

    await this.updateData("jb_job_posts", `job_id = '${job_id}'`, { status: "closed" });
    return this.makeResponse(200, "Job closed successfully");
  }

  // Hard delete job post - permanently removes job and all applications
  async deleteJob(data: any) {
    const { userId, job_id } = data;
    if (!job_id) return this.makeResponse(400, "job_id is required");

    const job: any[] = await this.callQuerySafe(
      `SELECT job_id, brand_id FROM jb_job_posts WHERE job_id = ? LIMIT 1`,
      [job_id]
    );
    if (job.length === 0) return this.makeResponse(404, "Job not found");
    if (job[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");

    // Delete all applications for this job first
    await this.callQuerySafe(
      `DELETE FROM jb_job_interests WHERE job_id = ?`,
      [job_id]
    );

    // Delete the job post
    await this.callQuerySafe(
      `DELETE FROM jb_job_posts WHERE job_id = ?`,
      [job_id]
    );

    return this.makeResponse(200, "Job deleted successfully");
  }

  // ─── Brand: Update/Edit Job Post ──────────────────────────────────────────

  async updateJob(data: any) {
    const { userId, job_id, title, description, comp_amount, comp_currency, comp_type,
      min_followers, niche, deadline, guidelines_text, guidelines_attachment, campaign_id, status } = data;

    if (!job_id) return this.makeResponse(400, "job_id is required");

    // Check if job exists and belongs to the brand
    const job: any[] = await this.callQuerySafe(
      `SELECT job_id, brand_id, status, title, description, deadline, comp_type, comp_amount FROM jb_job_posts WHERE job_id = ? LIMIT 1`,
      [job_id]
    );
    if (job.length === 0) return this.makeResponse(404, "Job not found");
    if (job[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");

    // Check if job is closed - closed jobs cannot be edited
    if (job[0].status === "closed") {
      return this.makeResponse(400, "Cannot edit a closed job. Please create a new job post.");
    }

    // Build update fields dynamically
    const updateFields: any = {};
    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (comp_amount !== undefined) updateFields.comp_amount = comp_amount;
    if (comp_currency !== undefined) updateFields.comp_currency = comp_currency;
    if (comp_type !== undefined) updateFields.comp_type = comp_type;
    if (min_followers !== undefined) updateFields.min_followers = min_followers;
    if (niche !== undefined) updateFields.niche = niche;
    if (deadline !== undefined) updateFields.deadline = deadline;
    if (guidelines_text !== undefined) updateFields.guidelines_text = guidelines_text;
    if (guidelines_attachment !== undefined) updateFields.guidelines_attachment = guidelines_attachment;
    if (campaign_id !== undefined) updateFields.campaign_id = campaign_id;
    if (status !== undefined) {
      const nextStatus = this.normaliseJobStatus(status);
      if (nextStatus === "closed" || nextStatus === "deleted") {
        return this.makeResponse(400, "Use the close or delete action for this job status");
      }
      updateFields.status = nextStatus;
    }

    if (updateFields.status === "active") {
      const publishData = {
        title: title !== undefined ? title : job[0].title,
        description: description !== undefined ? description : job[0].description,
        deadline: deadline !== undefined ? deadline : job[0].deadline,
      };
      const validationError = this.validatePublishableJob(publishData);
      if (validationError) {
        return this.makeResponse(400, validationError);
      }

      if (job[0].status === "draft") {
        const quota = await this.checkPostQuota(
          userId,
          comp_type !== undefined ? comp_type : job[0].comp_type
        );
        if (!quota.canPost) {
          const domain = process.env.DOMAIN || process.env.PROD_DOMAIN || 'https://socialgems.me';
          const upgradeUrl = `${domain}/upgrade?brand=${userId}`;
          return this.makeResponse(402, `Free product/service job post limit reached. Upgrade after ${FREE_POST_LIMIT} free posts.`, {
            requiresUpgrade: true,
            checkoutUrl: upgradeUrl,
          });
        }
      }
    }

    if (comp_amount !== undefined || comp_type !== undefined) {
      updateFields.access_tier = await this.deriveConfiguredJobAccessTier(
        comp_type !== undefined ? comp_type : job[0].comp_type,
        comp_amount !== undefined ? comp_amount : job[0].comp_amount
      );
    }

    // If no fields to update, return early
    if (Object.keys(updateFields).length === 0) {
      return this.makeResponse(400, "No fields to update");
    }

    // Update the job
    await this.updateData("jb_job_posts", `job_id = '${job_id}'`, updateFields);

    // Get accepted influencers to notify them about the job update
    const acceptedInfluencers: any[] = await this.callQuerySafe(
      `SELECT ji.creator_id, u.fcm_token, u.email, u.full_name
       FROM jb_job_interests ji
       LEFT JOIN users u ON u.user_id = ji.creator_id
       WHERE ji.job_id = ? AND ji.status = 'accepted'`,
      [job_id]
    );

    return this.makeResponse(200, "Job updated successfully", {
      job_id,
      acceptedInfluencers: acceptedInfluencers.map(inf => ({
        creator_id: inf.creator_id,
        fcm_token: inf.fcm_token,
        email: inf.email,
        full_name: inf.full_name
      }))
    });
  }

  // ─── Brand: View own jobs + applicants ────────────────────────────────────

  async getBrandCampaigns(data: any) {
    const { userId } = data;
    console.log('[getBrandCampaigns] userId:', userId);
    
    // Fetch all campaigns without status filter to ensure brands can see their campaigns
    const rows: any[] = await this.callQuerySafe(
      `SELECT campaign_id, title, budget, status, created_on 
       FROM act_campaigns 
       WHERE created_by = ?
       ORDER BY created_on DESC
       LIMIT 50`,
      [userId]
    );
    
    console.log('[getBrandCampaigns] Found campaigns:', rows.length);
    console.log('[getBrandCampaigns] Campaigns:', JSON.stringify(rows));
    
    return this.makeResponse(200, "success", rows);
  }

  async getBrandJobs(data: any) {
    const { userId } = data;
    const rows: any[] = await this.callQuerySafe(
      `SELECT j.*,
              (SELECT COUNT(*) FROM jb_job_interests WHERE job_id = j.job_id) AS interest_count
       FROM jb_job_posts j
       WHERE j.brand_id = ?
       ORDER BY j.created_at DESC`,
      [userId]
    );
    const formattedRows = rows.map(row => ({
      ...this.formatJobRow(row),
      interest_count: Number(row.interest_count || 0),
      guidelines_attachment: row.guidelines_attachment || null,
      guidelines_text: row.guidelines_text || null,
      description: row.description || ''
    }));
    return this.makeResponse(200, "success", formattedRows);
  }

  async getJobApplicants(data: any) {
    const { userId, job_id } = data;
    console.log('[getJobApplicants model] userId:', userId, 'job_id:', job_id);
    
    if (!job_id) return this.makeResponse(400, "job_id is required");

    const job: any[] = await this.callQuerySafe(
      `SELECT job_id, brand_id FROM jb_job_posts WHERE job_id = ? LIMIT 1`,
      [job_id]
    );
    console.log('[getJobApplicants model] job query result:', job);
    
    if (job.length === 0) {
      console.log('[getJobApplicants model] Job not found in database');
      return this.makeResponse(404, "Job not found");
    }
    
    console.log('[getJobApplicants model] job[0].brand_id:', job[0].brand_id, 'userId:', userId, 'match:', job[0].brand_id === userId);
    if (job[0].brand_id !== userId) {
      console.log('[getJobApplicants model] AUTHORIZATION FAILED - brand_id does not match userId');
      return this.makeResponse(403, "Not authorised");
    }

    console.log('[getJobApplicants model] Authorization passed, querying interests...');
    const rows: any[] = await this.callQuerySafe(
      `SELECT DISTINCT ji.interest_id, ji.status, ji.note, ji.created_at,
              ji.creator_id, ji.job_id,
              up.first_name, up.last_name, up.profile_pic, up.influencer_rating, up.platforms_most_content,
              j.campaign_id,
              (
                  SELECT
                      CASE
                          WHEN j.campaign_id IS NOT NULL THEN (
                              SELECT MAX(cpu.trans_status)
                              FROM campaign_payments_users cpu
                              WHERE cpu.campaign_id = j.campaign_id
                              AND cpu.user_id = ji.creator_id
                              AND cpu.trans_status != 'FAILED'
                          )
                          ELSE (
                              SELECT 'SUCCESS'
                              FROM wl_transactions wt
                              WHERE wt.ref_id = ji.interest_id
                              AND wt.trans_type = 'CR'
                              AND wt.system_status = 'SUCCESS'
                              LIMIT 1
                          )
                      END
              ) as payment_status
       FROM jb_job_interests ji
       LEFT JOIN users_profile up ON up.user_id = ji.creator_id
       LEFT JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.job_id = ?
       ORDER BY ji.created_at DESC`,
      [job_id]
    );
    console.log('[getJobApplicants model] Found interests:', rows.length, rows);
    const formattedRows = rows.map(row => ({
      ...row,
      note: row.note || '',
      profile_pic: row.profile_pic || '',
      influencer_rating: Number(row.influencer_rating || 0),
      platforms_most_content: row.platforms_most_content || '',
      first_name: row.first_name || 'Unknown',
      last_name: row.last_name || '',
      payment_status: row.payment_status || 'none'
    }));
    return this.makeResponse(200, "success", formattedRows);
  }

  async shortlistCreator(data: any) {
    const { userId, interest_id } = data;
    if (!interest_id) return this.makeResponse(400, "interest_id is required");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.creator_id, j.brand_id, j.job_id, j.title
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");

    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      status: "shortlisted",
    });

    // Process 1 - Notify the Influencer
    // Pass job title as 'reason' parameter to fill {reason} placeholder in template
    this.sendAppNotification(rows[0].creator_id, "JOB_SHORTLISTED", "", "", "", rows[0].title, "CAMPAIGN", rows[0].brand_id);

    // Process 2 & 3 - Open Chat Channel for Guidelines
    try {
      const brandQuery: any[] = await this.callQuerySafe(
        `SELECT name FROM business_profile WHERE business_id = ? LIMIT 1`,
        [userId]
      );
      const brandName = brandQuery.length > 0 ? brandQuery[0].name : "Brand";

      const chatModel = new ChatModel();
      await chatModel.sendMessage({
        userId: userId,
        receiverId: rows[0].creator_id,
        username: brandName,
        text: `Hi! We've shortlisted you for our job "${rows[0].title}". Let's discuss the campaign guidelines!`,
        conversationId: "", // Will be auto-calculated by ChatModel for 1-on-1
        messageType: "CHAT"
      });
    } catch (chatError) {
      logger.error("Error creating chat conversation:", chatError);
    }

    return this.makeResponse(200, "Creator shortlisted", {
      creator_id: rows[0].creator_id,
      job_id: rows[0].job_id
    });
  }

  async approveApplicant(data: any) {
    const { userId, interest_id } = data;
    if (!interest_id) return this.makeResponse(400, "interest_id is required");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.creator_id, j.brand_id, j.job_id, j.title, j.campaign_id
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");

    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      status: "accepted",
    });

    // Bridge: Inject into Campaign Invites
    if (rows[0].campaign_id) {
      try {
        const existingInvite: any[] = await this.callQuerySafe(
          `SELECT * FROM act_campaign_invites WHERE campaign_id = ? AND user_id = ? LIMIT 1`,
          [rows[0].campaign_id, rows[0].creator_id]
        );
        if (existingInvite.length === 0) {
          await this.insertData("act_campaign_invites", {
            campaign_id: rows[0].campaign_id,
            user_id: rows[0].creator_id,
            invite_status: 'accepted',
            application_status: 'approved'
          });
        } else {
          await this.updateData("act_campaign_invites", `campaign_id = '${rows[0].campaign_id}' AND user_id = '${rows[0].creator_id}'`, {
            invite_status: 'accepted',
            application_status: 'approved'
          });
        }
      } catch (inviteError) {
        logger.error("Error creating campaign invite:", inviteError);
      }
    }

    // Notify the Influencer
    this.sendAppNotification(rows[0].creator_id, "JOB_APPROVED", rows[0].title, "", "", "", "CAMPAIGN", rows[0].brand_id);

    // Open Chat Channel
    try {
      const brandQuery: any[] = await this.callQuerySafe(
        `SELECT name FROM business_profile WHERE business_id = ? LIMIT 1`,
        [userId]
      );
      const brandName = brandQuery.length > 0 ? brandQuery[0].name : "Brand";

      const chatModel = new ChatModel();
      await chatModel.sendMessage({
        userId: userId,
        receiverId: rows[0].creator_id,
        username: brandName,
        text: `Great news! You've been approved for the job "${rows[0].title}". Let's get started!`,
        conversationId: "",
        messageType: "CHAT"
      });
    } catch (chatError) {
      logger.error("Error creating chat conversation:", chatError);
    }

    return this.makeResponse(200, "Creator approved", {
      creator_id: rows[0].creator_id,
      job_id: rows[0].job_id
    });
  }

  async markJobComplete(data: any) {
    const { userId, interest_id } = data;
    if (!interest_id) return this.makeResponse(400, "interest_id is required");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.creator_id, j.brand_id, j.title, j.job_id, j.campaign_id, j.comp_amount 
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");
    
    // Ensure the job was actually accepted or work_done before completing
    if (rows[0].status !== "accepted" && rows[0].status !== "work_done") {
      return this.makeResponse(400, "Creator must accept the job before it can be marked completed");
    }

    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      status: "completed",
    });

    // Notify creator that the brand has marked the campaign as complete
    // Pass job title as 'reason' and amount as 'amount' parameters
    // Note: amount will be converted to USD in the payment function, so we pass the KES amount here
    const paymentAmount = rows[0].comp_amount ? `${rows[0].comp_amount} KES` : 'unknown';
    this.sendAppNotification(rows[0].creator_id, "JOB_COMPLETED", "", paymentAmount, "", rows[0].title, "CAMPAIGN", rows[0].brand_id);

    // Trigger payment - either from campaign escrow or directly from brand wallet
    if (rows[0].comp_amount > 0) {
      try {
        const CampaignModel = require('./campaigns.model').default;
        const campaignModel = new CampaignModel();

        if (rows[0].campaign_id) {
          await campaignModel.payInfluencer({
            campaign_id: rows[0].campaign_id,
            userId: rows[0].creator_id,
            amount: rows[0].comp_amount
          });
          logger.info(`Payment triggered for interest ${interest_id}: ${rows[0].comp_amount} to ${rows[0].creator_id} (via campaign)`);
        } else {
          const paymentResult = await campaignModel.payInfluencerDirect({
            brandId: rows[0].brand_id,
            userId: rows[0].creator_id,
            amount: rows[0].comp_amount,
            jobTitle: rows[0].title,
            interestId: interest_id
          });
          if (paymentResult.status !== 200) {
            logger.error(`Direct payment failed for interest ${interest_id}: ${paymentResult.message}`);
            return this.makeResponse(paymentResult.status, paymentResult.message);
          }
          logger.info(`Direct payment triggered for interest ${interest_id}: ${rows[0].comp_amount} to ${rows[0].creator_id} (direct)`);
        }
      } catch (paymentError) {
        logger.error("Error processing payment:", paymentError);
        return this.makeResponse(500, "Job marked complete but payment failed. Use 'Pay Now' to retry.");
      }
    }

    return this.makeResponse(200, "Job marked as completed - Payment processed");
  }

  // ─── Brand: Approve Work Done (with payment) ───────────────────────────────
  async approveWorkDone(data: any) {
    const { userId, interest_id } = data;
    if (!interest_id) return this.makeResponse(400, "interest_id is required");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.creator_id, j.brand_id, j.title, j.job_id, j.campaign_id, j.comp_amount 
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");
    
    // Can only approve work done if status is work_done
    if (rows[0].status !== "work_done") {
      return this.makeResponse(400, "Can only approve work that is marked as done");
    }

    // Update status to completed
    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      status: "completed",
    });

    // Notify creator that the brand has approved the work
    // Pass job title as 'reason' and amount as 'amount' parameters
    const paymentAmount = rows[0].comp_amount ? `${rows[0].comp_amount} KES` : 'unknown';
    this.sendAppNotification(rows[0].creator_id, "JOB_COMPLETED", "", paymentAmount, "", rows[0].title, "CAMPAIGN", rows[0].brand_id);

    // Trigger payment - either from campaign escrow or directly from brand wallet
    if (rows[0].comp_amount > 0) {
      try {
        const CampaignModel = require('./campaigns.model').default;
        const campaignModel = new CampaignModel();
        
        if (rows[0].campaign_id) {
          await campaignModel.payInfluencer({
            campaign_id: rows[0].campaign_id,
            userId: rows[0].creator_id,
            amount: rows[0].comp_amount
          });
          logger.info(`Payment triggered for interest ${interest_id}: ${rows[0].comp_amount} to ${rows[0].creator_id} (via campaign)`);
        } else {
          const paymentResult = await campaignModel.payInfluencerDirect({
            brandId: rows[0].brand_id,
            userId: rows[0].creator_id,
            amount: rows[0].comp_amount,
            jobTitle: rows[0].title,
            interestId: interest_id
          });
          if (paymentResult.status !== 200) {
            logger.error(`Direct payment failed for interest ${interest_id}: ${paymentResult.message}`);
            return this.makeResponse(paymentResult.status, paymentResult.message);
          }
          logger.info(`Direct payment triggered for interest ${interest_id}: ${rows[0].comp_amount} to ${rows[0].creator_id} (direct)`);
        }
      } catch (paymentError) {
        logger.error("Error processing payment:", paymentError);
        return this.makeResponse(500, "Work approved but payment failed. Use 'Pay Now' to retry.");
      }
    }

    return this.makeResponse(200, "Work approved! Payment processed" + (rows[0].campaign_id ? "" : ". Job marked as completed."));
  }

  // ─── Brand: Request Revision ────────────────────────────────────────────────
  async requestRevision(data: any) {
    const { userId, interest_id, note } = data;
    if (!interest_id) return this.makeResponse(400, "interest_id is required");
    if (!note) return this.makeResponse(400, "note is required for revision request");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.creator_id, j.brand_id, j.title, j.job_id
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");
    
    // Can only request revision if status is work_done or already rev
    if (rows[0].status !== "work_done" && rows[0].status !== "rev") {
      return this.makeResponse(400, "Can only request revision for work that is marked as done");
    }

    // Update status to rev to clearly indicate brand wants revisions
    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      status: "rev",
      note: note, // Store the revision note
    });

    // Notify creator about the revision request
    this.sendAppNotification(rows[0].creator_id, "JOB_REVISION_REQUESTED", `${rows[0].title} - Brand requested revisions. Your work status is now 'Needs Revision'. Please check the notes for details.`, "", "", "", "CAMPAIGN", rows[0].brand_id);

    // Send a chat message to the creator
    try {
      const brandQuery: any[] = await this.callQuerySafe(
        `SELECT name FROM business_profile WHERE business_id = ? LIMIT 1`,
        [userId]
      );
      const brandName = brandQuery.length > 0 ? brandQuery[0].name : "Brand";

      const chatModel = new ChatModel();
      await chatModel.sendMessage({
        userId: userId,
        receiverId: rows[0].creator_id,
        username: brandName,
        text: `Revision requested for "${rows[0].title}": ${note}`,
        conversationId: "",
        messageType: "CHAT"
      });
    } catch (chatError) {
      logger.error("Error sending chat message:", chatError);
    }

    return this.makeResponse(200, "Revision requested. Creator has been notified.");
  }

  // ─── Brand: Trigger Payment for Completed Jobs (manual retry) ──────────────
  async triggerPayment(data: any) {
    const { userId, interest_id } = data;
    if (!interest_id) return this.makeResponse(400, "interest_id is required");

    // Get the job interest with job details
    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.creator_id, j.brand_id, j.title, j.job_id, j.campaign_id, j.comp_amount, j.comp_currency 
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");
    
    // Must be completed status
    if (rows[0].status !== "completed") {
      return this.makeResponse(400, "Job must be completed before triggering payment");
    }
    
    if (!rows[0].comp_amount || rows[0].comp_amount <= 0) {
      return this.makeResponse(400, "No compensation amount set for this job");
    }

    // Check if payment was already made
    if (rows[0].campaign_id) {
      const existingPayment: any[] = await this.callQuerySafe(
        `SELECT * FROM campaign_payments_users
         WHERE campaign_id = ? AND user_id = ? AND trans_status = 'SUCCESS'
         LIMIT 1`,
        [rows[0].campaign_id, rows[0].creator_id]
      );
      if (existingPayment.length > 0) {
        return this.makeResponse(400, "Payment has already been processed for this job");
      }
    } else {
      // Standalone job: check wl_transactions by interest ref_id
      const existingPayment: any[] = await this.callQuerySafe(
        `SELECT * FROM wl_transactions
         WHERE ref_id = ? AND trans_type = 'CR' AND system_status = 'SUCCESS' LIMIT 1`,
        [interest_id]
      );
      if (existingPayment.length > 0) {
        return this.makeResponse(400, "Payment has already been processed for this job");
      }
    }

    // Trigger the payment
    try {
      const CampaignModel = require('./campaigns.model').default;
      const campaignModel = new CampaignModel();

      if (rows[0].campaign_id) {
        // Campaign-linked job: use campaign escrow payment
        await campaignModel.payInfluencer({
          campaign_id: rows[0].campaign_id,
          userId: rows[0].creator_id,
          amount: rows[0].comp_amount,
          displayCurrency: rows[0].comp_currency || 'KES'
        });
      } else {
        // Standalone job: direct brand-to-influencer wallet payment
        const paymentResult = await campaignModel.payInfluencerDirect({
          brandId: rows[0].brand_id,
          userId: rows[0].creator_id,
          amount: rows[0].comp_amount,
          jobTitle: rows[0].title,
          interestId: interest_id,
          displayCurrency: rows[0].comp_currency || 'KES'
        });
        if (paymentResult.status !== 200) {
          return this.makeResponse(paymentResult.status, paymentResult.message);
        }
      }

      logger.info(`Manual payment triggered for interest ${interest_id}: ${rows[0].comp_amount} to ${rows[0].creator_id}`);

      return this.makeResponse(200, "Payment processed successfully!", {
        amount: rows[0].comp_amount,
        currency: rows[0].comp_currency || 'KES',
        recipient: rows[0].creator_id
      });
    } catch (paymentError: any) {
      logger.error("Error processing manual payment:", paymentError);
      return this.makeResponse(500, "Error processing payment: " + (paymentError.message || paymentError));
    }
  }

  // ─── Creator: Mark Work as Done ───────────────────────────────────────────

  async markWorkDone(data: any) {
    const { userId, interest_id } = data;
    if (!interest_id) return this.makeResponse(400, "interest_id is required");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.creator_id, j.brand_id, j.title, j.job_id
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].creator_id !== userId) return this.makeResponse(403, "Not authorised - you can only mark your own work as done");
    
    // Can only mark work as done if currently accepted or rev (resubmission)
    if (rows[0].status !== "accepted" && rows[0].status !== "rev") {
      return this.makeResponse(400, "You can only mark work as done for accepted jobs or after revision");
    }

    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      status: "work_done",
    });

    // Notify the brand that the creator has marked their work as done
    // Pass job title as 'reason' parameter to fill {reason} placeholder in template
    this.sendAppNotification(rows[0].brand_id, "JOB_WORK_DONE", "", "", "", rows[0].title, "CAMPAIGN", rows[0].creator_id);

    // Send a chat message to the brand
    try {
      const creatorQuery: any[] = await this.callQuerySafe(
        `SELECT first_name, username FROM users_profile WHERE user_id = ? LIMIT 1`,
        [userId]
      );
      const creatorName = creatorQuery.length > 0 ? (creatorQuery[0].first_name || creatorQuery[0].username) : "Creator";

      const chatModel = new ChatModel();
      await chatModel.sendMessage({
        userId: userId,
        receiverId: rows[0].brand_id,
        username: creatorName,
        text: `I've completed the work for "${rows[0].title}". Please review and mark as complete to release payment.`,
        conversationId: "",
        messageType: "CHAT"
      });
    } catch (chatError) {
      logger.error("Error sending chat message:", chatError);
    }

    return this.makeResponse(200, "Work marked as done. Brand will review and complete the job.", {
      status: "work_done",
      job_id: rows[0].job_id
    });
  }

  // ─── Creator: Accept or Decline a Job ───────────────────────────────────────

  async respondToJob(data: any) {
    const { userId, interest_id, action, note } = data;
    
    if (!interest_id) return this.makeResponse(400, "interest_id is required");
    if (!action || !['accept', 'decline'].includes(action)) {
      return this.makeResponse(400, "Action must be 'accept' or 'decline'");
    }

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.creator_id, j.brand_id, j.title, j.job_id, j.campaign_id
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].creator_id !== userId) return this.makeResponse(403, "Not authorised - you can only respond to your own applications");
    
    // Can only accept/decline if currently shortlisted
    if (rows[0].status !== 'shortlisted') {
      return this.makeResponse(400, "You can only respond to shortlisted jobs");
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    
    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      status: newStatus,
      note: note || null,
    });

    // Bridge: Inject into Campaign Invites if accepted
    if (action === 'accept' && rows[0].campaign_id) {
      try {
        const existingInvite: any[] = await this.callQuerySafe(
          `SELECT * FROM act_campaign_invites WHERE campaign_id = ? AND user_id = ? LIMIT 1`,
          [rows[0].campaign_id, rows[0].creator_id]
        );
        if (existingInvite.length === 0) {
          await this.insertData("act_campaign_invites", {
            campaign_id: rows[0].campaign_id,
            user_id: rows[0].creator_id,
            invite_status: 'accepted',
            application_status: 'approved'
          });
        } else {
          await this.updateData("act_campaign_invites", `campaign_id = '${rows[0].campaign_id}' AND user_id = '${rows[0].creator_id}'`, {
            invite_status: 'accepted',
            application_status: 'approved'
          });
        }
      } catch (inviteError) {
        logger.error("Error creating campaign invite:", inviteError);
      }
    }

    // Notify brand about the response
        this.sendAppNotification(
          rows[0].brand_id,
          action === 'accept' ? "JOB_ACCEPTED" : "JOB_DECLINED",
          `${rows[0].title} - ${action === 'accept' ? 'Creator accepted' : 'Creator declined'}`,
          "", "", "", "CAMPAIGN", rows[0].creator_id
        );
    return this.makeResponse(200, action === 'accept' ? "Job accepted successfully" : "Job declined", {
      status: newStatus,
      job_id: rows[0].job_id
    });
  }

  // ─── Brand: Send Campaign Guidelines ───────────────────────────────────────

  async sendCampaignGuidelines(data: any) {
    const { userId, interest_id, guidelines } = data;
    
    if (!interest_id) return this.makeResponse(400, "interest_id is required");
    if (!guidelines) return this.makeResponse(400, "guidelines are required");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.creator_id, j.brand_id, j.title, j.job_id
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON j.job_id = ji.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].brand_id !== userId) return this.makeResponse(403, "Not authorised");

    // Update guidelines in the note field (or create a separate field if needed)
    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      note: guidelines,
    });

    // Send notification with guidelines via chat
    try {
      const brandQuery: any[] = await this.callQuerySafe(
        `SELECT name FROM business_profile WHERE business_id = ? LIMIT 1`,
        [userId]
      );
      const brandName = brandQuery.length > 0 ? brandQuery[0].name : "Brand";

      const chatModel = new ChatModel();
      await chatModel.sendMessage({
        userId: userId,
        receiverId: rows[0].creator_id,
        username: brandName,
        text: `📋 Campaign Guidelines for "${rows[0].title}":\n\n${guidelines}`,
        conversationId: "",
        messageType: "CHAT"
      });
    } catch (chatError) {
      logger.error("Error sending guidelines via chat:", chatError);
    }

    // Notify influencer about new guidelines
    this.sendAppNotification(rows[0].creator_id, "JOB_GUIDELINES", `New guidelines for ${rows[0].title}`, "", "", "", "CAMPAIGN", rows[0].brand_id);

    return this.makeResponse(200, "Campaign guidelines sent successfully");
  }

  // ─── Creator: Browse + Express interest ───────────────────────────────────

  async getJobs(data: any) {
    const { userId, niche } = data;
    const nicheFilter = niche ? `AND j.niche LIKE '%${niche}%'` : "";

    const rows: any[] = await this.callQuerySafe(
      `SELECT j.*,
              bp.name AS business_name, bp.logo,
              (SELECT status FROM jb_job_interests
               WHERE job_id = j.job_id AND creator_id = ? LIMIT 1) AS my_interest_status
       FROM jb_job_posts j
       LEFT JOIN business_profile bp ON bp.business_id = j.brand_id
       WHERE j.status = 'active' AND j.deadline >= CURDATE()
       ${nicheFilter}
       ORDER BY j.created_at DESC`,
      [userId ?? ""]
    );
    const formattedRows = rows.map(row => ({
      ...this.formatJobRow(row),
      my_interest_status: row.my_interest_status || 'none',
      business_name: row.business_name || 'Unknown Business',
      logo: row.logo || ''
    }));
    return this.makeResponse(200, "success", formattedRows);
  }

  async getJobById(data: any) {
    const { userId, job_id } = data;
    console.log('🔍 getJobById called with job_id:', job_id);
    if (!job_id) return this.makeResponse(400, "job_id is required");

    // Fetch job from database with business profile info
    const rows: any[] = await this.callQuerySafe(
      `SELECT j.*,
              bp.name AS business_name, bp.logo,
              (SELECT status FROM jb_job_interests
               WHERE job_id = j.job_id AND creator_id = ? LIMIT 1) AS my_interest_status,
              (SELECT COUNT(*) FROM jb_job_interests
               WHERE job_id = j.job_id) AS interest_count
       FROM jb_job_posts j
       LEFT JOIN business_profile bp ON bp.business_id = j.brand_id
       WHERE j.job_id = ?
       LIMIT 1`,
      [userId ?? "", job_id]
    );

    if (rows.length === 0) {
      return this.makeResponse(404, "Job not found");
    }

    const row = rows[0];
    if (row.status === "draft" && row.brand_id !== userId) {
      return this.makeResponse(404, "Job not found");
    }

    const job = {
      ...this.formatJobRow(row),
      my_interest_status: row.my_interest_status || 'none',
      business_name: row.business_name || 'Unknown Business',
      logo: row.logo || ''
    };

    const response = this.makeResponse(200, "success", job);
    console.log('✅ getJobById returning response:', JSON.stringify(response).substring(0, 200));
    return response;
  }

  async expressInterest(data: any) {
    const { userId, job_id, note } = data;
    console.log('[expressInterest model] userId:', userId, 'job_id:', job_id);
    
    if (!job_id) return this.makeResponse(400, "job_id is required");

    const job: any[] = await this.callQuerySafe(
      `SELECT job_id, status, brand_id, title, access_tier, comp_type, comp_amount FROM jb_job_posts WHERE job_id = ? LIMIT 1`,
      [job_id]
    );
    console.log('[expressInterest model] job:', job);
    
    if (job.length === 0) return this.makeResponse(404, "Job not found");
    if (job[0].status !== "active") return this.makeResponse(400, "Job is no longer active");
    
    // Prevent brand from expressing interest in their own job (they're the owner)
    if (job[0].brand_id === userId) {
      console.log('[expressInterest model] Brand tried to express interest in their own job');
      return this.makeResponse(400, "You cannot express interest in your own job");
    }

    const requiredTier = (job[0].access_tier || this.deriveJobAccessTier(job[0].comp_type, job[0].comp_amount)) as JobAccessTier;
    if (requiredTier !== "free") {
      const userTier = await getUserTier(userId);
      if (!tierAtLeast(userTier, requiredTier)) {
        return this.makeResponse(
          403,
          `This opportunity is available to Creator ${requiredTier === "pro" ? "Pro" : "Plus"} members.`,
          {
            requiresUpgrade: true,
            requiredTier,
            currentTier: userTier,
          }
        );
      }
    }

    const existing: any[] = await this.callQuerySafe(
      `SELECT interest_id FROM jb_job_interests WHERE job_id = ? AND creator_id = ? LIMIT 1`,
      [job_id, userId]
    );
    if (existing.length > 0) return this.makeResponse(400, "You have already expressed interest in this job");

    const interest_id = this.getRandomString();
    await this.insertData("jb_job_interests", {
      interest_id,
      job_id,
      creator_id: userId,
      note: note ?? null,
    });
    console.log('[expressInterest model] Interest saved with interest_id:', interest_id);
    
    // Notify brand about new interest/application
    try {
      await this.sendAppNotification(
        job[0].brand_id,  // recipient - the brand
        "NEW_APPLICATION",  // operation type
        "",  // name param (empty)
        "",  // amount param (empty)
        "",  // customeObj param (empty)
        job[0].title,  // reason param - job title for {reason} placeholder
        "CAMPAIGN",  // category
        userId  // sender is the influencer
      );
      console.log('[expressInterest model] Notification sent to brand:', job[0].brand_id);
    } catch (notifError) {
      console.error('[expressInterest model] Error sending notification:', notifError);
    }
    
    return this.makeResponse(200, "Interest expressed successfully", { interest_id });
  }

  async acceptJob(data: any) {
    const { userId, interest_id } = data;
    if (!interest_id) return this.makeResponse(400, "interest_id is required");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.creator_id, j.brand_id, j.title, j.campaign_id
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON ji.job_id = j.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].creator_id !== userId) return this.makeResponse(403, "Not authorised");
    if (rows[0].status !== "shortlisted") return this.makeResponse(400, "You can only accept shortlisted jobs");

    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      status: "accepted",
    });

    // Bridge: Inject into Campaign Invites
    if (rows[0].campaign_id) {
      try {
        const existingInvite: any[] = await this.callQuerySafe(
          `SELECT * FROM act_campaign_invites WHERE campaign_id = ? AND user_id = ? LIMIT 1`,
          [rows[0].campaign_id, rows[0].creator_id]
        );
        if (existingInvite.length === 0) {
          await this.insertData("act_campaign_invites", {
            campaign_id: rows[0].campaign_id,
            user_id: rows[0].creator_id,
            invite_status: 'accepted',
            application_status: 'approved'
          });
        } else {
          await this.updateData("act_campaign_invites", `campaign_id = '${rows[0].campaign_id}' AND user_id = '${rows[0].creator_id}'`, {
            invite_status: 'accepted',
            application_status: 'approved'
          });
        }
      } catch (inviteError) {
        logger.error("Error creating campaign invite:", inviteError);
      }
    }

    // Notify the brand
    this.sendAppNotification(rows[0].brand_id, "JOB_ACCEPTED", rows[0].title, "", "", "", "CAMPAIGN", rows[0].creator_id);

    // Send a chat message from the creator to the brand
    try {
      const creatorQuery: any[] = await this.callQuerySafe(
        `SELECT first_name, username FROM users_profile WHERE user_id = ? LIMIT 1`,
        [userId]
      );
      const creatorName = creatorQuery.length > 0 ? (creatorQuery[0].first_name || creatorQuery[0].username) : "Creator";

      const chatModel = new ChatModel();
      await chatModel.sendMessage({
        userId: userId,
        receiverId: rows[0].brand_id,
        username: creatorName,
        text: `I'm happy to accept the job "${rows[0].title}". Looking forward to working with you!`,
        conversationId: "",
        messageType: "CHAT"
      });
    } catch (chatError) {
      logger.error("Error creating chat conversation:", chatError);
    }

    return this.makeResponse(200, "Job accepted successfully");
  }

  async declineJob(data: any) {
    const { userId, interest_id } = data;
    if (!interest_id) return this.makeResponse(400, "interest_id is required");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.creator_id, j.brand_id, j.title 
       FROM jb_job_interests ji
       JOIN jb_job_posts j ON ji.job_id = j.job_id
       WHERE ji.interest_id = ? LIMIT 1`,
      [interest_id]
    );
    
    if (rows.length === 0) return this.makeResponse(404, "Interest record not found");
    if (rows[0].creator_id !== userId) return this.makeResponse(403, "Not authorised");
    if (rows[0].status !== "shortlisted") return this.makeResponse(400, "You can only decline shortlisted jobs");

    await this.updateData("jb_job_interests", `interest_id = '${interest_id}'`, {
      status: "rejected",
    });

    // Notify the brand
    this.sendAppNotification(rows[0].brand_id, "JOB_DECLINED", rows[0].title, "", "", "", "CAMPAIGN", rows[0].creator_id);

    // Send a polite chat message from the creator to the brand
    try {
      const creatorQuery: any[] = await this.callQuerySafe(
        `SELECT first_name, username FROM users_profile WHERE user_id = ? LIMIT 1`,
        [userId]
      );
      const creatorName = creatorQuery.length > 0 ? (creatorQuery[0].first_name || creatorQuery[0].username) : "Creator";

      const chatModel = new ChatModel();
      await chatModel.sendMessage({
        userId: userId,
        receiverId: rows[0].brand_id,
        username: creatorName,
        text: `Thank you for the opportunity, but I won't be able to take on the job "${rows[0].title}" at this time.`,
        conversationId: "",
        messageType: "CHAT"
      });
    } catch (chatError) {
      logger.error("Error creating chat conversation:", chatError);
    }

    return this.makeResponse(200, "Job declined successfully");
  }

  async getCreatorApplications(data: any) {
    const { userId } = data;
    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.note, ji.created_at,
              j.job_id, j.title, j.status AS job_status, j.description,
              j.comp_amount, j.comp_currency, j.comp_type, j.deadline,
              j.guidelines_attachment,
              bp.name AS business_name, bp.logo
       FROM jb_job_interests ji
       JOIN jb_job_posts j     ON j.job_id   = ji.job_id
       LEFT JOIN business_profile bp ON bp.business_id = j.brand_id
       WHERE ji.creator_id = ?
       ORDER BY ji.created_at DESC`,
      [userId]
    );
    const formattedRows = rows.map(row => ({
      ...row,
      comp_amount: Number(row.comp_amount || 0),
      business_name: row.business_name || 'Unknown Business',
      logo: row.logo || '',
      comp_currency: row.comp_currency || 'KES',
      comp_type: row.comp_type || 'cash',
      note: row.note || '',
      guidelines_attachment: row.guidelines_attachment || null,
      description: row.description || ''
    }));
    return this.makeResponse(200, "success", formattedRows);
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async adminGetAllJobs(data: any) {
    const { page = 1, limit = 20 } = data;
    const offset = (Number(page) - 1) * Number(limit);

    const rows: any[] = await this.callQuerySafe(
      `SELECT j.*,
              bp.name AS business_name, bp.logo,
              (SELECT COUNT(*) FROM jb_job_interests WHERE job_id = j.job_id) AS interest_count
       FROM jb_job_posts j
       LEFT JOIN business_profile bp ON bp.business_id = j.brand_id
       ORDER BY j.created_at DESC
       LIMIT ? OFFSET ?`,
      [Number(limit), offset]
    );

    const formattedRows = rows.map(row => ({
      ...row,
      interest_count: Number(row.interest_count || 0),
      comp_amount: Number(row.comp_amount || 0),
      min_followers: Number(row.min_followers || 0),
      niche: row.niche || '',
      business_name: row.business_name || 'Unknown Business',
      logo: row.logo || '',
      comp_currency: row.comp_currency || 'KES',
      comp_type: row.comp_type || 'cash'
    }));

    const total: any[] = await this.callQuerySafe(
      `SELECT COUNT(*) AS total FROM jb_job_posts`,
      []
    );
    return this.makeResponse(200, "success", { jobs: formattedRows, total: Number(total[0]?.total || 0) });
  }

  async adminGetJobInterests(data: any) {
    const { job_id } = data;
    if (!job_id) return this.makeResponse(400, "job_id is required");

    const rows: any[] = await this.callQuerySafe(
      `SELECT ji.interest_id, ji.status, ji.note, ji.created_at,
              ji.creator_id,
              up.first_name, up.last_name, up.profile_pic, up.influencer_rating
       FROM jb_job_interests ji
       LEFT JOIN users_profile up ON up.user_id = ji.creator_id
       WHERE ji.job_id = ?
       ORDER BY ji.created_at DESC`,
      [job_id]
    );
    const formattedRows = rows.map(row => ({
      ...row,
      note: row.note || '',
      profile_pic: row.profile_pic || '',
      influencer_rating: Number(row.influencer_rating || 0),
      first_name: row.first_name || 'Unknown',
      last_name: row.last_name || ''
    }));
    return this.makeResponse(200, "success", formattedRows);
  }
}
