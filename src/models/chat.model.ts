import { v4 as uuidv4 } from 'uuid';
import { createItem, queryItems, getItemById, updateItem, getItemByFields } from '../helpers/dynamodb.helper';
import { ChatMessage, Conversation } from '../interfaces/dynamodb.interfaces';
import Model from "../helpers/model";
import { sendNotification } from '../helpers/FCM';
import { getItem, setItem } from '../helpers/connectRedis';
import BaseModel from '../helpers/base.model';
import { logger } from '../utils/logger';
import { FCMMessage, MediaItem } from '../interfaces/influencerDetails';

class ChatModel extends BaseModel {
  async deleteMessage(messageId: string, userId: string) {
    try {
      const message: any = await getItemById("chats", "messageId", messageId);
      if (!message) {
        return this.makeResponse(404, "Message not found");
      }

      if (message.senderId !== userId) {
        return this.makeResponse(403, "Unauthorized to delete this message");
      }

      await updateItem("chats", "messageId", messageId, { ...message, status: "DELETED" });
      await this.composeandSendFCMMessage(message, "DELETE_CHAT");
      
      // Log successful message deletion
      logger.info("Message deleted", {
        operation: 'deleteMessage',
        messageId,
        userId,
        senderId: message.senderId
      });
      
      return this.makeResponse(200, "Message deleted successfully");
    } catch (error: any) {
      logger.error("Error deleting message", {
        error,
        operation: 'deleteMessage',
        messageId,
        userId
      });
      return this.makeResponse(500, "Error deleting message");
    }
  }

  async editMessage(messageId: string, newContent: string, userId: string) {
    try {
      const message: any = await getItemById("chats", "messageId", messageId);
      if (!message) {
        return this.makeResponse(404, "Message not found");
      }

      if (message.senderId !== userId) {
        return this.makeResponse(403, "Unauthorized to edit this message");
      }

      await updateItem("chats", "messageId", messageId, { ...message, text: newContent });
      const messageData: ChatMessage = {
        messageId,
        senderUserName: message.senderUserName,
        conversationId: message.conversationId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        text: newContent,
        edited: true,
        status: message.status,
        timestamp: new Date().toISOString(),
        media: message.media
      }
      await this.composeandSendFCMMessage(messageData, "EDIT_CHAT");
      
      // Log successful message edit
      logger.info("Message edited", {
        operation: 'editMessage',
        messageId,
        userId,
        senderId: message.senderId
      });
      
      return this.makeResponse(200, "Message edited successfully", messageData);
    } catch (error: any) {
      logger.error("Error editing message", {
        error,
        operation: 'editMessage',
        messageId,
        userId
      });
      return this.makeResponse(500, "Error editing message");
    }
  }
  generateConversationId(userId1: string, userId2: string): string {
    const sortedIds = [userId1, userId2].sort();
    return sortedIds.join("_");
  }
  async getMessageTypes() {
    const MessageTypes = await this.callQuerySafe("SELECT operation ,channel FROM notification_templates");
    return this.makeResponse(200, "", MessageTypes);

  }
  async sendMessage(data: any) {

    try {
      logger.info("sendMessage-1", data);

      const { conversationId, media, receiverId, username, userId, originalMessageId, text } = data;
      let messageType = data.messageType || "CHAT"
      let chat_type = "text"

      const socialGemsChannel = process.env.SOCIAL_GEMS_CHANNEL || "";
      if(receiverId == socialGemsChannel && username != "socialadmin") {
        return this.makeResponse(400, "You are not allowed to send message to socialgems channel", data);
      }

      const isGroup = receiverId.startsWith("grp");
      let calculatedConversationId = isGroup ? conversationId : this.generateConversationId(userId, receiverId);
      const existingConversation = await this.selectDataQuery("conversations", `conversationId ='${calculatedConversationId}'`);

      if (existingConversation.length === 0 && !isGroup) {
        logger.info("sendMessage-2", "Creating new conversation");
        await this.createConversationWithParticipants(calculatedConversationId, userId, receiverId, isGroup);
      }

      if (media && media.media_url != "" && media.media_type != "") {
        /*
        for (const item of media) {
          if (!item.media_url || !item.media_type) {
            logger.warn("sendMessage-3", "Media items must have a media_url and media_type");
            return this.makeResponse(400, "Media items must have a media_url and media_type");
          }
        }
          */
        chat_type = "media"
      }

      if ((!text || text.trim().length === 0) && chat_type == "text") {
        logger.warn("sendMessage-4", "Missing text content");
        return this.makeResponse(400, "Text is required");
      }

      const messageId: string = this.getRandomString();
      const message: ChatMessage = {
        messageId,
        senderUserName: username,
        conversationId: calculatedConversationId,
        senderId: userId,
        receiverId,
        originalMessageId: originalMessageId || "",
        text,
        edited: false,
        status: "SENT",
        timestamp: new Date().toISOString(),
        media: media ? media : null
      };

      await createItem<ChatMessage>("chats", "messageId", message);
      logger.info("sendMessage-5", "Message saved successfully");

      await this.composeandSendFCMMessage(message, messageType);

      return this.makeResponse(200, "Message sent successfully", message);
    } catch (error: any) {
      logger.error("Error sending message", {
        error,
        data
      });
      logger.error("sendMessage-11", "Error sending message");
      return this.makeResponse(500, "Error sending message");
    }
  }



