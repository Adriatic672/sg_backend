import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fsPromises } from 'fs';

// Ensure FFmpeg works inside Docker (adjust the path if needed)
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');

export default class ThumbnailHelper {
  private readonly defaultOutputDir: string;

  constructor() {
    this.defaultOutputDir = path.join(os.tmpdir(), 'thumbnail_temp');
  }

  /**
   * Generate a thumbnail from an image or video, keeping original aspect ratio.
   *
   * @param input - Path to file or Buffer containing file data.
   * @param width - Desired thumbnail width in pixels.
   * @param ext - (Optional) Extension (with or without dot) when input is a Buffer.
   * @returns Buffer of resized thumbnail (JPEG).
   */
  async generateThumbnail(
    input: string | Buffer,
    width: number = 300,
    ext?: string
  ): Promise<Buffer> {
    let inputPath: string;
    let isTempFile = false;
    let fileExt: string;
    let originalFileName: string;

    // Handle Buffer input by writing to a temp file
    if (Buffer.isBuffer(input)) {
      if (ext) {
        fileExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
      } else {
        fileExt = '.jpg';
      }
      originalFileName = `upload_${Date.now()}`;
      const tempDir = this.defaultOutputDir;
      await fsPromises.mkdir(tempDir, { recursive: true });
      inputPath = path.join(tempDir, `${originalFileName}${fileExt}`);
      await fsPromises.writeFile(inputPath, input);
      isTempFile = true;
    } else {
      inputPath = input;
      fileExt = path.extname(inputPath).toLowerCase();
      originalFileName = path.basename(inputPath, fileExt);
    }

    // Ensure output directory exists
    await fsPromises.mkdir(this.defaultOutputDir, { recursive: true });

    // Image processing with Sharp (maintain aspect ratio)
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(fileExt)) {
      try {
        const image = sharp(inputPath);
        const meta = await image.metadata();
        const origWidth = meta.width || width;
        const origHeight = meta.height || width;
        const height = Math.round((width / origWidth) * origHeight);

        const buffer = await image
          .resize(width, height)
          .toFormat('jpeg')
          .toBuffer();

        if (isTempFile) await fsPromises.unlink(inputPath);
        return buffer;
      } catch (err) {
        if (isTempFile) await fsPromises.unlink(inputPath);
        throw err;
      }
    }
    // Video processing with FFmpeg (fixed width, FFmpeg auto maintains aspect ratio)
    else if (['.mp4', '.mov', '.avi', '.mkv'].includes(fileExt)) {
      const tempOutputPath = path.join(
        this.defaultOutputDir,
        `${originalFileName}_thumbnail.jpg`
      );
      return new Promise<Buffer>((resolve, reject) => {
        ffmpeg(inputPath)
          .screenshots({
            timestamps: ['5'],
            filename: `${originalFileName}_thumbnail.jpg`,
            folder: this.defaultOutputDir,
            size: `${width}x?`, // let FFmpeg calculate height preserving ratio
          })
          .on('end', async () => {
            try {
              const buffer = await fsPromises.readFile(tempOutputPath);
              await fsPromises.unlink(tempOutputPath);
              if (isTempFile) await fsPromises.unlink(inputPath);
              resolve(buffer);
            } catch (err) {
              if (isTempFile) await fsPromises.unlink(inputPath);
              reject(err);
            }
          })
          .on('error', async (err) => {
            if (isTempFile) await fsPromises.unlink(inputPath);
            reject(err);
          });
      });
    }
    // Unsupported format
    else {
      if (isTempFile) await fsPromises.unlink(inputPath);
      throw new Error('Unsupported file format');
    }
  }
}
