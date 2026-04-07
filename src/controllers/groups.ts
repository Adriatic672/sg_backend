import express, { Request, Response } from 'express';
import Groups from '../models/groups.model'; // Replace with the appropriate model
import { JWTMiddleware } from '../helpers/jwt.middleware';
import Campaigns from '../models/campaigns.model';

const router = express.Router();
const groupServices = new Groups();
const campaignServices = new Campaigns();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

// Group Routes
router.post('/createGroup', applyJWTConditionally, createGroup);
router.get('/myGroups', applyJWTConditionally, getGroups);
router.patch('/editGroup', applyJWTConditionally, updateGroup);
router.post('/deleteGroup/:id', applyJWTConditionally, deleteGroup);
router.post('/addMember', applyJWTConditionally, addMember);
router.post('/JoinGroup', applyJWTConditionally, JoinGroup);
router.get('/getActionedInfluencers/:id', applyJWTConditionally, getActionedInfluencers);
router.get('/getGroupMembers/:groupId', applyJWTConditionally, getGroupMembers);
router.patch('/updateMember', applyJWTConditionally, updateMember);
router.post('/removeMember', applyJWTConditionally, removeMember);
router.post('/addMembersToGroup', applyJWTConditionally, addMembersToGroup);




async function addMembersToGroup(req: Request, res: Response) {
  try {
    const result = await groupServices.addMembersToGroup(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding members to group', error });
  }
}


// Group Handlers
async function createGroup(req: Request, res: Response) {
  try {
    console.log("createGroup-1", req.body);
    const result = await groupServices.createGroup(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error creating group', error });
  }
}

async function getActionedInfluencers(req: Request, res: Response) {
  try {
    const result = await campaignServices.getActionedInfluencers(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching actioned influencers', error });
  }
}
async function getGroups(req: Request, res: Response) {
  try {
    const result = await groupServices.getGroups(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching groups', error });
  }
}

async function updateGroup(req: Request, res: Response) {
  try {
    const result = await groupServices.updateGroup(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error updating group', error });
  }
}

async function deleteGroup(req: Request, res: Response) {
  try {
    const result = await groupServices.deleteGroup(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deleting group', error });
  }
}

// Group Member Handlers
async function addMember(req: Request, res: Response) {
  try {
    const result = await groupServices.addMember(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding member', error });
  }
}
async function JoinGroup(req: Request, res: Response) {
  try {
    const result = await groupServices.addMember(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding member', error });
  }
}


async function getGroupMembers(req: Request, res: Response) {
  try {
    const result = await groupServices.getGroupMembers(req.params.groupId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching group members', error });
  }
}

async function updateMember(req: Request, res: Response) {
  try {
    const result = await groupServices.updateMember(req.body)
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error updating member', error });
  }
}

async function removeMember(req: Request, res: Response) {
  try {
    const result = await groupServices.removeMember(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error removing member', error });
  }
}

export default router;
