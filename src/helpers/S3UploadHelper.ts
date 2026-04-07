import AWS from 'aws-sdk';
import ThumbnailHelper from './ThumbnailHelper';

// Configure AWS S3 using environment variables
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

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
 * Uploads a file to S3 and returns CDN URL.
 * @param file - The file buffer and metadata to be uploaded.
 * @param folderName - The folder name in the S3 bucket.
 * @param fileTitle - Optional custom filename.
 * @returns The CDN URL and key of the uploaded file.
 */
export const uploadToS3 = async (file: FileUpload, folderName: string, fileTitle: string = ''): Promise<UploadResponse> => {
  try {
    // Generate a unique file name for the S3 bucket
    const fileName = file.name || "";
    const fileExtension = fileName.split('.').pop();

    const randomFileName = fileTitle === ''
      ? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExtension}`
      : `${fileTitle}.${fileExtension}`;

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
    console.error('Error uploading to S3:', error);
    throw new Error('Error uploading file to S3');
  }
};

/**
 * Uploads a file and its thumbnail to S3, returning CDN URLs.
 * @param file - The file buffer and metadata to be uploaded.
 * @param folderName - The folder name in the S3 bucket.
 * @param fileTitle - Optional custom filename.
 * @returns The CDN URLs and keys of both the uploaded file and its thumbnail.
 */


/**
 * Converts an S3 URL to a CDN URL based on environment
 * @param url - The S3 URL to convert
 * @returns The CDN URL
 */
export const getCDNUrl = (url: string): string => {

  const isProd = process.env.TABLE_IDENTIFIER === 'prod';
  const isStage = process.env.TABLE_IDENTIFIER === 'stage';
  let cdnUrl = url;
  console.log('Original URL', url);
  if (isStage) {
    cdnUrl = url.replace('social-gems.s3.amazonaws.com', 'sg-cdn.tekjuice.xyz');
  } else {
    cdnUrl = url.replace('sg-live.s3.amazonaws.com', 'd2alpkzffyryvp.cloudfront.net');
  }
  console.log('CDN URL', cdnUrl);
  return cdnUrl;
};

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

    // Upload original file
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
      originalUrl: mainUpload.Location,
      url: cdnUrl,
      key: mainUpload.Key,
      thumbnail: cdnThumbnailUrl || undefined
    };
  } catch (error) {
    console.error('Error uploading file with thumbnail:', error);
    throw new Error(`Error uploading file with thumbnail: ${error}`);
  }
};
