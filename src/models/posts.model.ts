import { createItem, updateItem, getAllItems, getItemByFields, getItemById, deleteItem } from '../helpers/dynamodb.helper';
import { Post } from '../interfaces/dynamodb.interfaces';
import { sendNotification } from '../helpers/FCM';
import Model from "../helpers/model";
import { setItem, getItem } from "../helpers/connectRedis";
import { uploadToS3, uploadWithThumbnail } from '../helpers/S3UploadHelper';
import { subHours } from 'date-fns';
import FlagHelper from '../thirdparty/FlagPostsHelper';
import { logger } from '../utils/logger';
const aiFlag = new FlagHelper();

class PostsModel extends Model {

  async createMediaPost(data: any, files: any[] = []) {
    try {
      const { text, username } = data
      let imageUrls: string[] = [];
      let thumbnailUrls: string[] = [];

      logger.info(`Hello`)
      if (files && files.length > 0) {
        // Upload all files with automatic thumbnail generation
        const uploadPromises = files.map(file => uploadWithThumbnail(file, 'gems'));
        const uploadResults = await Promise.all(uploadPromises);

        // Extract URLs from results
        imageUrls = uploadResults.map(result => result.url);
        thumbnailUrls = uploadResults.map(result => result.thumbnail).filter(Boolean) as string[];
      } else {
        if (text.length < 2 || text.length > 300) {
          throw new Error(`Body size is between 10 to 300 characters`);
        }
      }

      logger.info(`Hello2`)
      // Check for content moderation


      const postId = this.getRandomString()
      const post: Post = {
        post_id: postId,
        user_id: data.userId,
        username,
        likes: 0,
        views: 0,
        comments: 0,
        text: data.text,
        images: imageUrls,
        status: 'active',
        thumbnail_images: thumbnailUrls,
        created_at: new Date().toISOString()
      }






      const postResponse = await createItem<Post>("posts", "post_id", post);

      this.updatePostContent(postId, text, imageUrls[0] || '')
      this.rewardGems(data.userId, 2, 'Adding a post')
      return this.makeResponse(200, "success", post)
    } catch (error: any) {
      logger.info(`UPLOAD_ERROR`, error)
      return this.makeResponse(500, error);
    }
  }


  async addComment(data: any) {
    try {
      const { text, postId, username, userId } = data;

      if (!text || text.length < 1 || text.length > 300) {
        return this.makeResponse(400, 'Comment must be between 1 and 300 characters');
      }


      // Create a comment object
      const comment: any = {
        comment_id: this.getRandomString(),
        post_id: postId,
        user_id: userId,
        username,
        text,
        created_at: new Date().toISOString(),
      };

      await createItem<Comment>("comments", "comment_id", comment);
      const post: any = await getItemById<Post>("posts", "post_id", postId);
      if (post) {
        const poster = post.user_id
        const sUserName = await this.userUserName(data.userId)
        const pdata = {
          title: `${sUserName} commented on your post`,
          body: text,
          messageType: "ADDED_COMMENT",
          postId: postId,
          userId: data.userId,
          commentId: comment.comment_id
        };

        this.sendAppNotification(poster, "ADDED_COMMENT", sUserName, "", pdata)
        const updatedCommentsCount = (post.comments || 0) + 1;
        await updateItem("posts", "post_id", postId, { comments: updatedCommentsCount });
      }
      // this.rewardGems(data.userId, 50, 'commenting on a post')
      return this.makeResponse(200, "Comment added successfully", comment);
    } catch (error: any) {
      console.error("ADD_COMMENT_ERROR", error);
      return this.makeResponse(500, error);
    }
  }


  async getCommentLikedUsers(postId: string): Promise<any> {
    try {
      // Retrieve the post by ID
      const post: any = await getItemById<Post>("posts", "post_id", postId);

      if (!post) {
        return this.makeResponse(404, "Post not found");
      }

      const likedUsers = post.liked_users || [];

      // Fetch profile information for each liked user
      const userProfilesPromises = likedUsers.map((userId: string) =>
        this.callQuerySafe(`select username,first_name, profile_pic from users_profile where user_id = ?`, [userId])
      );

      const userProfilesResults = await Promise.all(userProfilesPromises);

      // Combine user IDs with their profile pictures
      const likedUsersWithProfiles = likedUsers.map((userId: string, index: number) => ({
        user_id: userId,
        username: userProfilesResults[index][0]?.username,
        first_name: userProfilesResults[index][0]?.first_name,
        profile_pic: userProfilesResults[index][0]?.profile_pic || null,
      }));

      return this.makeResponse(200, "Success", likedUsersWithProfiles);
    } catch (error) {
      console.error("GET_COMMENT_LIKED_USERS_ERROR", error);
      return this.makeResponse(500, "Error retrieving liked users");
    }
  }

