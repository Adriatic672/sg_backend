import express, { Request, Response } from 'express';
import AgentServices from '../models/agents.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';

const router = express.Router();
const agentServices = new AgentServices();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

router.post('/login', login);
router.post('/create-draft', applyJWTConditionally, createDraftCampaign);
router.post('/change-business', applyJWTConditionally, changeBusiness);
router.get('/businesses', applyJWTConditionally, getAgentBusinesses);
router.get('/campaigns', applyJWTConditionally, getAgentCampaigns);
router.get('/profile', applyJWTConditionally, getProfile);
router.put('/profile', applyJWTConditionally, updateProfile);
router.post('/reset-password-request', resetPasswordRequest);
router.post('/reset-password', resetPassword);
router.post('/change-password', applyJWTConditionally, changePassword);
router.post('/create-business', applyJWTConditionally, createBusiness);


async function createDraftCampaign(req: Request, res: Response) {
  try {
    const result = await agentServices.createCampaign(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error creating draft campaign', error });
  }
}
async function createBusiness(req: Request, res: Response) {
  try {
    const result = await agentServices.createBusiness(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error creating business', error });
  }
}

async function login(req: Request, res: Response) {
  try {
    const result = await agentServices.login(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
}

async function changeBusiness(req: Request, res: Response) {
  try {
    const result = await agentServices.changeBusiness(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error changing business', error });
  }
}

async function getAgentBusinesses(req: Request, res: Response) {
  try {
    const result = await agentServices.getAgentBusinesses(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting agent businesses', error });
  }
}

async function getAgentCampaigns(req: Request, res: Response) {
  try {
    const agentId = req.body.agentId; // From JWT middleware
    const { business_id, status } = req.query;
    
    const result = await agentServices.getAgentCampaigns({
      agentId,
      business_id: business_id as string,
      status: status as string
    });
    
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting agent campaigns', error });
  }
}

async function getProfile(req: Request, res: Response) {
  try {
    const agentId = req.body.agentId; // From JWT middleware
    const result = await agentServices.getProfile({ agentId });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting agent profile', error });
  }
}

async function updateProfile(req: Request, res: Response) {
  try {
    const agentId = req.body.agentId; // From JWT middleware
    const result = await agentServices.updateProfile({
      agentId,
      ...req.body
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error updating agent profile', error });
  }
}

async function resetPasswordRequest(req: Request, res: Response) {
  try {
    const result = await agentServices.resetPasswordRequest(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error requesting password reset', error });
  }
}

async function resetPassword(req: Request, res: Response) {
  try {
    const result = await agentServices.resetPassword(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password', error });
  }
}

async function changePassword(req: Request, res: Response) {
  try {
    const agentId = req.body.agentId; // From JWT middleware
    const result = await agentServices.changePassword({
      agentId,
      ...req.body
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error changing password', error });
  }
}

export default router;

