import express, { Request, Response } from 'express';
import Activity from '../models/activities.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import { JWTMiddlewareAdmin } from '../helpers/jwt.middleware.admin';

const router = express.Router();
const activity = new Activity();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

const applyAdminJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddlewareAdmin.verifyToken(req, res, next);
};



router.get('/getTasks', applyJWTConditionally, getTasks);
router.post('/start', applyJWTConditionally, startTask);
router.post('/createTask', applyAdminJWTConditionally, createTask);
router.post('/addTrainingVideo', applyAdminJWTConditionally, addVideo);
router.get('/getTrainingVideos', applyJWTConditionally, getTrainingVideos);
router.get('/updateVideoData', applyJWTConditionally, updateVideoData);
router.post('/activityComplete', applyJWTConditionally, activityComplete);
router.get('/getUserWallet', applyJWTConditionally, getUserWallet);
router.get('/getNews', applyJWTConditionally, getNews);
router.get('/getNewsCategories', applyJWTConditionally, getNewsCategories);
router.get('/getTask/:id', applyJWTConditionally, getActivity);
router.post('/completedVideo', applyJWTConditionally, completedVideo);
router.post('/cacheNews', applyAdminJWTConditionally, cacheNews);
router.post('/deleteCampaignTask', applyJWTConditionally, deleteCampaignTask);
router.post('/updateCampaignTask', applyJWTConditionally, updateCampaignTask);




async function deleteCampaignTask(req: Request, res: Response) {
  try {
    const result = await activity.deleteCampaignTask(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in deleteCampaignTask:", error);
    res.status(500).json({ message: 'Error deleting campaign task', error });
  }
}

async function updateCampaignTask(req: Request, res: Response) {
  try {
    const result = await activity.updateCampaignTask(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in updateCampaignTask:", error);
    res.status(500).json({ message: 'Error updating campaign task', error });
  }
}


async function cacheNews(req: Request, res: Response) {
  try {
    const result = await activity.cacheNews();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in cacheNews:", error);
    res.status(500).json({ message: 'Error caching news', error });
  }
}

async function completedVideo(req: Request, res: Response) {
  try {
    const result = await activity.completedVideo(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in completedVideo:", error);
    res.status(500).json({ message: 'Error completing video', error });
  }
}
async function startTask(req: Request, res: Response) {
  try {
    const result = await activity.startTask(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}

async function getActivity(req: Request, res: Response) {
  try {
    const result = await activity.getActivityDetails(req.body,req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}



async function getNewsCategories(req: Request, res: Response) {
  try {
    const result = await activity.getNewsCategories();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function getNews(req: Request, res: Response) {
  try {
    const result = await activity.getNews(req.query);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}
async function getUserWallet(req: Request, res: Response) {
  try {
    const result = await activity.getUserWallet(req.body.userId);
    const resp =  activity.makeResponse(200,"success",result)
    res.status(200).json(resp);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function activityComplete(req: Request, res: Response) {
  try {
    const result = await activity.activityComplete(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function updateVideoData(req: Request, res: Response) {
  try {
    const result = await activity.updateVideoData(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function getTrainingVideos(req: Request, res: Response) {
  try {
    const result = await activity.getTrainingVideos(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function addVideo(req: Request, res: Response) {
  try {
    const result = await activity.addVideo(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function createTask(req: Request, res: Response) {
  try {
    const result = await activity.createTask(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}

async function getTasks(req: Request, res: Response) {
  try {
    const result = await activity.getUserTasks(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}



export default router;