  async getUserPosts(userId: string): Promise<any> {
    try {
      const userPosts: any = await getItemByFields<Post>("posts", { user_id: userId });
      logger.info(`Retrieved ${userPosts.length} posts for user ${userId}`);
      return this.makeResponse(200, "Success", userPosts);
    } catch (error) {
      console.error("GET_USER_POSTS_ERROR", error);
      return this.makeResponse(500, "Error retrieving user posts");
    }
  }


  async deletePostById(userId: string, postId: string): Promise<any> {
    try {
      // Check if the post exists
      const post: any = await getItemById<Post>("posts", "post_id", postId);
      if (!post) {
        return this.makeResponse(404, "Post not found", post);
      }
      const sender_id = post.user_id
      logger.info(`userInfo`, userId)
      logger.info(`userInfo`, sender_id)
      if (sender_id != userId) {
        return this.makeResponse(403, "You are not authorized to delete this post");
      }

      // Delete the post
      await deleteItem("posts", "post_id", postId);

      return this.makeResponse(200, "Post deleted successfully");
    } catch (error) {
      console.error("DELETE_POST_ERROR", error);
      return this.makeResponse(500, "Error deleting post");
    }
  }

  async getComments(postId: string) {
    try {
      const comments: any = await getItemByFields("comments", { "post_id": postId });

      return this.makeResponse(200, "Success", comments);
    } catch (error) {
      console.error("GET_COMMENTS_ERROR", error);
      return this.makeResponse(500, "Error retrieving comments");
    }
  }

  async getBlockedUsers(userId: string): Promise<any> {
    try {
      // Fetch blocked users for the given user
      const blockedUsers: any = await this.selectDataQuery("blocked_users", `user_id='${userId}'`);

      if (!blockedUsers || blockedUsers.length === 0) {
        return this.makeResponse(404, "No blocked users found");
      }

      // Fetch detailed information for each blocked user
      const detailedBlockedUsers = await Promise.all(
        blockedUsers.map(async (block: any) => {
          const userProfile: any = await this.callQuerySafe(
            `select username, first_name, profile_pic from users_profile where user_id = ?`,
            [block.blocked_user_id]
          );
          return {
            blocked_user_id: block.blocked_user_id,
            blocked_at: block.created_at,
            user_details: userProfile.length > 0 ? userProfile[0] : null,
          };
        })
      );

      return this.makeResponse(200, "Success", detailedBlockedUsers);
    } catch (error) {
      console.error("GET_BLOCKED_USERS_ERROR", error);
      return this.makeResponse(500, "Error retrieving blocked users");
    }
  }

  async getAllPosts(userId: string): Promise<Post[]> {
    try {
      const twentyFourHoursAgo = subHours(new Date(), 720).toISOString();
      const posts: any = await getItemByFields<Post>("posts", {
        created_at: { $gt: twentyFourHoursAgo }, status: "active"
      });

      // Fetch blocked users for the current user
      const blockedUsers: any = await this.selectDataQuery("blocked_users", `user_id='${userId}'`);
      const blockedUserIds = blockedUsers.map((block: any) => block.blocked_user_id);

      let userPosts = [];

      for (let i = 0; i < posts?.length; i++) {
        let singlePost = posts[i];
        const postOwnerId = posts[i].user_id;

        // Skip posts from blocked users
        if (blockedUserIds.includes(postOwnerId)) {
          continue;
        }

        const ownerProfile: any = await this.callQuerySafe(
          `select profile_pic, username from users_profile where user_id = ?`,
          [postOwnerId]
        );
        if (ownerProfile.length > 0) {
          singlePost.profile_pic = ownerProfile[0].profile_pic ? ownerProfile[0].profile_pic : ''
          singlePost.username = ownerProfile[0].username
          userPosts.push(singlePost);
        }
      }

      return this.makeResponse(200, "Success", userPosts || []);
    } catch (error) {
      console.error("GET_POSTS_ERROR", error);
      return this.makeResponse(500, "Error fetching posts");
    }
  }

