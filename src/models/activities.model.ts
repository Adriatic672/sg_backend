import { createItem, getAllItems, updateItem, getItemByFields, queryItems } from "../helpers/dynamodb.helper";
import { ActivityNews, Video } from "../interfaces/dynamodb.interfaces";
import Model from "../helpers/model";
import NewsStream from "../helpers/NewsStream";
import { uploadToS3 } from '../helpers/S3UploadHelper';
import RapiAPI from "../thirdparty/Rapid.X";
import axios from "axios";
import InstagramAPI from "../thirdparty/Rapid.Instagram";
import FacebookAPI from "../thirdparty/Facebook";
import { logger } from "../utils/logger";

class Activities extends Model {


  async getNews(query: any) {
    try {
      const { country, category } = query

      const postResponse: any = await getItemByFields("ActivityNews", { "status": "approved" });
      logger.info(`Fetched ${postResponse.length} news items for country: ${country}, category: ${category}`);
      if (postResponse.length == 0) {
        return this.makeResponse(200, "No news found", []);
      }
      //  const postResponse: any = await getAllItems<ActivityNews>("ActivityNews");
      return this.makeResponse(200, "success", postResponse);
    } catch (error) {
      logger.error(`Error fetching news: ${error}`);
      return this.makeResponse(500, "Error fetching news ", []);
    }
  }

  async getNewsCategories() {
    // Fetch from database table if available, otherwise use default categories
    try {
      const categories = await this.selectDataQuery(`news_categories`);
      if (categories && categories.length > 0) {
        const categoryNames = categories.map((c: any) => c.name);
        return this.makeResponse(200, JSON.stringify(categoryNames));
      }
    } catch (error) {
      // Table might not exist, return default categories
    }
    // Default news categories
    const tags = ["business", "entertainment", "general", "health", "science", "sports", "technology"];
    return this.makeResponse(200, JSON.stringify(tags));
  }

  async cacheNews() {
    // Fetch supported countries from database or use defaults
    let supportedCountries: string[] = [];
    try {
      const countries = await this.selectDataQuery(`news_countries`);
      if (countries && countries.length > 0) {
        supportedCountries = countries.map((c: any) => c.code);
      }
    } catch (error) {
      // Table might not exist
    }
    if (supportedCountries.length === 0) {
      supportedCountries = ['us', 'ug', 'uk'];
    }

    // Fetch categories from database or use defaults
    let categories: string[] = [];
    try {
      const cats = await this.selectDataQuery(`news_categories`);
      if (cats && cats.length > 0) {
        categories = cats.map((c: any) => c.name);
      }
    } catch (error) {
      // Table might not exist
    }
    if (categories.length === 0) {
      categories = ["politics", "sports", "technology"];
    }

    for (const country of supportedCountries) {
      for (const category of categories) {
        try {
          logger.info(`Fetching news for ${country} - ${category}`);

          // Call getNews with the current country and category
          const response = await NewsStream.getNews(country, category);
          logger.info(`Cached news for ${country} - ${category}`, response);
        } catch (error) {
          logger.error(`Error fetching news for ${country} - ${category}`, { error, country, category });
        }
      }
    }

    return this.makeResponse(200, "News caching completed.");
  }

  async deleteCampaignTask(data: any) {
    const { task_id, campaign_id } = data;
    const campaign = await this.selectDataQuery("act_campaigns", `campaign_id = '${campaign_id}' and status = 'draft'`);
    if (campaign.length == 0) {
      return this.makeResponse(404, "Campaign not found");
    }
    const task = await this.selectDataQuery("act_tasks", `task_id = '${task_id}'`);
    if (task.length == 0) {
      return this.makeResponse(404, "Task not found");
    }
    const result = await this.deleteData("act_tasks", `task_id = '${task_id}'`);
    return this.makeResponse(200, "Task deleted successfully", result);
  }

  async updateCampaignTask(data: any) {
    try {
      const { task_id, title, description, end_date, image_url, reward, campaign_id } = data;
      const campaign = await this.selectDataQuery("act_campaigns", `campaign_id = '${campaign_id}' and status = 'draft'`);
      if (campaign.length == 0) {
        return this.makeResponse(404, "Campaign not found");
      }

      const updatedTask: any = {};
      if (title) updatedTask.title = title;
      if (description) updatedTask.description = description;
      if (end_date) updatedTask.end_date = end_date;
      if (image_url) updatedTask.image_url = image_url;
      if (reward) updatedTask.reward = reward;

      const result = await this.updateData("act_tasks", `task_id = '${task_id}'`, updatedTask);
      if (!result) {
        throw new Error("Task not updated");
      }

      return this.makeResponse(200, "Task updated successfully", updatedTask);
    } catch (error) {
      logger.error("Error in updateTask", { error, data });
      return this.makeResponse(500, "Error updating task");
    }
  }


