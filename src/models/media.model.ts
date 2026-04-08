import Model from "../helpers/model";
import { uploadToS3, uploadWithThumbnail } from "../helpers/S3UploadHelper";

import sharp from "sharp";

class Media extends Model {
  async uploadFile(data: any, files: any[]) {
       const fileType = ["PROFILE_PIC", "STATUS_POST", "THUMBNAIL", "VIDEO", "JOB_GUIDELINES"];
       
    try {
      if (files.length > 3) {
        return this.makeResponse(400, "Maximum of 3 files can be uploaded at once");
      }
      const { userId, file_type } = data;
      if (!fileType.includes(file_type)) {
        return this.makeResponse(400, "File type should be one of " + JSON.stringify(fileType));
      }
      // Check file sizes
      for (const file of files) {
        const fileSizeInMB = file.size / (1024 * 1024);
        if (file_type === "VIDEO" && fileSizeInMB > 250) {
          
          return this.makeResponse(400, "Video file size should not exceed 250MB");
        } else if (file_type !== "VIDEO" && fileSizeInMB > 25) {
          return this.makeResponse(400, "File size should not exceed 250MB");
        }
      }
      
      let fileName = "";
      if (file_type === "PROFILE_PIC") {
        fileName = "dps/" + userId;
      }
      
      if (file_type === "PROFILE_PIC") {
        files = await Promise.all(
          files.map(async (file) => {
            // Use file.data instead of file.buffer
            if (file.mimetype !== "image/png") {
              try {
                const buffer = await sharp(file.data).png().toBuffer();
                return {
                  ...file,
                  data: buffer, // update file.data with new buffer
                  mimetype: "image/png",
                  // Using file.name (from express-fileupload) instead of file.originalname
                  name: file.name.replace(/\.[^/.]+$/, ".png")
                };
              } catch (err) {
                console.error("Sharp conversion error:", err);
                throw new Error("Error converting image to PNG");
              }
            }
            return file;
          })
        );
      }
      
      // Upload each file to S3 with thumbnails automatically handled
      const uploadPromises = files.map(file => uploadWithThumbnail(file, "gems", fileName ? `${fileName}_${this.getRandomString()}` : ''));
      const uploadResults = await Promise.all(uploadPromises);
      
      const uploads = [];
      for (const result of uploadResults) {
        const file_id = "F" + this.getRandomString();
        const file_url = result.url;
        const thumbnail_url = result.thumbnail;
        const uploadInfo = {
          file_id,
          user_id: userId,
          file_type,
          file_url,
          thumbnail_url
        };
        await this.insertData("uploads", uploadInfo);
        uploads.push(uploadInfo);

        if (file_type === "PROFILE_PIC") {
          const profile = { profile_pic: file_url };
          await this.updateData("users_profile", `user_id='${userId}'`, profile);
        }
      }

      return this.makeResponse(200, "upload successful", uploads);
    } catch (error) {
      console.log("UPLOAD_ERROR", error);
      return this.makeResponse(500, "error uploading file, please try again");
    }
  }
}

export default Media;