  // Get a post by ID
  async getPostById(postId: string) {

    try {
      const post: any = await getItemById<Post>("posts", "post_id", postId);
      if (!post) {
        return this.makeResponse(404, "Post not found");
      }

      const obj = {
        views: (post.views || 0) + 1
      }
      await updateItem("posts", "post_id", postId, obj);
      return this.makeResponse(200, "Post updated successfully", post);

    } catch (error) {
      console.error("ADD_LIKE_ERROR", error);
      return []
    }

  }
  async updatePostContent(postId: string, text: string = '', imageUrl: string = ''): Promise<any> {
    try {
      // Retrieve the current post
      const post: any = await getItemById<Post>("posts", "post_id", postId);
      logger.info(`PostStep_1`, post)

      if (!post) {
        return this.makeResponse(404, "Post not found");
      }
      logger.info(`PostStep_2`)

      let modelContent = post.contentModeration
      logger.info(`PostStep_3`, modelContent)

      let contentModeration = null;
      let imageModeration = null
      let isBlocked = false
      if (text && text.length > 0) {
        contentModeration = await aiFlag.detectContent(text);
        logger.info(`PostStep_4`, contentModeration);
        if (contentModeration?.flagged) {
          modelContent = contentModeration
          isBlocked = true
        }
      }

      // Perform content moderation for image
      if (imageUrl && imageUrl.length > 0) {
        imageModeration = await aiFlag.detectImage(imageUrl);
        logger.info(`PostStep_5`, imageModeration);
        if (imageModeration?.flagged) {
          modelContent = imageModeration
          isBlocked = true
        }
      }

      if (isBlocked) {
        // Block the post if flagged
        const content = { postId, userId: "system", reason: "flagged content" };
        await this.reportPost(content);
        const pdata = {
          title: `Post Blocked`,
          body: `Your last post was blocked due to inappropriate content, and you have been striked, more strikes will lead to a ban`,
          messageType: "ADDED_POST",
          postId: postId,
          text: ""
        };
        this.sendAppNotification(post.user_id, "BLOCKED_POST", "", "", pdata)
      }

      // Update the post
      const updatedPost = {
        ...post,
        text: text || post.text,
        images: imageUrl ? [imageUrl] : post.images,
        textModeration: modelContent,
        status: isBlocked ? "blocked" : post.status,
        contentModeration: imageModeration,
        updated_at: new Date().toISOString(),
      };

      await updateItem("posts", "post_id", postId, updatedPost);
      return this.makeResponse(200, "Post updated successfully", updatedPost);
    } catch (error) {
      console.error("UPDATE_POST_CONTENT_ERROR", error);
      return this.makeResponse(500, "Error updating post content");
    }
  }

  async updatePost(data: Post) {
    try {
      const { post_id } = data
      const postResponse = null; // await updateItem<Post>("posts", "post_id", post_id, data);
      return this.makeResponse(200, "success", postResponse)
    } catch (error) {
      logger.info(`Error`, error)
    }
  }

  // Delete a post by ID
  async deletePost(postId: string): Promise<void> {
    await deleteItem("posts", "post_id", postId);
  }



  async blockUser(data: any): Promise<any> {
    try {
      const { userId, blocked_user_id, action } = data;

      if (!userId || !blocked_user_id) {
        return this.makeResponse(400, "Both userId and blocked_user_id are required");
      }

      if (action === "block") {
        // Check if the user is already blocked
        const existingBlock = await this.selectDataQuery("blocked_users", `user_id='${userId}' AND blocked_user_id='${blocked_user_id}'`);

        if (existingBlock && existingBlock.length > 0) {
          return this.makeResponse(400, "User is already blocked");
        }

        // Add the blocked user to the blocked_users table
        const blockData = {
          block_id: this.getRandomString(),
          user_id: userId,
          blocked_user_id: blocked_user_id,
          created_at: new Date().toISOString(),
        };

        await this.insertData("blocked_users", blockData);

        return this.makeResponse(200, "User blocked successfully");
      } else if (action === "unblock") {
        // Check if the user is currently blocked

        const existingBlock = await this.selectDataQuery("blocked_users", `user_id='${userId}' AND blocked_user_id='${blocked_user_id}'`);

        if (!existingBlock || existingBlock.length === 0) {
          return this.makeResponse(400, "User is not currently blocked");
        }

        // Remove the blocked user from the blocked_users table
        await this.deleteData("blocked_users", `user_id='${userId}' AND blocked_user_id='${blocked_user_id}'`);

        return this.makeResponse(200, "User unblocked successfully");
      } else {
        return this.makeResponse(400, "Invalid action. Use 'block' or 'unblock'.");
      }
    } catch (error) {
      console.error("BLOCK_USER_ERROR", error);
      return this.makeResponse(500, "Error blocking/unblocking user");
    }
  }

  async blockReportedPost(reportId: string): Promise<any> {
    try {
      // Fetch the reported post by report ID
      const report: any = await this.selectDataQuery("reported_posts", `report_id='${reportId}'`);

      if (!report || report.length === 0) {
        return this.makeResponse(404, "Report not found");
      }

      const postId = report[0].post_id;

      // Fetch the post by post ID
      const post: any = await getItemById<Post>("posts", "post_id", postId);
      if (!post) {
        return this.makeResponse(404, "Post not found");
      }

      // Update the post status to "blocked"
      const updatedPost = {
        ...post,
        status: "blocked",
        updated_at: new Date().toISOString(),
      };

      await updateItem("posts", "post_id", postId, updatedPost);

      return this.makeResponse(200, "Post blocked successfully", updatedPost);
    } catch (error) {
      console.error("BLOCK_REPORTED_POST_ERROR", error);
      return this.makeResponse(500, "Error blocking reported post");
    }
  }


