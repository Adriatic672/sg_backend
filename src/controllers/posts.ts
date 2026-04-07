import express, { Request, Response } from 'express';
import PostsModel from '../models/posts.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import expressFileUpload from 'express-fileupload';

const router = express.Router();
const posts = new PostsModel();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};
router.post('/create', applyJWTConditionally, create);
router.post('/createMediaPost', applyJWTConditionally, createMediaPost);
router.patch('/update', applyJWTConditionally, updatePost);
router.get('/get', applyJWTConditionally, getAllPosts);
router.post('/addComment', applyJWTConditionally, addComment);
router.get('/getComments/:id', applyJWTConditionally, getComments);
router.post('/addView', applyJWTConditionally, addView);
router.post('/addLike', applyJWTConditionally, addLike);
router.get('/delete/:id', applyJWTConditionally, deletePostById);
router.get('/getPostById/:id', applyJWTConditionally, getPostById);
router.get('/userPosts', applyJWTConditionally, getUserPosts);
router.get('/getCommentLikedUsers/:postId', applyJWTConditionally, getCommentLikedUsers);
router.get('/postsForUser/:userId', applyJWTConditionally, getUserPost);
router.post('/blockUser', applyJWTConditionally, blockUser);
router.post('/reportPost', applyJWTConditionally, reportPost);

router.post('/blockReportedPost', applyJWTConditionally, blockReportedPost);
router.get('/getReportedPosts', applyJWTConditionally, getReportedPosts);
router.get('/getBlockedUsers', applyJWTConditionally, getBlockedUsers);


async function getPostById(req: Request, res: Response) {
  try {
    const result = await posts.getPostById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getPostById:", error);
    res.status(500).json({ message: 'Error fetching post by ID', error });
  }
}
async function getBlockedUsers(req: Request, res: Response) {
  try {
    const result = await posts.getBlockedUsers(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in blockReportedPost:", error);
    res.status(500).json({ message: 'Error blocking reported post', error });
  }
}

async function blockReportedPost(req: Request, res: Response) {
  try {
    const result = await posts.blockReportedPost(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in blockReportedPost:", error);
    res.status(500).json({ message: 'Error blocking reported post', error });
  }
}

async function getReportedPosts(req: Request, res: Response) {
  try {
    const result = await posts.getReportedPosts();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getReportedPosts:", error);
    res.status(500).json({ message: 'Error fetching reported posts', error });
  }
}
async function blockUser(req: Request, res: Response) {
  try {
    const result = await posts.blockUser(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in blockUser:", error);
    res.status(500).json({ message: 'Error blocking user', error });
  }
}

async function reportPost(req: Request, res: Response) {
  try {
    const result = await posts.reportPost(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in reportPost:", error);
    res.status(500).json({ message: 'Error reporting post', error });
  }
}
async function getUserPost(req: Request, res: Response) {
  try {
    const result = await posts.getUserPosts(req.params.userId)
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getUserPost:", error);
    res.status(500).json({ message: 'Error fetching user post', error });
  }
}

async function getCommentLikedUsers(req: Request, res: Response) {
  try {
    const result = await posts.getCommentLikedUsers(req.params.postId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getCommentLikedUsers:", error);
    res.status(500).json({ message: 'Error fetching comment liked users', error });
  }
}
async function getUserPosts(req: Request, res: Response) {
  try {
    const result = await posts.getUserPosts(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getUserPosts:", error);
    res.status(500).json({ message: 'Error fetching user posts', error });
  }
}
async function deletePostById(req: Request, res: Response) {
  try {
    const result = await posts.deletePostById(req.body.userId,req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in deletePostById:", error);
    res.status(500).json({ message: 'Error deleting post', error });
  }
}
async function create(req: Request, res: Response) {
  try {
    if (!req.files) {
      console.log(`POST1`)
      req.body.images = []
      const result = await posts.createMediaPost(req.body);
      res.status(200).json(result);
    } else {
      console.log(`POST2`)
      const files = req.files as { [fieldname: string]: expressFileUpload.UploadedFile | expressFileUpload.UploadedFile[] };
      const uploadedFiles = Array.isArray(files.content) ? files.content : [files.content];
      const result = await posts.createMediaPost(req.body, uploadedFiles);
      res.status(200).json(result);
    }
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}
async function getComments(req: Request, res: Response) {
  try {
    const result = await posts.getComments(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}
async function addComment(req: Request, res: Response) {
  try {
    const result = await posts.addComment(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function getAllPosts(req: Request, res: Response) {
  try {
    const result = await posts.getAllPosts(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}
async function createMediaPost(req: Request, res: Response) {
  try {
    const result = await posts.createMediaPost(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}

async function updatePost(req: Request, res: Response) {
  try {
    const result = await posts.updatePost(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function addView(req: Request, res: Response) {
  try {
    const result = await posts.addView(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function addLike(req: Request, res: Response) {
  try {
    const result = await posts.addOrRemoveLike(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}



export default router;
