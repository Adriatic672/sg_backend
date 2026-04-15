import express, { Request, Response } from 'express';
import Campaigns from '../models/campaigns.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import expressFileUpload from 'express-fileupload';

import { JWTMiddlewareAdmin } from '../helpers/jwt.middleware.admin';

const router = express.Router();
const campaign = new Campaigns();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

const applyBrandJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyBrandToken(req, res, next);
};


// Brand actions
router.get('/brandCampaigns', applyBrandJWTConditionally, getMyCreatedCampaigns);
router.get('/sentInvites', applyBrandJWTConditionally, getSentInvitesForUser);
router.get('/sentInvites/:campaign_id', applyBrandJWTConditionally, getSentInvitesForCampaign);
router.post('/sendCampaignWithInvites', applyBrandJWTConditionally, sendCampaignWithInvites);

router.patch('/edit', applyBrandJWTConditionally, updateCampaign);
router.post('/deleteCampaign', applyBrandJWTConditionally, deleteCampaign);
router.post('/inviteUsers', applyBrandJWTConditionally, inviteUsers);
router.post('/agentInviteUsers', applyBrandJWTConditionally, agentInviteUsers);
router.post('/reject-submission', applyBrandJWTConditionally, rejectSubmission);
router.post('/request-revision', applyBrandJWTConditionally, requestRevision);



router.get('/getActionedInfluencers/:id', applyJWTConditionally, getActionedInfluencers);
router.post('/closeCampaignManually', applyJWTConditionally, closeCampaignManually);
router.post('/payInfluencers', applyJWTConditionally, payInfluencers);
router.post('/payout', applyJWTConditionally, payout);



// Influencer actions
router.get('/explore', applyJWTConditionally, exploreCampaigns);
router.get('/userCampaigns', applyJWTConditionally, getMyCampaigns);
router.get('/campaign/:id', applyJWTConditionally, getCampaignById);
router.get('/getCampaignTasks/:id', applyJWTConditionally, getCampaignTasks);
router.post('/eligibleUsers', applyJWTConditionally, getEligibleUsers);
router.post('/actionInvite', applyJWTConditionally, handleCampaignInvite);
router.get('/receivedInvites', applyJWTConditionally, receivedInvites);
router.post('/start', applyJWTConditionally, startCampaign);
router.post('/complete', applyJWTConditionally, activityComplete);

router.get('/getCampaignStats/:id', applyBrandJWTConditionally, getCampaignStats);
router.get('/getAcceptedUsers/:id', applyBrandJWTConditionally, getAcceptedUsers);
router.get('/getBrandStats', applyBrandJWTConditionally, businessStats);

router.get('/getInfluencerStats', applyJWTConditionally, influencerStats);
router.get('/objectives', applyJWTConditionally, getObjectives);
router.get('/getDraftCampaign/:id', applyJWTConditionally, getDraftCampaign);

// V2
router.get('/approved-influencers/:id', applyBrandJWTConditionally, getApprovedInfluencers);
router.post('/create-draft', applyBrandJWTConditionally, createDraftCampaign);
router.post('/publish', applyBrandJWTConditionally, activateCampaign);
router.get('/get-applications/:id', applyBrandJWTConditionally, getApplicationsForCampaign);
router.post('/action-applications', applyBrandJWTConditionally, actionApplications);
router.get('/accepted', applyBrandJWTConditionally, getAcceptedUsers);
router.get('/influencer-applications', applyJWTConditionally, getInfluencerApplications);
router.post('/submit-application', applyJWTConditionally, submitApplication);
router.post('/activate', applyBrandJWTConditionally, activateCampaign);
router.post('/prefund', applyBrandJWTConditionally, prefundCampaign);
router.post('/batch-process-applications', applyBrandJWTConditionally, batchProcessApplications);
router.get('/proposed-influencers/:id', applyJWTConditionally, proposedInfluencers);
router.post('/filterInfluencers', applyJWTConditionally, filterInfluencers);
router.get('/campaignSettings', applyJWTConditionally, campaignSettings);

router.post('/addReview', applyJWTConditionally, addReview);