  async getTasks(userId: any) {
    const response = await this.callQuerySafe(`SELECT * FROM act_tasks WHERE task_type='activity' and  status = 'active' AND DATE(end_date) > CURDATE() ORDER BY created_on DESC `);
    return this.makeResponse(200, "success", response);
  }

  async getUserTasks(userId: any) {
    try {
      const query = `
        SELECT t.*, atu.status AS user_status FROM  act_tasks t LEFT JOIN  act_task_users atu  ON  t.task_id = atu.activity_id AND atu.user_id = '${userId}' WHERE task_type='activity' and   t.status = 'active'  AND DATE(t.end_date) > CURDATE() ORDER BY  t.created_on DESC`;

      // Execute the combined query
      const response = await this.callQuerySafe(query);

      return this.makeResponse(200, "success", response);
    } catch (error) {
      logger.error("Error fetching tasks", { error, userId });
      return this.makeResponse(500, "Error fetching tasks");
    }
  }



  async addVideo(video: Video) {
    try {
      let video_id = "vid" + this.getRandomString();
      video.video_id = video_id;
      video.reward = video.reward || 1

      const file_id = video.file_id
      const fileInfo = await this.selectDataQuery("uploads", `file_id='${file_id}'`)
      if (fileInfo.length == 0) {
        return this.makeResponse(404, "file not found")
      }
      const file_url = fileInfo[0].file_url
      const thumbnail_url = fileInfo[0].thumbnail_url
      video.video_url = file_url
      video.thumbnail_url = thumbnail_url
      video.views = 0
      video.published_date = new Date().toISOString();
      video.is_trending = false
      video.trending_score = 0
      const postResponse = await createItem<Video>("trainingVideos", "video_id", video);
      return this.makeResponse(200, "success", video)
    } catch (error) {
      logger.info(`UPLOAD_ERROR`, error)
      return this.makeResponse(500, "error uploading file, please try again");
    }
  }

  async getTrainingVideos(userId: string) {
    let postResponse: any = await getAllItems<Video>("trainingVideos");
    for (let i = 0; i < postResponse.length; i++) {
      const video = postResponse[i];
      const videoId = video.video_id;
      const activitystarted = await this.selectDataQuery(`act_task_users`, `activity_id='${videoId}' AND user_id='${userId}' '`)
      if (activitystarted.length > 0) {
        postResponse[i].is_started = activitystarted[0].status
      } else {
        postResponse[i].is_started = "not_started"
      }
    }
    return this.makeResponse(200, "success", postResponse);
  }

  async completedVideo(data: any) {
    try {
      const { userId, activity_id } = data;



      // Check if the activity was started
      const activityStarted: any = await this.callQuerySafe(`select * from act_task_users u where  u.activity_id='${activity_id}' AND u.user_id='${userId}' AND u.status='started'`);
      logger.info("Current time:", activityStarted);

      if (activityStarted.length == 0) {
        return this.makeResponse(404, "Task status is not started");
      }

      const id = activityStarted[0].id;

      const update = { status: 'complete' };

      await this.updateData(`act_task_users`, `id=${id}`, update);
      this.rewardUser(activity_id, userId);
      return this.makeResponse(200, "Congratulations!, task marked as done. ");
    } catch (error) {
      logger.error("Error completing activity", { error, data });
      return this.makeResponse(203, "Task not done, please follow the instructions in the task");
    }
  }

  async updateVideoData(videoId: string) {
    // { views: 15000, likes: 3300 }
    const videoInfo = await this.getTrainingVideo(videoId)
    if (videoInfo.status != 200) {
      return this.makeResponse(404, 'video not found')
    }
    const data = videoInfo.data
    const { views, likes, comments_count } = data
    const newViews = parseInt(views) + 1
    data.views = newViews
    const { video_id } = data
    const response = await updateItem('trainingVideos', 'video_id', `'${video_id}'`, data);
    return this.makeResponse(200, "success", response)
  }

