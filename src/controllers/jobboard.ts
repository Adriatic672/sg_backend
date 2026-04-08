import express, { Request, Response } from 'express';
import JobBoard from '../models/jobboard.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import { sendNotification } from '../helpers/FCM';
import { JWTMiddlewareAdmin } from '../helpers/jwt.middleware.admin';

const router = express.Router();
const jobBoard = new JobBoard();

const applyJWTConditionally = (req: Request, res: Response, next: any) =>
  JWTMiddleware.verifyToken(req, res, next);

const applyBrandJWTConditionally = (req: Request, res: Response, next: any) =>
  JWTMiddleware.verifyBrandToken(req, res, next);

const applyAdminJWT = (req: Request, res: Response, next: any) =>
  JWTMiddlewareAdmin.verifyToken(req, res, next);

// ─── Brand routes ─────────────────────────────────────────────────────────────
router.post('/create',    applyBrandJWTConditionally, createJob);
router.post('/update',    applyBrandJWTConditionally, updateJob);
router.post('/close',     applyBrandJWTConditionally, closeJob);
router.post('/delete',    applyBrandJWTConditionally, deleteJob);
router.get('/brandJobs',  applyBrandJWTConditionally, getBrandJobs);
router.get('/brandCampaigns', applyBrandJWTConditionally, getBrandCampaigns);
router.post('/shortlist', applyBrandJWTConditionally, shortlistCreator);
router.post('/approve',   applyBrandJWTConditionally, approveApplicant);
router.post('/markComplete', applyBrandJWTConditionally, markJobComplete);
router.post('/approveWorkDone', applyBrandJWTConditionally, approveWorkDone);
router.post('/requestRevision', applyBrandJWTConditionally, requestRevision);
router.post('/triggerPayment', applyBrandJWTConditionally, triggerPayment);
router.post('/sendGuidelines', applyBrandJWTConditionally, sendCampaignGuidelines);
router.get('/:job_id/applicants', applyBrandJWTConditionally, getJobApplicants);

// ─── Creator routes ───────────────────────────────────────────────────────────
router.get('/list',           applyJWTConditionally, listJobs);
router.post('/accept',        applyJWTConditionally, acceptJob);
router.post('/decline',       applyJWTConditionally, declineJob);
router.post('/markWorkDone',  applyJWTConditionally, markWorkDone);
router.get('/myApplications', applyJWTConditionally, getCreatorApplications);
router.post('/expressInterest', applyJWTConditionally, expressInterest);

// ─── Admin routes ─────────────────────────────────────────────────────────────
router.get('/admin/all',                  applyAdminJWT, adminGetAllJobs);
router.get('/admin/:job_id/interests',    applyAdminJWT, adminGetJobInterests);

// ─── Test routes ─────────────────────────────────────────────────────────────
router.post('/createTestData', createTestData);
router.post('/createTestInterest', createTestInterest);

// ─── Shared (brand or creator) ────────────────────────────────────────────────
router.get('/:job_id', applyJWTConditionally, getJobById);

// ─── Handlers ────────────────────────────────────────────────────────────────

