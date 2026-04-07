import express, { Request, Response } from 'express';
import MakerCheckerModel from '../models/makerChecker.model';
import { JWTMiddlewareAdmin } from '../helpers/jwt.middleware.admin';

const router = express.Router();
const makerCheckerModel = new MakerCheckerModel();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddlewareAdmin.verifyToken(req, res, next);
};

router.get('/requests', applyJWTConditionally, getRequests);
router.post('/requests/:requestId/action', applyJWTConditionally, actionRequest);
router.get('/requests/:requestId/actions', applyJWTConditionally, getRequestActions);
router.post('/requests/:requestId/execute', applyJWTConditionally, executeRequest);

async function getRequests(req: Request, res: Response) {
  try {
    const result = await makerCheckerModel.getRequests();
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ status: 500, message: 'Failed to retrieve maker-checker requests. Please try again later.' });
  }
}

/**
 * Approve or reject a request
 */
async function actionRequest(req: Request, res: Response) {
  try {
    const { requestId } = req.params;
    const { action } = req.body;
    const userId = req.body.userId; // From JWT middleware
    
    if (!action) {
      return res.status(400).json({ message: 'Action is required. Please specify whether to approve or reject the request.' });
    }
    
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Action must be either "approved" or "rejected".' });
    }
    
    const result = await makerCheckerModel.actionRequest(requestId, userId, action);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ status: 500, message: 'Failed to process approval/rejection action. Please try again later.' });
  }
}

/**
 * Get all actions/approvals for a specific request
 */
async function getRequestActions(req: Request, res: Response) {
  try {
    const { requestId } = req.params;
    const result = await makerCheckerModel.getRequestActions(requestId);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ status: 500, message: 'Failed to retrieve request approval history. Please try again later.' });
  }
}

/**
 * Execute an approved request
 */
async function executeRequest(req: Request, res: Response) {
  try {
    const { requestId } = req.params;
    const result = await makerCheckerModel.executeApprovedRequest(requestId);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ status: 500, message: 'Failed to execute the approved request. Please check the logs for details.' });
  }
}

export default router;