  async getActivity(taskId: string) {
    return await this.selectDataQuery("act_tasks", `task_id='${taskId}'`);
  }
  async getActivityDetails(data: any, activity_id: string) {
    const { userId } = data;

    const userAction = await this.selectDataQuery(
      `act_task_users`,
      `user_id = '${userId}' AND activity_id = '${activity_id}'`
    );


    const campaignResponse: any = await this.callQuerySafe(`
      SELECT 
      *
      FROM act_tasks c 
      WHERE c.task_id = '${activity_id}';
    `);

    // If no campaign is found, return a 404 response
    if (campaignResponse.length === 0) {
      return this.makeResponse(404, "not found", {});
    }

    // Extract the campaign data from the response
    const campaignData = campaignResponse[0];

    // Query to get the user action for the campaign invite


    // If userAction exists, add it to the campaign data
    if (userAction.length > 0) {
      campaignData.user_action = userAction[0];
    } else {
      campaignData.user_action = null;
    }

    const acceptedUsersCount: any = await this.callQuerySafe(`select count(*) as count from act_task_users where  activity_id = '${activity_id}' `)
    const actedUsersArray = await this.callQuerySafe(`select i.status, i.status as action_status,i.created_on, p.first_name, p.last_name,p.profile_pic from act_task_users i INNER JOIN users_profile p ON i.user_id = p.user_id where activity_id ='${activity_id}' LIMIT 5
 `)
    campaignData.actioned_users_total = acceptedUsersCount[0].count || 0
    campaignData.actioned_users_top = actedUsersArray
    campaignData.status = userAction.length > 0 ? userAction[0].status : "not_started"

    return this.makeResponse(200, "success", [campaignData]);
  }


  async getTrainingVideo(videoId: string) {
    try {
      const video = await queryItems<Video>("trainingVideos", "video_id", videoId);
      return this.makeResponse(200, "success", video);
    } catch (error) {
      logger.error("Error fetching training video", { error, videoId });
      return this.makeResponse(500, "Error fetching training video");
    }
  }
  async startTask(data: any) {
    try {
      const { userId, activity_id } = data;
      let activityInfo: any = []


      let reward = 0
      let period_id = ""
      let taskSiteId = 0
      if (activity_id.startsWith("vid")) {
        const videoInfo = await this.getTrainingVideo(activity_id)
        if (videoInfo.status != 200) {
          return this.makeResponse(404, 'video not found')
        }
        activityInfo = videoInfo.data
        reward = activityInfo.reward || 1

        // Increment the views count for the video
        await this.updateVideoData(activity_id);

      } else {
        activityInfo = await this.getActivity(activity_id)
        if (activityInfo.length == 0) {
          return this.makeResponse(404, 'activity not found')
        }
        reward = activityInfo[0].reward
        period_id = activityInfo[0].period_id || ""
        taskSiteId = activityInfo[0].site_id || 0
      }




      const activitystarted = await this.selectDataQuery(`act_task_users`, `activity_id='${activity_id}' AND user_id='${userId}' AND status ='started' `)
      if (activitystarted.length > 0) {
        return this.makeResponse(404, 'activity already started')
      }
      let userSocialUsername = ""

      if (taskSiteId > 0 && taskSiteId != null) {
        const userSite = await this.userSite(userId, taskSiteId)
        const userSiteData = userSite.data
        if (userSiteData.length == 0) {
          return this.makeResponse(404, 'user site not found')
        }
          userSocialUsername = userSiteData[0].username || ""
      }

      const activityDoneStatus = 'complete' //change this to pending
      const newTask = {
        activity_url: "",
        status: 'started',
        user_id: userId,
        user_social_username: userSocialUsername,
        activity_id,
        period_id: period_id || "",
        reward_amount: reward
      };

      // Insert the new task into the tasks table
      const insertedTaskId = await this.insertData("act_task_users", newTask);
      if (insertedTaskId == false) {
        throw new Error(`not added`)
      }
      //  this.sendAppNotification(userId, "ACTIVITY_STARTED");

      return this.makeResponse(200, "Task marked as started", newTask);
    } catch (error) {
      logger.error("Error starting task", { error, data });
      return this.makeResponse(500, "Error adding task");
    }
  }


