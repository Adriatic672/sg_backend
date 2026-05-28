import Model from "../helpers/model";
import { sendNotification } from '../helpers/FCM'
import DailyMessageGenerator from '../thirdparty/ChatGptAPI'
import { json } from "express";
import { response } from "express";

export default class Notifications extends Model {

  async getUnreadNotifications(userId: any) {
    try {
      const notifications: any = await this.selectDataQuery(`notifications`, `user_id='${userId}' AND status='unread'`, 15, `created_at DESC`)
      
      const processed = (notifications || []).map((notif: any) => {
        if (notif.message && typeof notif.message === 'string' && (notif.message.trim().startsWith('{') || notif.message.trim().startsWith('['))) {
          try {
            notif.message = JSON.parse(notif.message);
          } catch (e) {}
        }
        return notif;
      });

      return this.makeResponse(200, "Unread notifications retrieved successfully", {
        notifications: processed,
        pagination: { total: processed.length, limit: 15, offset: 0, hasMore: false }
      });
    } catch (error: any) {
      return this.makeResponse(500, "Error fetching unread notifications", { notifications: [] });
    }
  }
  async markAsRead(userId: any, notificationIds: any[]) {
    const response = await this.updateData('notifications', `id IN (${notificationIds.join(',')})`, { status: 'read' });
    return this.makeResponse(200, "Notifications marked as read", response);
  }
  constructor() {
    super();
  }

  async getNotifications(userId: string) {
    try {
      const notifications: any = await this.selectDataQuery(`notifications`, `user_id='${userId}'`, 15, `created_at DESC`)
      
      const processed = (notifications || []).map((notif: any) => {
        if (notif.message && typeof notif.message === 'string' && (notif.message.trim().startsWith('{') || notif.message.trim().startsWith('['))) {
          try {
            notif.message = JSON.parse(notif.message);
          } catch (e) {}
        }
        return notif;
      });

      return this.makeResponse(200, "Notifications retrieved successfully", {
        notifications: processed,
        pagination: { total: processed.length, limit: 15, offset: 0, hasMore: false }
      });
    } catch (error: any) {
      return this.makeResponse(500, "Error fetching notifications", { notifications: [] });
    }
  }
  async AIMessage() {
    const chat = new DailyMessageGenerator()
    const response: any = await chat.generateMessage()
    if (response.status == 'success') {
      const title = response.title
      const message = response.message
      console.log(`message`, message)
      //   const conversationId = `eQpfwJMWTQ-idrH_k9MLyh:APA91bFTUnhz_jbmlbiwX1Y6G_Yd8TcMUMUAtrBQlFQ-Xt--9kzIqpMAmbjtk6OnCqMq2ZfuNVFwgtYSHwUC5onwWpO3YOShlLWhwekGr-9gwpt4UWkKYrU`

      const conversationId = this.influencerChannel();
      //   const brandChannel = this.brandChannel();

      this.sendMessage({ message, title, conversationId })
    }

  }

  async sendMessage(data: any) {
    const { message, title, conversationId } = data;

    if (!message || !conversationId) {
      throw new Error("Missing required fields in data");
    }

    let fcmMessage = {
      title: title,
      body: message,
      messageType: "NOTIFICATION",
      conversationId: conversationId
    }

    const response = await sendNotification(conversationId, fcmMessage, true)
    this.saveNotification(title, conversationId, message, conversationId, response);

    console.log(`DEMO_RESPONSE`, response)

    return this.makeResponse(200, "Request sent to add members");
  }


}