  async composeandSendFCMMessage(message: ChatMessage, messageType: string): Promise<boolean> {
    try {
      let fcmMessage: FCMMessage = {
        messageId: message.messageId,
        title: message.senderUserName || "SocialGems",
        body: message.text,
        messageType: messageType,
        conversationId: message.conversationId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        timestamp: message.timestamp,
        senderUserName: message.senderUserName,
        text: message.text,
        edited: message.edited,
        status: message.status,
        originalMessageId: message.originalMessageId,
      };

      if (message.media && message.media != null) {
        const mediaItem: any = message.media;
        fcmMessage.mediaType = mediaItem.media_type || "";
        fcmMessage.mimeType = mediaItem.mime_type || "";
        fcmMessage.mediaUrl = mediaItem.media_url || "";
        fcmMessage.size = mediaItem.size || "";
        fcmMessage.hasMedia = "true";
      } else {
        fcmMessage.hasMedia = "false";
      }

      let isGroup = message.receiverId.startsWith("grp");
      const receiverId = message.receiverId
      let receiverToken = await getItem(`fcm_${receiverId}`) || ""
      if (isGroup) {
        receiverToken = receiverId
      }
      if (receiverToken == "") {
        const getUserFCM: any = await this.callQuerySafe(`select * from users_profile where user_id = '${message.receiverId}' `)
        if (getUserFCM.length > 0) {
          receiverToken = getUserFCM[0].fcm_token
          setItem(`fcm_${message.receiverId}`, receiverToken)
        }
      }

      try {
        sendNotification(receiverToken, fcmMessage, isGroup)
          .then(async response => {
            if (response) {
              await this.updateMessageStatus(message.messageId, message.senderId, "DELIVERED");
              logger.info("sendMessage-7", "Message delivered successfully");
            } else {
              await this.updateMessageStatus(message.messageId, message.senderId, "FAILED");
              logger.warn("sendMessage-8", "Message delivery failed");
            }
          })
          .catch(async error => {
            logger.error("sendMessage-9", "Error sending notification");
            await this.updateMessageStatus(message.messageId, message.senderId, "FAILED");
          });
      } catch (error) {
        logger.error("sendMessage-10", "Error in notification block");
      }
      return true;
    } catch (error) {
      console.error("Error sending FCM message:", error);
      return false;
    }
  }

  makeResponse(status: number, message: string, data: any = null) {
    let resp: any = {
      status,
      message
    };
    if (data !== null) {
      resp.data = data
    }
    return resp
  }

  async updateMessageStatus(messageId: string, fromUserId: string, status: "SENT" | "DELIVERED" | "READ" | "DELETED" | "FAILED") {
    try {
      const message: any = await getItemById("chats", "messageId", messageId);
      if (!message) {
        logger.warn("updateMessageStatus-1", "Message not found");
        return this.makeResponse(404, "Message not found");
      }
      message.status = status;
      await updateItem("chats", "messageId", messageId, message);
      logger.info("updateMessageStatus-2", "Message status updated");
      return this.makeResponse(200, "Message status updated successfully", message);
    } catch (error: any) {
      logger.error("updateMessageStatus-3", "Error updating message status");
      return this.makeResponse(500, "Error updating message status", error.toString());
    }
  }