async function createJob(req: Request, res: Response) {
  try {
    const result = await jobBoard.createJob(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error creating job', error });
  }
}

async function updateJob(req: Request, res: Response) {
  try {
    const result = await jobBoard.updateJob(req.body);
    
    // If job was updated successfully and there are accepted influencers, send notifications
    if (result.status === 200 && result.data?.acceptedInfluencers?.length > 0) {
      const { job_id, title } = req.body;
      const influencers = result.data.acceptedInfluencers;
      
      // Send FCM notification to each accepted influencer
      for (const influencer of influencers) {
        if (influencer.fcm_token) {
          const notificationData = {
            title: 'Job Updated',
            body: `The job "${title || job_id}" has been updated by the brand. Please check for any changes.`,
            type: 'job_update',
            job_id: job_id
          };
          
          // Send notification asynchronously (don't wait for it)
          sendNotification(influencer.fcm_token, notificationData, false)
            .then(() => {
              console.log(`[JobUpdate] Notification sent to creator ${influencer.creator_id}`);
            })
            .catch((error) => {
              console.error(`[JobUpdate] Failed to notify creator ${influencer.creator_id}:`, error);
            });
        }
      }
      
      // Add notification sent info to response
      result.data.notificationsSent = influencers.length;
    }
    
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error updating job', error });
  }
}

async function closeJob(req: Request, res: Response) {
  try {
    const result = await jobBoard.closeJob(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error closing job', error });
  }
}

// Delete job post - permanently removes job and all applications
async function deleteJob(req: Request, res: Response) {
  try {
    const result = await jobBoard.deleteJob(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deleting job', error });
  }
}

async function getBrandJobs(req: Request, res: Response) {
  try {
    // Ensure userId comes from req.body (set by JWT middleware) not from query params
    const userId = req.body.userId;
    
    console.log('[getBrandJobs] userId:', userId);
    
    const result = await jobBoard.getBrandJobs({ userId: userId });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching brand jobs', error });
  }
}

async function getBrandCampaigns(req: Request, res: Response) {
  try {
    const userId = req.body.userId;
    const result = await jobBoard.getBrandCampaigns({ userId: userId });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching brand campaigns', error });
  }
}

async function shortlistCreator(req: Request, res: Response) {
  try {
    const result = await jobBoard.shortlistCreator(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error shortlisting creator', error });
  }
}

async function approveApplicant(req: Request, res: Response) {
  try {
    const result = await jobBoard.approveApplicant(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error approving applicant', error });
  }
}

async function markJobComplete(req: Request, res: Response) {
  try {
    const result = await jobBoard.markJobComplete(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error marking job as complete', error });
  }
}

// Brand approves work done and triggers payment
async function approveWorkDone(req: Request, res: Response) {
  try {
    const result = await jobBoard.approveWorkDone(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error approving work done', error });
  }
}

// Brand requests revision from influencer
async function requestRevision(req: Request, res: Response) {
  try {
    const result = await jobBoard.requestRevision(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error requesting revision', error });
  }
}

// Brand triggers payment for completed jobs (manual retry)
async function triggerPayment(req: Request, res: Response) {
  try {
    const result = await jobBoard.triggerPayment(req.body);
    res.status(result.status || 200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error triggering payment', error });
  }
}

async function getJobApplicants(req: Request, res: Response) {
  try {
    // Ensure userId comes from req.body (set by JWT middleware) not from query params
    const userId = req.body.userId;
    const jobId = req.params.job_id;
    
    console.log('[getJobApplicants] Request received');
    console.log('[getJobApplicants] userId from token:', userId);
    console.log('[getJobApplicants] jobId from params:', jobId);
    console.log('[getJobApplicants] req.params:', req.params);
    
    if (!jobId) {
      console.log('[getJobApplicants] ERROR: jobId is missing');
      return res.status(400).json({ message: 'job_id is required' });
    }
    
    if (!userId) {
      console.log('[getJobApplicants] ERROR: userId is missing');
      return res.status(401).json({ message: 'Unauthorized: userId not found' });
    }
    
    const result = await jobBoard.getJobApplicants({
      userId: userId,
      job_id: jobId,
    });
    
    console.log('[getJobApplicants] Result:', JSON.stringify(result).substring(0, 500));
    res.status(200).json(result);
  } catch (error) {
    console.log('[getJobApplicants] Error:', error);
    res.status(500).json({ message: 'Error fetching applicants', error });
  }
}

async function listJobs(req: Request, res: Response) {
  try {
    const result = await jobBoard.getJobs({ ...req.body, ...req.query });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error listing jobs', error });
  }
}

// Create test data for payment testing (job + interest)
async function createTestData(req: Request, res: Response) {
  try {
    const { brandId, influencerId, campaignId, amount = 1000 } = req.body;
    
    // Create test job
    const jobId = 'test_job_' + Date.now();
    const interestId = 'test_interest_' + Date.now();
    
    // Insert job post
    await jobBoard.insertData('jb_job_posts', {
      job_id: jobId,
      brand_id: brandId,
      title: 'Test Payment Job',
      description: 'Test job for payment flow',
      comp_amount: amount,
      comp_currency: 'KES',
      comp_type: 'cash',
      status: 'active',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
      campaign_id: campaignId || null,
      guidelines_text: 'Test guidelines'
    });
    
    // Insert job interest
    await jobBoard.insertData('jb_job_interests', {
      interest_id: interestId,
      job_id: jobId,
      creator_id: influencerId,
      status: 'work_done',
      note: 'Test work submission',
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
    
    res.status(200).json({
      status: 200,
      message: 'Test data created',
      data: { jobId, interestId, brandId, influencerId, amount }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating test data', error });
  }
}

// Create test interest for existing job
async function createTestInterest(req: Request, res: Response) {
  try {
    const { jobId, influencerId } = req.body;
    
    if (!jobId || !influencerId) {
      res.status(400).json({ message: 'jobId and influencerId required' });
      return;
    }
    
    const interestId = 'test_interest_' + Date.now();
    
    await jobBoard.insertData('jb_job_interests', {
      interest_id: interestId,
      job_id: jobId,
      creator_id: influencerId,
      status: 'work_done',
      note: 'Test work submission',
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
    
    res.status(200).json({
      status: 200,
      message: 'Test interest created with work_done status',
      data: { interestId, jobId, influencerId }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating test interest', error });
  }
}

async function getJobById(req: Request, res: Response) {
  try {
    const result = await jobBoard.getJobById({
      ...req.body,
      ...req.query,
      job_id: req.params.job_id,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching job', error });
  }
}

async function expressInterest(req: Request, res: Response) {
  try {
    const result = await jobBoard.expressInterest(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error expressing interest', error });
  }
}

async function acceptJob(req: Request, res: Response) {
  try {
    const result = await jobBoard.acceptJob(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error accepting job', error });
  }
}

async function declineJob(req: Request, res: Response) {
  try {
    const result = await jobBoard.declineJob(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error declining job', error });
  }
}

async function markWorkDone(req: Request, res: Response) {
  try {
    const result = await jobBoard.markWorkDone(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error marking work as done', error });
  }
}

async function sendCampaignGuidelines(req: Request, res: Response) {
  try {
    const result = await jobBoard.sendCampaignGuidelines(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error sending guidelines', error });
  }
}

async function getCreatorApplications(req: Request, res: Response) {
  try {
    const result = await jobBoard.getCreatorApplications({ ...req.body, ...req.query });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching applications', error });
  }
}

async function adminGetAllJobs(req: Request, res: Response) {
  try {
    const result = await jobBoard.adminGetAllJobs({ ...req.body, ...req.query });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching jobs', error });
  }
}

async function adminGetJobInterests(req: Request, res: Response) {
  try {
    const result = await jobBoard.adminGetJobInterests({
      ...req.body,
      ...req.query,
      job_id: req.params.job_id,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching interests', error });
  }
}

export default router;
