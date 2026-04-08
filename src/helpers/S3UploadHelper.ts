import fs from 'fs';
import path from 'path';
import ThumbnailHelper from './ThumbnailHelper';

// Check if AWS credentials are configured
const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
const region = process.env.AWS_REGION?.trim();

const hasAWSCredentials = !!(accessKeyId && secretAccessKey && accessKeyId.length > 0);

// Conditionally load AWS SDK only when needed
const isProduction = process.env.ENVIRONMENT === 'production';
const useAwsInProduction = isProduction && hasAWSCredentials;

// Only import AWS S3 when actually needed in production
let s3: any = null;
if (useAwsInProduction) {
  const AWS = require('aws-sdk');
  s3 = new AWS.S3({
    accessKeyId,
    secretAccessKey,
    region,
  });
}

// Local mock storage path for development
export const MOCK_UPLOAD_DIR = path.join(process.cwd(), '..', 'social_gems_uploads');
// Force mock in development, or if credentials are missing in production (fallback)
const USE_MOCK = !useAwsInProduction;

// Ensure mock upload directory exists
if (USE_MOCK) {
  if (!fs.existsSync(MOCK_UPLOAD_DIR)) {
    fs.mkdirSync(MOCK_UPLOAD_DIR, { recursive: true });
  }
  console.log(`[S3Mock] Using local storage at: ${MOCK_UPLOAD_DIR}`);
}

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

/**
 * Saves file to local mock storage (development only)
 */
const saveToLocalMock = (fileData: Buffer, folderName: string, fileName: string): string => {
  const folderPath = path.join(MOCK_UPLOAD_DIR, folderName);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  
  const filePath = path.join(folderPath, fileName);
  // Write file using fs.writeFileSync (bypassing strict type check)
  fs.writeFileSync(filePath, fileData as any);
  
  // Return a mock URL that points to our local server
  const mockUrl = `${process.env.DOMAIN || 'http://localhost:3005'}/mock-upload/${folderName}/${fileName}`;
  return mockUrl;
};

/**
 * Uploads a file to S3 and returns CDN URL.
 * Falls back to local mock storage if AWS credentials are not configured.
 */
export const uploadToS3 = async (file: FileUpload, folderName: string, fileTitle: string = ''): Promise<UploadResponse> => {
  try {
    // Generate a unique file name for the S3 bucket
    const fileName = file.name || "";
    const fileExtension = fileName.split('.').pop();

    const randomFileName = fileTitle === ''
      ? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExtension}`
      : `${fileTitle}.${fileExtension}`;

    if (isProduction && !s3) {
      throw new Error("AWS Credentials are required in production. S3 upload failed.");
    }

    // Use mock storage if AWS credentials are not configured
    if (USE_MOCK || !s3) {
      console.log(`[S3Mock] Uploading ${randomFileName} to local mock storage`);
      const mockUrl = saveToLocalMock(file.data, folderName, randomFileName);
      return {
        url: mockUrl,
        key: `${folderName}/${randomFileName}`,
        originalUrl: mockUrl
      };
    }

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME as string,
      Key: `${folderName}/${randomFileName}`,
      Body: file.data,
      ContentType: file.mimetype
    };

    // Upload the file to S3
    const data = await s3.upload(params).promise();

    // Convert S3 URL to CDN URL
    const cdnUrl = getCDNUrl(data.Location);

    return {
      url: cdnUrl,
      key: data.Key,
      originalUrl: data.Location
    };
  } catch (error) {
    if (isProduction) console.error(`[S3-Error] Upload failed in production. Has Credentials: ${!!s3}, Bucket: ${process.env.AWS_S3_BUCKET_NAME}`);
    console.error('Error uploading to S3:', error);
    throw new Error('Error uploading file to S3');
  }
};

/**
 * Converts an S3 URL to a CDN URL based on environment
 */
export const getCDNUrl = (url: string): string => {
  if (!url) return '';
  
  const isProd = process.env.TABLE_IDENTIFIER === 'prod';
  const isStage = process.env.TABLE_IDENTIFIER === 'stage';
  let cdnUrl = url;
  
  if (isStage) {
    cdnUrl = url.replace('social-gems.s3.amazonaws.com', 'sg-cdn.tekjuice.xyz');
  } else if (isProd) {
    cdnUrl = url.replace('sg-live.s3.amazonaws.com', 'd2alpkzffyryvp.cloudfront.net');
  }
  
  return cdnUrl;
};

/**
 * Uploads a file and its thumbnail to S3, returning CDN URLs.
 * Falls back to local mock storage if AWS credentials are not configured.
 */
export const uploadWithThumbnail = async (file: FileUpload, folderName: string, fileTitle: string = ''): Promise<UploadResponse> => {
  try {
    // Extract file info
    const fileName = file.name || "";
    const fileExtension = fileName.split('.').pop();
    const baseName = fileTitle === ''
      ? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      : fileTitle;

    // Create final filenames
    const mainFileName = `${baseName}.${fileExtension}`;
    const thumbnailFileName = `${baseName}_thumbnail.jpg`;

    // Generate thumbnail if it's an image
    let thumbnailBuffer;
    try {
      thumbnailBuffer = await new ThumbnailHelper().generateThumbnail(
        file.data,
        300,
        fileExtension
      );
    } catch (err) {
      console.error('Thumbnail generation error:', err);
      thumbnailBuffer = null;
    }

    if (isProduction && !s3) {
      throw new Error("AWS Credentials are required in production. S3 upload failed.");
    }

    // Use mock storage if AWS credentials are not configured
    if (USE_MOCK || !s3) {
      console.log(`[S3Mock] Uploading ${mainFileName} with thumbnail to local mock storage`);
      
      const mainUrl = saveToLocalMock(file.data, folderName, mainFileName);
      let thumbnailUrl = null;
      
      if (thumbnailBuffer) {
        thumbnailUrl = saveToLocalMock(thumbnailBuffer, folderName, thumbnailFileName);
      }
      
      return {
        url: mainUrl,
        key: `${folderName}/${mainFileName}`,
        originalUrl: mainUrl,
        thumbnail: thumbnailUrl || undefined
      };
    }

    // Upload original file to S3
    const mainFileParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME as string,
      Key: `${folderName}/${mainFileName}`,
      Body: file.data,
      ContentType: file.mimetype
    };

    const mainUpload = await s3.upload(mainFileParams).promise();
    let thumbnailUrl = null;

    // Upload thumbnail if we were able to generate one
    if (thumbnailBuffer) {
      const thumbnailParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME as string,
        Key: `${folderName}/${thumbnailFileName}`,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg'
      };

      const thumbnailUpload = await s3.upload(thumbnailParams).promise();
      thumbnailUrl = thumbnailUpload.Location;
    }

    // Convert S3 URLs to CDN URLs using centralized function
    const cdnUrl = getCDNUrl(mainUpload.Location);
    const cdnThumbnailUrl = thumbnailUrl ? getCDNUrl(thumbnailUrl) : null;

    return {
      url: cdnUrl,
      key: mainUpload.Key,
      originalUrl: mainUpload.Location,
      thumbnail: cdnThumbnailUrl || undefined
    };
  } catch (error) {
    if (isProduction) console.error(`[S3-Error] Upload with thumbnail failed. Has Credentials: ${!!s3}`);
    console.error('Error uploading with thumbnail:', error);
    throw new Error('Error uploading file with thumbnail to S3');
  }
};

export default {
  uploadToS3,
  uploadWithThumbnail,
  getCDNUrl
};
