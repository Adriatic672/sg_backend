import fs from 'fs';
import os from 'os';
import path from 'path';
import ThumbnailHelper from './ThumbnailHelper';

// ─── Cloudinary ───────────────────────────────────────────────────────────────
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const cloudinaryApiKey    = process.env.CLOUDINARY_API_KEY?.trim();
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

const hasCloudinaryCredentials = !!(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);

let cloudinary: any = null;
if (hasCloudinaryCredentials) {
  const { v2 } = require('cloudinary');
  cloudinary = v2;
  cloudinary.config({
    cloud_name: cloudinaryCloudName,
    api_key:    cloudinaryApiKey,
    api_secret: cloudinaryApiSecret,
    secure:     true,
  });
  console.log('[Cloudinary] Configured — uploads will use Cloudinary');
}

// ─── AWS S3 (kept for future migration) ───────────────────────────────────────
const accessKeyId     = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
const region          = process.env.AWS_REGION?.trim();

const hasAWSCredentials  = !!(accessKeyId && secretAccessKey && accessKeyId.length > 0);
const isProduction       = process.env.ENVIRONMENT === 'production';
const useAwsInProduction = !hasCloudinaryCredentials && isProduction && hasAWSCredentials;

let s3: any = null;
if (useAwsInProduction) {
  const AWS = require('aws-sdk');
  s3 = new AWS.S3({ accessKeyId, secretAccessKey, region });
  console.log('[S3] Configured — uploads will use AWS S3');
}

// ─── Mock (local dev / fallback) ──────────────────────────────────────────────
export const MOCK_UPLOAD_DIR = path.join(os.tmpdir(), 'social_gems_uploads');
const USE_MOCK = !hasCloudinaryCredentials && !useAwsInProduction;

