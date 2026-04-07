import { createItem, queryItems, getItemById,updateItem,getItemByFields } from '../helpers/dynamodb.helper';
import { ChatMessage, Conversation } from '../interfaces/dynamodb.interfaces';
import Model from "../helpers/model";
import { sendNotification } from '../helpers/FCM';
import { getItem, setItem } from '../helpers/connectRedis';
import BaseModel from './base.model';

class ChatHelper extends BaseModel {
  generateConversationId(userId1: string, userId2: string): string {
    const sortedIds = [userId1, userId2].sort();
    return sortedIds.join("_");
  }

  async sendMessage(data: any) {
    try {
      console.log(`sendMessage`, data);
      const { conversationId, media, receiverId, username, userId, text } = data;

      let chat_type = "text"


      const isGroup = receiverId.startsWith("grp");
      let calculatedConversationId = isGroup ? conversationId : this.generateConversationId(userId, receiverId);
      const existingConversation = await this.selectDataQuery("conversations", `conversationId ='${calculatedConversationId}'`);

      if (existingConversation.length === 0) {
        await this.createConversationWithParticipants(calculatedConversationId, userId, receiverId, isGroup);
      }

      if (media && media.length > 0) {
        for (const item of media) {
          if (!item.media_url || !item.media_type) {
            return this.makeResponse(400, "Media items must have a media_url and media_type");
          }
        }
        chat_type = "media"
      }

      if ((!text || text.trim().length === 0) && chat_type == "text") {
        return this.makeResponse(400, "Text is required");
      }
      const messageId: string = this.getRandomString();
      const message: ChatMessage = {
        messageId,
        senderUserName: username,
        conversationId: calculatedConversationId,
        senderId: userId,
        receiverId,
        text,
        status: "SENT",
        timestamp: new Date().toISOString(),
        media: media ? media : null
      };

      await createItem<ChatMessage>("chats", "messageId", message);


      let fcmMessage: any = message;
      fcmMessage.title = username;
      fcmMessage.body = text;
      fcmMessage.messageType = "CHAT";
      fcmMessage.conversationId = calculatedConversationId


      let receiverToken = await getItem(`fcm_${receiverId}`) || ""
      console.log(`receiverToken`,receiverToken)
      if(isGroup){
        receiverToken = receiverId
      }
      if (!isGroup && receiverToken == "") {
        console.log(`receiverToken-2`,receiverToken)

        const getUserFCM: any = await this.callQuerySafe(`select * from users_profile where user_id = '${receiverId}' `)
        if (getUserFCM.length > 0) {
          receiverToken = getUserFCM[0].fcm_token
          setItem(`fcm_${receiverId}`, receiverToken)
        } else {
          return this.makeResponse(404, "user not found");

        }
      }
      console.log(`receiverToken-3`,receiverToken)


    try {
      sendNotification(receiverToken, fcmMessage, isGroup)
        .then(async response => {
          // handle response if needed
          if(response){
         await this.updateMessageStatus(messageId, userId, "DELIVERED");
          } else {
        await this.updateMessageStatus(messageId, userId, "FAILED");
          }
        })
        .catch(async error => {
          console.error("Error sending notification:", error);
          await this.updateMessageStatus(messageId, userId, "FAILED");
        });
     
    } catch (error) {
      console.error("Error sending notification:", error);
    }


      return this.makeResponse(200, "Message sent successfully", message);
    } catch (error: any) {
      console.error("Error sending message:", error);
      return this.makeResponse(500, "Error sending message", error.toString());
    }
  }

  async updateMessageStatus(messageId: string, fromUserId: string, status: "SENT" | "DELIVERED" | "READ" | "DELETED" |"FAILED") {
    try {
      const message:any = await getItemById("chats","messageId",messageId);
      console.log(`messageInfo`,message)
      if (!message) {
        return this.makeResponse(404, "Message not found");
      }
      message.status = status;
      await updateItem("chats", "messageId", messageId, message);

      return this.makeResponse(200, "Message status updated successfully", message);
    } catch (error: any) {
      console.error("Error updating message status:", error);
      return this.makeResponse(500, "Error updating message status", error.toString());
    }
  }

  private async createConversationWithParticipants(conversationId: string, userId: string, receiverId: string, isGroup: boolean) {
    try {
      await this.beginTransaction();

      const conversation = {
        conversationId,
        is_group: isGroup
      };
      await this.insertData("conversations", conversation);

      const participants = [
        { conversationId: conversationId, user_id: userId, is_group: isGroup },
        { conversationId: conversationId, user_id: receiverId, is_group: isGroup }
      ];
      for (const participant of participants) {
        await this.insertData("conversation_participant", participant);
      }
      await this.commitTransaction();
      return true
    } catch (error) {
      await this.rollbackTransaction();
      console.error("Error creating conversation and participants:", error);
      return false
    }
  }

  async getConversations(userId: string) {
    try {
      const query = `SELECT c.*,cp.id as id FROM conversations c
                     JOIN conversation_participant cp ON c.conversationId = cp.conversationId
                     WHERE cp.user_id = '${userId}'`;
      const conversations: any = await this.callQuerySafe(query)
      for (let i = 0; i < conversations.length; i++) {
        //   const isGroup = conversations[i].is_group
        const conversationId = conversations[i].conversationId
        const isGroup = conversationId.startsWith("grp");
        if (isGroup) {
          const conv: any = await this.getGroup(conversations[i].conversationId);
          conversations[i].conversationName = conv[0]?.name || "";
          conversations[i].conversationIcon = conv[0]?.icon_image_url || "";
        } else {
          const id = conversations[i].conversationId
          //console.log(`SELECT * from conversation_participant cp INNER JOIN users_profile p on cp.user_id = p.user_id where cp.conversationId='${id}' and cp.user_id !='${userId}' `)
          const conv: any = await this.callQuerySafe(`SELECT * from conversation_participant cp INNER JOIN users_profile p on cp.user_id = p.user_id where cp.conversationId='${id}' and cp.user_id !='${userId}' `);
          // const conv: any = await this.getUserByUserId(conversations[i].conversationId);
          conversations[i].conversationName = conv[0]?.username || "";
          conversations[i].conversationIcon = conv[0]?.profile_pic || "";
        }
        conversations[i].chats = await this.getChats(conversations[i].conversationId);
        conversations[i].participants = []
        conversations[i].createdAt = conversations[i].created_at
        conversations[i].isGroup = true


      }
      return conversations;
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
}

export default ChatHelper;