async function addReview(req: Request, res: Response) {
  try {
    const result = await campaign.addReview(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding review', error });
  }
}
async function rejectSubmission(req: Request, res: Response) {
  try {
    const { campaign_id, user_id, task_id, reason } = req.body;
    if (!campaign_id || !user_id || !task_id) {
      return res.status(400).json({ message: "campaign_id, user_id, and task_id are required" });
    }
    const result = await campaign.rejectSubmission(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting submission', error });
  }
}

async function requestRevision(req: Request, res: Response) {
  try {
    const { campaign_id, user_id, reason } = req.body;
    if (!campaign_id || !user_id || !reason) {
      return res.status(400).json({ message: "campaign_id, user_id, and reason are required" });
    }
    const result = await campaign.requestRevision(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error requesting revision', error });
  }
}

async function campaignSettings(req: Request, res: Response) {
  try {
    const result = await campaign.campaignSettings();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaign settings', error });
  }
}

async function getApprovedInfluencers(req: Request, res: Response) {

  try {
    const result = await campaign.getApprovedInfluencers(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching approved influencers', error });
  }
}

async function filterInfluencers(req: Request, res: Response) {
  try {
    const result = await campaign.getEligibleUsers(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error filtering influencers', error });
  }
}

async function proposedInfluencers(req: Request, res: Response) {

  try {
    const result = await campaign.proposedInfluencers(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error filtering influencers', error });
  }
}

async function closeCampaignManually(req: Request, res: Response) {
  try {
    const result = await campaign.closeCampaignManually(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error closing campaign manually', error });
  }
}

async function payout(req: Request, res: Response) {
  try {
    const result = await campaign.rejectPayout(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error processing payout', error });
  }
}

async function payInfluencers(req: Request, res: Response) {
  try {
    const result = await campaign.payInfluencers(req.body.campaignId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error paying influencers', error });
  }
}
async function getActionedInfluencers(req: Request, res: Response) {
  try {
    const result = await campaign.getActionedInfluencers(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching actioned influencers', error });
  }
}

 

async function getInfluencerApplications(req: Request, res: Response) {
  try {
    const result = await campaign.getInfluencerApplications(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getApplications:", error);
    res.status(500).json({ message: 'Error retrieving applications', error });
  }
}
async function getApplicationsForCampaign(req: Request, res: Response) {
  try {
    const result = await campaign.getApplicationsForCampaign(req.body.userId, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getApplications:", error);
    res.status(500).json({ message: 'Error retrieving applications', error });
  }
}
async function actionApplications(req: Request, res: Response) {
  try {
    const result = await campaign.actionApplications(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in actionApplications:", error);
    res.status(500).json({ message: 'Error actioning applications', error });
  }
}

async function submitApplication(req: Request, res: Response) {
  try {
    const result = await campaign.submitApplication(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in submitApplication:", error);
    res.status(500).json({ message: 'Error submitting application', error });
  }
}


async function activateCampaign(req: Request, res: Response) {

  try {
    const result = await campaign.activateCampaign(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in activateCampaign:", error);
    res.status(500).json({ message: 'Error activating campaign', error });
  }
}

async function batchProcessApplications(req: Request, res: Response) {
  try {
    const result = await campaign.batchProcessApplications(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in batchProcessApplications:", error);
    res.status(500).json({ message: 'Error processing applications', error });
  }
}

async function createDraftCampaign(req: Request, res: Response) {
  try {
    const result = await campaign.createCampaign(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in createDraftCampaign:", error);
    res.status(500).json({ message: 'Error creating draft campaign', error });
  }
}

async function getDraftCampaign(req: Request, res: Response) {
  try {
    const result = await campaign.getDraftCampaign(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getDraftCampaign:", error);
    res.status(500).json({ message: 'Error retrieving draft campaign', error });
  }
}

async function getObjectives(req: Request, res: Response) {
  try {
    const result = await campaign.getObjectives();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching objectives', error });
  }
}

async function influencerStats(req: Request, res: Response) {
  try {
    const result = await campaign.influencerStats(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in influencerStats:", error);
    res.status(500).json({ message: 'Error retrieving influencer stats', error });
  }
}




async function businessStats(req: Request, res: Response) {
  try {
    const result = await campaign.businessStats(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}

async function getAcceptedUsers(req: Request, res: Response) {
  try {
    const result = await campaign.getAcceptedUsers(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}

async function getCampaignStats(req: Request, res: Response) {
  try {
    const result = await campaign.getCampaignStats(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function activityComplete(req: Request, res: Response) {
  try {
    const result = await campaign.activityComplete(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}

async function startCampaign(req: Request, res: Response) {
  try {
    const result = await campaign.startCampaign(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}

 




async function getCampaignTasks(req: Request, res: Response) {
  try {
    const result = await campaign.getCampaignTasks(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getCampaignById:", error);
    res.status(500).json({ message: 'Error retrieving campaign', error });
  }
}

async function getCampaignById(req: Request, res: Response) {
  try {
    const result = await campaign.getCampaignDetails(req.body, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getCampaignById:", error);
    res.status(500).json({ message: 'Error retrieving campaign', error });
  }
}

async function updateCampaign(req: Request, res: Response) {
  try {
    const result = await campaign.updateCampaign(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in updateCampaign:", error);
    res.status(500).json({ message: 'Error updating campaign', error });
  }
}

async function deleteCampaign(req: Request, res: Response) {
  try {
    const result = await campaign.deleteCampaign(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in deleteCampaign:", error);
    res.status(500).json({ message: 'Error deleting campaign', error });
  }
}

async function inviteUsers(req: Request, res: Response) {
  try {
    const result = await campaign.inviteUsers(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in inviteUsers:", error);
    res.status(500).json({ message: 'Error inviting users', error });
  }
}

async function agentInviteUsers(req: Request, res: Response) {
  try {
    const result = await campaign.agentInviteUsers(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in agentInviteUsers:", error);
    res.status(500).json({ message: 'Error inviting users', error });
  }
}
async function sendCampaignWithInvites(req: Request, res: Response) {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: 'A campaign requires at least one image', status: 500 });
    }

    const files = req.files as { [fieldname: string]: expressFileUpload.UploadedFile | expressFileUpload.UploadedFile[] };
    const uploadedFiles = Array.isArray(files.content) ? files.content : [files.content];
 //   const result = await campaign.sendCampaignWithInvites(req.body);
    res.status(200).json({message: "success"});

  } catch (error) {
    console.error("Error in createCampaign:", error);
    res.status(500).json({ message: 'Error creating campaign', error });
  }
}



async function getSentInvitesForCampaign(req: Request, res: Response) {
  try {
    const result = await campaign.getSentInvitesForCampaign(req.params.campaign_id);
    res.status(200).json(result);
  } catch (error) {
     res.status(500).json({ message: 'Error retrieving pending campaigns', error });
  }
}

async function getSentInvitesForUser(req: Request, res: Response) {
  try {
    const result = await campaign.getSentInvitesForUser(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving pending campaigns', error });
  }
}


async function receivedInvites(req: Request, res: Response) {
  try {
    const result = await campaign.receivedInvites(req.body.userId, 'pending');
    res.status(200).json(result);
  } catch (error) {
     res.status(500).json({ message: 'Error retrieving pending campaigns', error });
  }
}

async function exploreCampaigns(req: Request, res: Response) {
  try {
    const result = await campaign.exploreCampaigns(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in exploreCampaigns:", error);
    res.status(500).json({ message: 'Error retrieving campaigns', error });
  }
}

async function getMyCampaigns(req: Request, res: Response) {
  try {
    const result = await campaign.getMyCampaigns(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getMyCampaigns:", error);
    res.status(500).json({ message: 'Error retrieving campaigns', error });
  }
}
async function getMyCreatedCampaigns(req: Request, res: Response) {
  try {
    const result = await campaign.getMyCreatedCampaigns(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getMyCampaigns:", error);
    res.status(500).json({ message: 'Error retrieving campaigns', error });
  }
}




async function getEligibleUsers(req: Request, res: Response) {
  try {
    const result = await campaign.getEligibleUsers(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getEligibleUsers:", error);
    res.status(500).json({ message: 'Error retrieving eligible users', error });
  }
}

async function handleCampaignInvite(req: Request, res: Response) {
  try {
    const result = await campaign.handleCampaignInvite(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in handleCampaignInvite:", error);
    res.status(500).json({ message: 'Error handling campaign invite', error });
  }
}

async function prefundCampaign(req: Request, res: Response) {
  try {
    const result = await campaign.prefundCampaign(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error prefunding campaign', error });
  }
}

export default router;