  async createConversationWithParticipants(conversationId: string, userId: string, receiverId: string, isGroup: boolean) {
    try {
      logger.info("createConversationWithParticipants-1", { conversationId, userId, receiverId, isGroup });
      await this.beginTransaction();

      const conversation = {
        conversationId,
        is_group: isGroup
      };
      await this.insertData("conversations", conversation);

      let participants = [
        { conversationId: conversationId, user_id: userId, is_group: isGroup },
        { conversationId: conversationId, user_id: receiverId, is_group: isGroup }
      ];

      for (const participant of participants) {
        await this.insertData("conversation_participant", participant);
      }
      await this.commitTransaction();
      logger.info("createConversationWithParticipants-2", "Conversation created successfully");
      return true;
    } catch (error) {
      await this.rollbackTransaction();
      logger.error("createConversationWithParticipants-3", "Error creating conversation");
      return false;
    }
  }

  async getUserGroups(userId: any) {
    return await this.callQuerySafe(`select * from sc_group_members m inner join sc_groups p  on m.group_id=p.group_id where (p.group_status='active' or p.group_status='archived') and m.user_id='${userId}'`);
  }


  async getConversations(userId: string) {
    try {

      const conversationArray = []

      const query = `SELECT c.*,cp.id as id FROM conversations c
                     JOIN conversation_participant cp ON c.conversationId = cp.conversationId
                     WHERE cp.user_id = '${userId}' and c.is_group = 0`;
      const conversations: any = await this.callQuerySafe(query)


      const userGroups: any = await this.getUserGroups(userId)
      for (let i = 0; i < userGroups.length; i++) {
        conversationArray.push({
          conversationId: userGroups[i].group_id,
          conversationName: userGroups[i].name,
          conversationIcon: userGroups[i].icon_image_url,
          chats: [],
          participants: [],
          createdAt: userGroups[i].created_at,
          is_group: 1,
          group_status: userGroups[i].group_status,
          conversationStatus: userGroups[i].group_status,
          created_at: userGroups[i].created_at,
          id: userGroups[i].group_id
        });
      }


      for (let i = 0; i < conversations.length; i++) {
        const conversationId = conversations[i].conversationId
        // const isGroup = conversationId.startsWith("grp");
        //logger.info(`SELECT * from conversation_participant cp INNER JOIN users_profile p on cp.user_id = p.user_id where cp.conversationId='${id}' and cp.user_id !='${userId}' `)
        const conv: any = await this.callQuerySafe(`SELECT * from conversation_participant cp INNER JOIN users_profile p on cp.user_id = p.user_id where cp.conversationId='${conversationId}' and cp.user_id !='${userId}' `);
        // const conv: any = await this.getUserByUserId(conversations[i].conversationId);
        const conversationName = conv[0]?.username || "";
        const conversationIcon = conv[0]?.profile_pic || "";

        conversationArray.push({
          conversationId,
          conversationName,
          conversationIcon,
          chats: [],
          participants: [],
          createdAt: conversations[i].created_at,
          is_group: 0,
          group_status: conversations[i].group_status,
          conversationStatus: conversations[i].status,
          created_at: conversations[i].created_at,
          id: conversationId
        });

      }

      return conversationArray;
    } catch (error: any) {
      console.error("Error fetching conversations:", error);
      throw new Error("Error fetching conversations");
    }
  }

  async getChats(conversationId: string): Promise<ChatMessage[]> {
    try {
      const response: any = await getItemByFields("chats", { "conversationId": conversationId });
      return response;
    } catch (error) {
      console.error("Error fetching chats:", error);
      throw new Error("Error fetching chats");
    }
  }

  async getGroup(groupId: string) {
    return await this.callQuerySafe(`SELECT name, icon_image_url FROM sc_groups WHERE group_id='${groupId}'`);
  }
  getRandomString() {
    const uuid = uuidv4();
    return uuid.replace(/-/g, '');
  }

}

export default ChatModel;