if (USE_MOCK) {
  if (!fs.existsSync(MOCK_UPLOAD_DIR)) {
    fs.mkdirSync(MOCK_UPLOAD_DIR, { recursive: true });
  }
  console.log(`[S3Mock] Using local storage at: ${MOCK_UPLOAD_DIR}`);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface UploadResponse {
  url: string;
  key: string;
  thumbnail?: string;
  originalUrl?: string;
}

interface FileUpload {
  name?: string;
  data: Buffer;
  mimetype: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const saveToLocalMock = (fileData: Buffer, folderName: string, fileName: string): string => {
  const filePath = path.join(MOCK_UPLOAD_DIR, folderName, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, fileData as any);
  const mockUrl = `${process.env.DOMAIN || 'http://localhost:3005'}/mock-upload/${folderName}/${fileName}`;
  return mockUrl;
};

const uploadBufferToCloudinary = (
  buffer: Buffer,
  mimetype: string,
  folder: string,
  publicId?: string
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const options: any = {
      folder,
      resource_type: mimetype.startsWith('video/') ? 'video' : 'auto',
    };
    if (publicId) options.public_id = publicId;

    const stream = cloudinary.uploader.upload_stream(options, (error: any, result: any) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
};

export const getCDNUrl = (url: string): string => {
  if (!url) return '';
  const isProd  = process.env.TABLE_IDENTIFIER === 'prod';
  const isStage = process.env.TABLE_IDENTIFIER === 'stage';
  let cdnUrl = url;
  if (isStage) {
    cdnUrl = url.replace('social-gems.s3.amazonaws.com', 'sg-cdn.tekjuice.xyz');
  } else if (isProd) {
    cdnUrl = url.replace('sg-live.s3.amazonaws.com', 'd2alpkzffyryvp.cloudfront.net');
  }
  return cdnUrl;
};

// ─── uploadToS3 ───────────────────────────────────────────────────────────────
export const uploadToS3 = async (
  file: FileUpload,
  folderName: string,
  fileTitle: string = ''
): Promise<UploadResponse> => {
  try {
    const fileName      = file.name || '';
    const fileExtension = fileName.split('.').pop();
    const randomName    = fileTitle === ''
      ? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      : fileTitle;
    const fullFileName  = `${randomName}.${fileExtension}`;

    // ── Cloudinary ──
    if (hasCloudinaryCredentials && cloudinary) {
      const result = await uploadBufferToCloudinary(
        file.data,
        file.mimetype,
        folderName,
        randomName
      );
      return { url: result.secure_url, key: result.public_id, originalUrl: result.url };
    }

    // ── AWS S3 ──
    if (useAwsInProduction && s3) {
      const params = {
        Bucket:      process.env.AWS_S3_BUCKET_NAME as string,
        Key:         `${folderName}/${fullFileName}`,
        Body:        file.data,
        ContentType: file.mimetype,
      };
      const data   = await s3.upload(params).promise();
      const cdnUrl = getCDNUrl(data.Location);
      return { url: cdnUrl, key: data.Key, originalUrl: data.Location };
    }

    if (isProduction) {
      throw new Error('No upload provider configured in production.');
    }

    // ── Mock ──
    const mockUrl = saveToLocalMock(file.data, folderName, fullFileName);
    return { url: mockUrl, key: `${folderName}/${fullFileName}`, originalUrl: mockUrl };

  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error('Error uploading file');
  }
};

// ─── uploadWithThumbnail ──────────────────────────────────────────────────────
export const uploadWithThumbnail = async (
  file: FileUpload,
  folderName: string,
  fileTitle: string = ''
): Promise<UploadResponse> => {
  try {
    const fileName      = file.name || '';
    const fileExtension = fileName.split('.').pop();
    const baseName      = fileTitle === ''
      ? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      : fileTitle;
    const mainFileName      = `${baseName}.${fileExtension}`;
    const thumbnailFileName = `${baseName}_thumbnail.jpg`;

    // ── Cloudinary — thumbnail via URL transformation (no extra upload needed) ──
    if (hasCloudinaryCredentials && cloudinary) {
      const result     = await uploadBufferToCloudinary(file.data, file.mimetype, folderName, baseName);
      const mainUrl    = result.secure_url as string;
      // Generate thumbnail URL using Cloudinary's on-the-fly transformations
      const thumbUrl   = mainUrl.replace('/upload/', '/upload/w_300,h_300,c_fill,f_jpg/');
      return { url: mainUrl, key: result.public_id, originalUrl: result.url, thumbnail: thumbUrl };
    }

    // ── AWS S3 — generate thumbnail manually then upload separately ──
    let thumbnailBuffer: Buffer | null = null;
    try {
      thumbnailBuffer = await new ThumbnailHelper().generateThumbnail(file.data, 300, fileExtension);
    } catch (err) {
      console.error('Thumbnail generation error:', err);
    }

    if (useAwsInProduction && s3) {
      const mainParams = {
        Bucket:      process.env.AWS_S3_BUCKET_NAME as string,
        Key:         `${folderName}/${mainFileName}`,
        Body:        file.data,
        ContentType: file.mimetype,
      };
      const mainUpload = await s3.upload(mainParams).promise();

      let thumbnailUrl: string | null = null;
      if (thumbnailBuffer) {
        const thumbParams = {
          Bucket:      process.env.AWS_S3_BUCKET_NAME as string,
          Key:         `${folderName}/${thumbnailFileName}`,
          Body:        thumbnailBuffer,
          ContentType: 'image/jpeg',
        };
        const thumbUpload = await s3.upload(thumbParams).promise();
        thumbnailUrl      = thumbUpload.Location;
      }

      const cdnUrl      = getCDNUrl(mainUpload.Location);
      const cdnThumbUrl = thumbnailUrl ? getCDNUrl(thumbnailUrl) : null;
      return { url: cdnUrl, key: mainUpload.Key, originalUrl: mainUpload.Location, thumbnail: cdnThumbUrl || undefined };
    }

    if (isProduction) {
      throw new Error('No upload provider configured in production.');
    }

    // ── Mock ──
    const mainUrl = saveToLocalMock(file.data, folderName, mainFileName);
    let thumbUrl: string | undefined;
    if (thumbnailBuffer) {
      thumbUrl = saveToLocalMock(thumbnailBuffer, folderName, thumbnailFileName);
    }
    return { url: mainUrl, key: `${folderName}/${mainFileName}`, originalUrl: mainUrl, thumbnail: thumbUrl };

  } catch (error) {
    console.error('Error uploading file with thumbnail:', error);
    throw new Error('Error uploading file with thumbnail');
  }
};

export default { uploadToS3, uploadWithThumbnail, getCDNUrl };