  async getReportedPosts(): Promise<any> {
    try {
      // Fetch all reported posts
      const reportedPosts: any = await this.selectDataQuery("reported_posts", "1=1");

      if (!reportedPosts || reportedPosts.length === 0) {
        return this.makeResponse(404, "No reported posts found");
      }

      // Fetch detailed information for each reported post
      const detailedReports = await Promise.all(
        reportedPosts.map(async (report: any) => {
          const post: any = await getItemById<Post>("posts", "post_id", report.post_id);
          return {
            report_id: report.report_id,
            post_id: report.post_id,
            user_id: report.user_id,
            reason: report.reason,
            reported_at: report.created_at,
            post_details: post || null,
          };
        })
      );

      return this.makeResponse(200, "Success", detailedReports);
    } catch (error) {
      console.error("GET_REPORTED_POSTS_ERROR", error);
      return this.makeResponse(500, "Error retrieving reported posts");
    }
  }
  async reportPost(data: any): Promise<any> {
    try {
      const { postId, userId, reason } = data;

      // Check if the post exists
      const post: any = await getItemById<Post>("posts", "post_id", postId);
      if (!post) {
        return this.makeResponse(404, "Post not found");
      }

      // Report the post
      const reportData = {
        report_id: this.getRandomString(),
        post_id: postId,
        user_id: userId,
        reason
      };

      await this.insertData("reported_posts", reportData);

      return this.makeResponse(200, "Post reported successfully");
    } catch (error) {
      console.error("REPORT_POST_ERROR", error);
      return this.makeResponse(500, "Error reporting post");
    }
  }


  async addOrRemoveLike(data: any): Promise<any> {
    const { postId, userId, status } = data;

    try {
      // Retrieve the current post
      const post: any = await getItemById<Post>("posts", "post_id", postId);

      if (!post) {
        throw new Error("Post not found");
      }

      const { likes = 0, liked_users = [] } = post;

      // Handle "like" or "unlike" status
      if (status === "like") {
        // Check if the user has already liked the post
        if (liked_users.includes(userId)) {
          return this.makeResponse(400, "User has already liked this post");
        }
        // Add the userId to liked_users and increment likes count
        const updatedPost = {
          likes: likes + 1,
          liked_users: [...liked_users, userId],
        };

        await updateItem("posts", "post_id", postId, updatedPost);

        // const sUserName = await this.userUserName(post.user_id)
        const sUserName = await this.userUserName(data.userId)
        const pdata = {
          title: `${sUserName} liked your post`,
          body: `${sUserName} liked your post`,
          messageType: "LIKED_POST",
          postId: postId
        };

        this.rewardGems(post.user_id, 1, 'user liked their post')
        this.sendAppNotification(post.user_id, "LIKED_POST", sUserName, "", pdata)

        return this.makeResponse(200, "Like added successfully", {
          post_id: postId,
          user_id: userId,
          likes: updatedPost.likes,
          liked_users: updatedPost.liked_users,
        });


      } else if (status === "unlike") {
        // Check if the user hasn't liked the post yet
        if (!liked_users.includes(userId)) {
          return this.makeResponse(400, "User has not liked this post yet");
        }

        // Remove the userId from liked_users and decrement likes count
        const updatedPost = {
          likes: Math.max(likes - 1, 0), // Ensure likes never go below 0
          liked_users: liked_users.filter((id: any) => id !== userId),
        };

        await updateItem("posts", "post_id", postId, updatedPost);

        return this.makeResponse(200, "Like removed successfully", {
          post_id: postId,
          user_id: userId,
          likes: updatedPost.likes,
          liked_users: updatedPost.liked_users,
        });

      } else {
        return this.makeResponse(400, "Invalid status. Use 'like' or 'unlike'.");
      }
    } catch (error) {
      console.error("ADD_OR_REMOVE_LIKE_ERROR", error);
      return this.makeResponse(500, "Error updating like status");
    }
  }


  async addView(data: any): Promise<any> {
    try {
      const { postId, userId } = data

      // Retrieve the current post
      const post: any = await getItemById<Post>("posts", "post_id", postId);

      if (!post) {
        throw new Error("Post not found");
      }

      /*
      // Add user ID to the views tracking table or logic
      await createItem("post_views", "view_id", {
        post_id: postId,
        user_id: userId,
        created_at: new Date().toISOString()
      });
*/


      const obj = {
        views: (post.views || 0) + 1
      }
      await updateItem("posts", "post_id", postId, obj);

      return this.makeResponse(200, "View added successfully", post);
    } catch (error) {
      console.error("ADD_VIEW_ERROR", error);
      return this.makeResponse(500, "Error adding view");
    }
  }

}

export default PostsModel;