  async validateTiktokUrl(activity_url: string, user: string, stringToSearch: string) {
    try {
      const expectedUsername = user.toLowerCase();
      // Check if it's a short link (tiktok.com/t/...)
      const shortLinkMatch = activity_url.match(/^https?:\/\/(www\.)?tiktok\.com\/t\/([a-zA-Z0-9]+)/i);

      let finalUrl = activity_url;
      let postId: string | null = null;
      let postText: string | null = null;

      // If it's a short link, resolve to final URL
      if (shortLinkMatch) {
        try {
          const response = await axios.get(finalUrl, {
            maxRedirects: 5,
            validateStatus: () => true
          });

          finalUrl = response.request?.res?.responseUrl || finalUrl;
          logger.info("Resolved URL:", finalUrl);
        } catch (error) {
          logger.error('Error resolving short link', { error, url: finalUrl });
          return { verified: false, error: 'Could not resolve TikTok short link' };
        }
      }

      // Extract post ID from final URL
      const postIdMatch = finalUrl.match(/\/video\/(\d+)/);
      if (postIdMatch) {
        postId = postIdMatch[1];
      }

      // Verify via oEmbed
      const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(finalUrl)}`;
      const response = await axios.get(oembedUrl);

      const { author_name, author_url, title } = response.data;
      const verified = author_name.toLowerCase() === expectedUsername || author_url.includes(`@${expectedUsername}`);

      // Return all collected data
      return {
        verified,
        postId,
        postText: title,
        author: author_name,
        resolvedUrl: finalUrl
      };

    } catch (error) {
      logger.error('TikTok verification failed', { error, activity_url, user, stringToSearch });
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }




  async activityComplete(data: any) {
    try {
      const { activity_url, userId, activity_id } = data;


      if (activity_url) {
        if (!this.isValidUrl(activity_url)) {
          return this.makeResponse(400, "Invalid URL format");
        }
      }

      // Check if the activity was started
      const taskInfo: any = await this.selectDataQuery(`act_tasks`, `task_id='${activity_id}'`);
      if (taskInfo.length == 0) {
        return this.makeResponse(404, "Task not found");
      }
      const is_repetitive = taskInfo[0].is_repetitive;

      let period_id = null;
      let ext = ""

      if (is_repetitive == 'yes') {
        period_id = data.period_id
        if (!period_id || period_id == null) {
          return this.makeResponse(400, "Period is required");
        }
        ext = `and u.period_id='${period_id}'`
      }

      const activityStarted: any = await this.callQuerySafe(`select * from act_tasks a inner join act_task_users u on a.task_id=u.activity_id where  u.activity_id='${activity_id}' AND u.user_id='${userId}' AND u.status='started' `);
      logger.info("Current time:", activityStarted);

      if (activityStarted.length == 0) {
        return this.makeResponse(404, "Task not started or completed");
      }

      const id = activityStarted[0].id;
      const operation = activityStarted[0].operation;

      const existingActivity = await this.selectDataQuery(
        `act_task_users`,
        `activity_url='${activity_url}' and status='complete'`
      );
      logger.info("Existing activity:", existingActivity);
      if (existingActivity.length > 0) {
        return this.makeResponse(400, "This activity URL has already been used.");
      }
      const logData = {
        user_id: userId,
        reference: activity_id,
        activity_url,
        operation
      }

      if (operation == 'CONNECT_X') {
        const account = await this.userSite(userId, 1)
        const xAcc = account.data
        if (xAcc.length == 0) {

          return this.makeResponse(200, "X account not linked yet, please link your x username ", [], true, logData);
        }
        const isValid = await this.validateXUsername(activity_url, userId);
        if (!isValid) {
          return this.makeResponse(400, "The provided URL does not match the required X username.", [], true, logData);
        }
        const savedUserName = xAcc[0].username
        const social_id = xAcc[0].social_id


        const tweetRegex = /^https:\/\/x\.com\/([a-zA-Z0-9_]+)\/status\/(\d+)(\?.*)?$/;
        const match = activity_url.match(tweetRegex);

        if (!match) {
          return this.makeResponse(400, "Invalid tweet URL format", [], true, logData);
        }


        const username = match[1] || ""
        const tweetId = match[2] || ""

        if (savedUserName.toUpperCase() != username.toUpperCase()) {
          return this.makeResponse(400, "This tweet is from a different account, please post the task using your connected username", [], true, logData);
        }

        // Verify the tweet with the extracted username and tweetId
        const isVerified = await new RapiAPI().verifyTweet(username, tweetId, "socialgems");

        if (!isVerified) {
          return this.makeResponse(400, "Post verification failed. Ensure the post contains the required hashtag.", [], true, logData);
        }

        const info = { "is_verified": 'yes' }
        await this.updateData(`sm_site_users`, `social_id=${social_id}`, info);

        //check if the user has liked the page
        //if not, return error
      } else if (operation === 'CONNECT_TIKTOK') {
        const account = await this.userSite(userId, 2); // TikTok = 2
        const xAcc = account.data;
        if (xAcc.length === 0) {
          return this.makeResponse(200, "TikTok account not linked yet, please link your TikTok username.", [], true, logData);
        }

        const savedUserName = xAcc[0].username;
        const social_id = xAcc[0].social_id;

        const tiktokValidation: any = await this.validateTiktokUrl(activity_url, savedUserName, "socialgems")
        if (tiktokValidation.verified == false) {
          const error = tiktokValidation.error || `Error resolving tiktok link`
          return this.makeResponse(400, error)
        }
        const title = tiktokValidation.postText.toLowerCase() || ""
        logger.info("tiktokValidation", tiktokValidation)
        if (!title || !title.includes("socialgems")) {
          return this.makeResponse(400, "Validation failed, make sure the post contains the required hashtag.", [], true, logData);
        }

        await this.updateData('sm_site_users', `social_id=${social_id}`, { is_verified: 'yes' });


      } else if (operation === 'CONNECT_FACEBOOK') {
        const account = await this.userSite(userId, 3); // Facebook = 3
        const xAcc = account.data;
        if (xAcc.length === 0) {
          return this.makeResponse(200, "Facebook account not linked yet, please link your Facebook username.", [], true, logData);
        }

        const savedUserName = xAcc[0].username;
        const social_id = xAcc[0].social_id;

        const fbRegex = new RegExp(`^https?:\\/\\/(www\\.)?facebook\\.com\\/${savedUserName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/posts\\/\\d+`, 'i');
        if (!fbRegex.test(activity_url)) {
          //  return this.makeResponse(400, "The Facebook post URL does not match the linked username.",[],true,logData);
        }

        const isVerified = await new FacebookAPI().verifyPost(savedUserName, activity_url, "socialgems");
        if (isVerified !== true) {
          return this.makeResponse(400, "Post verification failed. Ensure the post contains the required hashtag.", [], true, logData);
        }
        await this.updateData('sm_site_users', `social_id=${social_id}`, { is_verified: 'yes' });

      } else if (operation === 'CONNECT_INSTAGRAM') {
        const account = await this.userSite(userId, 4); // Instagram = 4
        const xAcc = account.data;
        if (xAcc.length === 0) {
          return this.makeResponse(200, "Instagram account not linked yet, please link your Instagram username.", [], true, logData);
        }

        const savedUserName = xAcc[0].username;
        const social_id = xAcc[0].social_id;

        const instaRegex = new RegExp(
          `^https?:\\/\\/(www\\.)?instagram\\.com\\/(?:${savedUserName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/)?(p|reel)\\/[\\w-]+`,
          'i'
        );

        if (!instaRegex.test(activity_url)) {
          return this.makeResponse(400, "This is not an Instagram post");
        }

        const isVerified = await new InstagramAPI().verifyPost(savedUserName, activity_url, "socialgems");

        if (isVerified !== true) {
          return this.makeResponse(400, isVerified);
        }

        await this.updateData('sm_site_users', `social_id=${social_id}`, { is_verified: 'yes' });
      }

      const update = { activity_url, status: 'complete', period_id };

      await this.updateData(`act_task_users`, `id=${id}`, update);
      // Reward the user
      this.rewardUser(activity_id, userId);

      return this.makeResponse(200, "Congratulations!, task marked as done. ", [], true, logData);
    } catch (error) {
      logger.error("Error completing activity", { error, data });
      return this.makeResponse(203, "Task not done, please follow the instructions in the task");
    }
  }

  async userSite(userId: string, siteId: number) {
    const sites = await this.callQuerySafe(`select * from sm_site_users u INNER JOIN sm_sites s on u.site_id = s.site_id where user_id='${userId}' and u.site_id='${siteId}' `)
    return this.makeResponse(200, "success", sites);
  }

  // Helper function to validate URL
  private isValidUrl(url: string): boolean {
    const urlPattern = new RegExp(
      "^(https?:\\/\\/)" + // Protocol
      "((([a-zA-Z\\d]([a-zA-Z\\d-]*[a-zA-Z\\d])*)\\.)+[a-zA-Z]{2,}|" + // Domain name
      "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR IPv4
      "(\\:\\d+)?(\\/[-a-zA-Z\\d%@_.~+&:]*)*" + // Port and path
      "(\\?[;&a-zA-Z\\d%@_.,~+&:=-]*)?" + // Query string
      "(\\#[-a-zA-Z\\d_]*)?$", // Fragment locator
      "i"
    );
    return !!urlPattern.test(url);
  }

  // Helper function to validate X username
  private async validateXUsername(url: string, userId: string): Promise<boolean> {

    return this.isValidUrl(url)
    return true;
  }


  async rewardUser(activityId: string, user_id: string) {
    const activityInfo = await this.selectDataQuery(`act_task_users`, `activity_id='${activityId}' AND user_id='${user_id}' AND reward_status ='pending'`)

    const id = activityInfo[0].id
    const rewardAmount = activityInfo[0].reward_amount
    const userId = activityInfo[0].user_id
    const rewardStatus = activityInfo[0].reward_status
    const currency = "GEMS"
    const narration = "Activity Reward"

    if (rewardStatus != 'pending') {
      return false
    }
    if (parseFloat(rewardAmount) <= 0) {
      return false
    }

    const transferObj = await this.rewardGems(userId, rewardAmount, 'Activity Reward', activityId)
    logger.info("transferObj", transferObj)
    const status = transferObj.status
    if (status == 200) {
      const update = {
        reward_status: 'success'
      }
      await this.updateData(`act_task_users`, `id=${id}`, update)
    }

    return transferObj
  }








  async createTask(data: any) {
    try {
      const { title, description, end_date, image_url, reward, userId, requires_url, is_repetitive, repeats_after } = data;

      const currentDate = new Date();
      const providedEndDate = new Date(end_date);

      if (providedEndDate <= currentDate) {
        return this.makeResponse(400, "End date must be a future date");
      }
      if (isNaN(providedEndDate.getTime())) {
        providedEndDate.setMonth(currentDate.getMonth() + 1);
      }
      // Ensure the provided end date is in the format YYYY-MM-DD
      const formattedEndDate = providedEndDate.toISOString().split('T')[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(formattedEndDate)) {
        return this.makeResponse(400, "End date must be in the format YYYY-MM-DD");
      }


      const task_id = "s" + this.getRandomString();

      // Calculate period fields for repetitive tasks
      const currentPeriodId = this.defaultPeriod()
      let nextPeriodDate = null;
      const repeats_after_array = ['daily', 'weekly', 'monthly'];
      if (!repeats_after_array.includes(repeats_after)) {
        return this.makeResponse(400, "Invalid repeat frequency, should be daily, weekly or monthly");
      }
      if (is_repetitive == 'yes') {
        const startDate = new Date();
        if (repeats_after === 'daily') {
          startDate.setDate(startDate.getDate() + 1);
        } else if (repeats_after === 'weekly') {
          startDate.setDate(startDate.getDate() + 7);
        } else if (typeof repeats_after === 'number') {
          startDate.setDate(startDate.getDate() + Number(repeats_after));
        } else {
          // Default to daily
          startDate.setDate(startDate.getDate() + 1);
        }
        nextPeriodDate = startDate.toISOString().slice(0, 19).replace('T', ' ');
      }

      const period_id = currentPeriodId
      const newTask = {
        task_id: task_id,
        title,
        description,
        end_date: providedEndDate,
        image_url,
        reward,
        period_id,
        requires_url: requires_url,
        is_repetitive: is_repetitive,
        repeats_after: repeats_after,
        next_period_date: nextPeriodDate,
        created_by: userId
      };

      // Insert the new task into the tasks table
      const insertedTaskId = await this.insertData("act_tasks", newTask);
      if (insertedTaskId == false) {
        throw new Error(`not added`)
      }

      // Return success response with the inserted task ID
      return this.makeResponse(200, "Task added successfully", { taskId: insertedTaskId });
    } catch (error) {
      logger.error("Error adding task", { error, data });
      return this.makeResponse(500, "Error adding task");
    }
  }

  /**
   * Community Hub — unified feed.
   *
   * Aggregates four content types into a single ranked feed:
   *   1. announcements  — approved news/announcements from admin (DynamoDB)
   *   2. job_highlights — currently active job board posts (MySQL)
   *   3. success_posts  — high-rated campaign reviews (MySQL, rating >= 4)
   *   4. discussions    — recent user posts (DynamoDB)
   *
   * Each item in the feed carries a `type` discriminator so the frontend can
   * render it with the correct card component.
   */
  async getCommunityFeed(params: { page?: string; limit?: string } = {}) {
    try {
      const pageNum  = Math.max(1, parseInt(params.page  || '1'));
      const limitNum = Math.min(50,  Math.max(1, parseInt(params.limit || '20')));

      // 1. Announcements — approved news items from DynamoDB
      let announcements: any[] = [];
      try {
        const newsItems: any = await getItemByFields("ActivityNews", { status: "approved" });
        announcements = (newsItems || [])
          .sort((a: any, b: any) => new Date(b.created_at || b.published_at || 0).getTime()
                                  - new Date(a.created_at || a.published_at || 0).getTime())
          .slice(0, 5)
          .map((n: any) => ({ type: 'announcement', ...n }));
      } catch (e) {
        logger.warn('getCommunityFeed: could not fetch announcements', e);
      }

      // 2. Job highlights — top 5 active jobs ordered by most recent
      let jobHighlights: any[] = [];
      try {
        const jobs: any = await this.callQuerySafe(`
          SELECT
            j.job_id, j.title, j.description, j.comp_amount, j.comp_currency,
            j.comp_type, j.niche, j.deadline, j.min_followers, j.created_at,
            bp.name AS brand_name, bp.logo AS brand_logo
          FROM jb_job_posts j
          LEFT JOIN business_profile bp ON j.brand_id = bp.business_id
          WHERE j.status = 'active' AND j.deadline >= CURDATE()
          ORDER BY j.created_at DESC
          LIMIT 5
        `);
        jobHighlights = (jobs || []).map((j: any) => ({ type: 'job_highlight', ...j }));
      } catch (e) {
        logger.warn('getCommunityFeed: could not fetch job highlights', e);
      }

      // 3. Campaign success posts — approved reviews with rating >= 4
      let successPosts: any[] = [];
      try {
        const reviews: any = await this.callQuerySafe(`
          SELECT
            r.id, r.campaign_id, r.user_id, r.rating, r.review,
            r.liked_aspects, r.improvement_areas, r.created_at,
            p.username, p.first_name, p.last_name, p.profile_pic,
            c.title AS campaign_title
          FROM act_campaign_reviews r
          INNER JOIN users_profile p ON r.user_id = p.user_id
          INNER JOIN act_campaigns c ON r.campaign_id = c.campaign_id
          WHERE r.rating >= 4
          ORDER BY r.created_at DESC
          LIMIT 5
        `);
        successPosts = (reviews || []).map((rv: any) => ({ type: 'success_post', ...rv }));
      } catch (e) {
        logger.warn('getCommunityFeed: could not fetch success posts', e);
      }

      // 4. Recent discussions — latest active posts from DynamoDB
      let discussions: any[] = [];
      try {
        const posts: any = await getItemByFields("posts", { status: "active" });
        discussions = (posts || [])
          .sort((a: any, b: any) => new Date(b.created_at || 0).getTime()
                                  - new Date(a.created_at || 0).getTime())
          .slice(0, 10)
          .map((p: any) => ({ type: 'discussion', ...p }));
      } catch (e) {
        logger.warn('getCommunityFeed: could not fetch discussions', e);
      }

      // Merge all sections, sort by created_at descending, then paginate.
      const allItems = [...announcements, ...jobHighlights, ...successPosts, ...discussions]
        .sort((a: any, b: any) => {
          const ta = new Date(a.created_at || a.published_at || 0).getTime();
          const tb = new Date(b.created_at || b.published_at || 0).getTime();
          return tb - ta;
        });

      const total     = allItems.length;
      const offset    = (pageNum - 1) * limitNum;
      const feedItems = allItems.slice(offset, offset + limitNum);

      return this.makeResponse(200, 'success', {
        feed: feedItems,
        sections: {
          announcements:  announcements.length,
          job_highlights: jobHighlights.length,
          success_posts:  successPosts.length,
          discussions:    discussions.length,
        },
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error('getCommunityFeed error:', error);
      return this.makeResponse(500, 'Error fetching community feed');
    }
  }

}

export default Activities;
