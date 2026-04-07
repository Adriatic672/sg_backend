import express, { Request, Response } from 'express';
import AnalyticsModel from '../models/analytics.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';

const router = express.Router();
const analyticsService = new AnalyticsModel();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

// Get detailed analytics from act_comprehensive_analytics
router.get('/detailed/:username/:platform', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const { username, platform } = req.params;
    const { limit = 1 } = req.query;

    const result = await analyticsService.getDetailedAnalytics(username, platform, parseInt(limit as string));
    res.status(result.status).json(result);

  } catch (error) {
    console.error('Error fetching detailed analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching detailed analytics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get summary analytics from act_analytics_logs
router.get('/summary/:username/:platform', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const { username, platform } = req.params;
    const { limit = 1 } = req.query;

    const result = await analyticsService.getSummaryAnalytics(username, platform, parseInt(limit as string));
    res.status(result.status).json(result);

  } catch (error) {
    console.error('Error fetching summary analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching summary analytics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get analytics for all platforms for a user
router.get('/user/:username', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { type = 'summary' } = req.query; // 'summary' or 'detailed'

    const result = await analyticsService.getUserAnalytics(username, type as 'summary' | 'detailed');
    res.status(result.status).json(result);

  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user analytics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get latest analytics for a user and platform
router.get('/latest/:username/:platform', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const { username, platform } = req.params;

    const result = await analyticsService.getLatestAnalytics(username, platform);
    res.status(result.status).json(result);

  } catch (error) {
    console.error('Error fetching latest analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching latest analytics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Manual sync user analytics
router.post('/sync', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const { username, platform } = req.body;

    if (!username || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Username and platform are required'
      });
    }

    const { InfluencerAnalytics } = require('../thirdparty/InfluencerAnalytics');
    const analyticsService = new InfluencerAnalytics();
    
    const result = await analyticsService.trackPlatformPerformance(username, platform);
    
    if (result) {
      res.status(200).json({
        success: true,
        message: 'Manual sync completed successfully',
        data: result
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'No analytics data found for this user and platform'
      });
    }

  } catch (error) {
    console.error('Error in manual sync:', error);
    res.status(500).json({
      success: false,
      message: 'Error in manual sync',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get sync status
router.get('/sync/status', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const result = await analyticsService.getVerifiedUsersForSync();
    res.status(result.status).json(result);

  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting sync status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 