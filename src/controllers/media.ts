import express, { Request, Response } from 'express';
import Media from '../models/media.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import expressFileUpload from 'express-fileupload';

const router = express.Router();
const media = new Media();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

router.post('/uploadProfilePic', applyJWTConditionally, uploadProfilePic);
router.post('/uploadFile', applyJWTConditionally, uploadFile);




async function uploadProfilePic(req: Request, res: Response) {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: 'No files were uploaded.' });
    }
    req.body.file_type = "PROFILE_PIC"
    const files = req.files as { [fieldname: string]: expressFileUpload.UploadedFile | expressFileUpload.UploadedFile[] };
    const uploadedFiles = Array.isArray(files.content) ? files.content : [files.content];
    const result = await media.uploadFile(req.body, uploadedFiles);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}


async function uploadFile(req: Request, res: Response) {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: 'No files were uploaded.' });
    }

    const files = req.files as { [fieldname: string]: expressFileUpload.UploadedFile | expressFileUpload.UploadedFile[] };
    const uploadedFiles = Array.isArray(files.content) ? files.content : [files.content];
    const result = await media.uploadFile(req.body, uploadedFiles);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProperty:", error);
    res.status(500).json({ message: 'Error adding property', error });
  }
}

export default router;
