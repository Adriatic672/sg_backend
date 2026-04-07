import Model from "../helpers/model";
import { subscribeToTopic, unsubscribeFromTopic } from '../helpers/FCM'
import { getItem, setItem } from "../helpers/connectRedis";
import { uploadToS3 } from '../helpers/S3UploadHelper';
import { calculateWeightedScore } from "../helpers/campaign.helper";
import { stat } from "fs";
import * as crypto from 'crypto';
import ChatModel from "./chat.model";
import { logger } from '../utils/logger';

export default class Groups extends Model {
  async getObjectives() {
    const response = await this.callQuerySafe("SELECT * FROM objectives ORDER BY created_at DESC");
    return this.makeResponse(200, "success", response);
  }
  async addMembersToGroup(data: any) {
    const { group_id, user_ids } = data
    let groups: any = await this.callQuerySafe(`select * from sc_groups  where group_id='${group_id}'`);
    if (groups.length == 0) {
      return this.makeResponse(404, "group not found", { groupId: group_id });

    }
    if (!Array.isArray(data.user_ids) || data.user_ids.length === 0) {
      return this.makeResponse(400, "Invalid user_ids. It should be a non-empty array.");
    }
    const userIds = data.user_ids.map((id: string) => `'${id}'`).join(", ");
    const allUserProfiles: any = await this.callQuerySafe(`select user_id from users_profile where user_id IN (${userIds})`);
    for (let i = 0; i < allUserProfiles.length; i++) {
      const userId = allUserProfiles[i].user_id
      // pent this t send invites later
    //  await this.inviteMember({ groupId: group_id, userId, addedBy: "system" }, 'member', 'pending')
      await this.addMember({ groupId: group_id, userId, addedBy: userId }, 'member')
    }
    return this.makeResponse(200, "Request sent to add members", { groupId: group_id });
  }



  async createGroup(data: any, is_campaign_group = 'no') {
    try {
      logger.info("createGroup-1", data);
      const { name, description, rules, membership_type, userId } = data;
      if (!name || !description || !rules || !membership_type || !userId) {
        throw new Error("Missing required fields");
      }
      const banner_image_url = data.banner_image_url || ""
      const icon_image_url = data.icon_image_url || ""

      const group_id = "grp_" + this.getRandomString()
      const newGroup = {
        group_id,
        name,
        description,
        icon_image_url,
        banner_image_url,
        rules,
        is_campaign_group,
        membership_type,
        fcm_channel_id: group_id,
        created_by: userId
      };
      console.log("newGroup", newGroup);

      const insertedGroupId = await this.insertData("sc_groups", newGroup);
      if (insertedGroupId == false) {
        throw new Error("Group not added");
      }


      setItem(`fcm_${group_id}`, group_id)


      await this.addMember({ groupId: group_id, userId, addedBy: userId }, 'admin')
      new ChatModel().sendMessage({ conversationId: group_id, media: "", receiverId: group_id, username: userId, userId, text: 'user created group' })

      logger.info("createGroup-2", "Group created successfully");
      return this.makeResponse(200, "Group created successfully", { groupId: group_id });
    } catch (error) {
      logger.error("createGroup-4", "Error creating group");
      return this.makeResponse(500, "Error creating group");
    }
  }

  // Get all groups


  async getGroups(data: any) {
    try {
      const { userId } = data
      let groups: any = await this.getUserGroups(userId);
      for (let i = 0; i < groups.length; i++) {
        const members = await this.getGroupMembers(groups[i].group_id)
        logger.info(`members.data.length `, members.data.length)
        const memberCount = members.data.length || 1
        groups[i]['members'] = memberCount
      }
      return this.makeResponse(200, "success", groups);
    } catch (error) {
      console.error("Error in getGroups:", error);
      return this.makeResponse(500, "Error fetching groups");
    }
  }

  // Update a group
  async updateGroup(data: any) {
    const { groupId, icon_image_url, rules, userId, name, description, banner_image_url } = data
    try {
      const groupInfo = await this.getGroupById(groupId)
      if (groupInfo.length == 0) {
        return this.makeResponse(400, "Group not found");
      }

      const adminCheck = await this.selectDataQuery(
        "sc_group_members",
        `group_id='${groupId}' AND user_id='${userId}' AND role='admin'`
      );

      if (adminCheck.length === 0) {
        return this.makeResponse(403, "Only admins can perform this action");
      }

      let updateInfo: any = {}
      if (icon_image_url) updateInfo.icon_image_url = icon_image_url;
      if (banner_image_url) updateInfo.banner_image_url = banner_image_url;
      if (name) updateInfo.name = name;
      if (description) updateInfo.description = description;
      if (rules) updateInfo.rules = rules;
      updateInfo.updated_by = userId;

      const updatedGroup = await this.updateData("sc_groups", `group_id='${groupId}'`, updateInfo);
      logger.info("updateGroup-2", "Group updated successfully");
      return this.makeResponse(200, "Group updated successfully", updateInfo);
    } catch (error) {
      logger.error("updateGroup-3", "Error updating group");
      return this.makeResponse(500, "Error updating group");
    }
  }

  // Delete a group
  async deleteGroup(groupId: string) {
    try {
      await this.deleteData("sc_groups", `group_id='${groupId}'`);
      logger.info("deleteGroup-2", "Group deleted successfully");
      return this.makeResponse(200, "Group deleted successfully");
    } catch (error) {
      logger.error("deleteGroup-3", "Error deleting group");
      return this.makeResponse(500, "Error deleting group");
    }
  }



  // Get members of a group
  async getGroupMembers(groupId: string) {
    try {
      logger.info("getGroupMembers-1", { groupId });
      const members = await this.callQuerySafe(`select g.*,username,first_name,last_name,profile_pic,bio from sc_group_members g INNER JOIN users_profile p ON g.user_id=p.user_id where  group_id='${groupId}'`);
      logger.info("getGroupMembers-2", "Members retrieved successfully");
      return this.makeResponse(200, "Members retrieved successfully", members);
    } catch (error) {
      logger.error("getGroupMembers-3", "Error retrieving members");
      return this.makeResponse(500, "Error retrieving members");
    }
  }

  // Update a member's role or status
  async updateMember(data: any) {
    try {
      const { groupId, userId, updatedBy } = data
      // Check if the user updating is an admin
      const adminCheck = await this.selectDataQuery(
        "sc_group_members",
        `group_id='${groupId}' AND user_id='${updatedBy}' AND role='admin'`
      );

      if (adminCheck.length === 0) {
        return this.makeResponse(403, "Only admins can update members");
      }

      const updatedMember = await this.updateData(
        "sc_group_members",
        `group_id='${groupId}' AND user_id='${userId}'`,
        data
      );

      return this.makeResponse(200, "Member updated successfully", updatedMember);
    } catch (error) {
      console.error("Error in updateMember:", error);
      return this.makeResponse(500, "Error updating member");
    }
  }

  // Remove a member from a group
  async removeMember(data: any) {
    try {
      const { upId, userId, groupId, removedBy } = data
      // Check if the user removing is an admin
      const adminCheck = await this.selectDataQuery(
        "sc_group_members",
        `group_id='${groupId}' AND user_id='${removedBy}' AND role='admin'`
      );


      const groupInfo = await this.getGroupById(groupId)
      if (groupInfo.length == 0) {
        throw new Error("Group not found");
      }
      const memberInfo = await this.getUserById(userId)
      if (memberInfo.length == 0) {
        throw new Error("member not found");
      }

      if (adminCheck.length === 0) {
        return this.makeResponse(403, "Only admins can remove members");
      }

      const fcm_channel_id = groupInfo[0].fcm_channel_id
      const addMemberResponse = await unsubscribeFromTopic(memberInfo[0].fcm_token, groupId)
      logger.info(`removeMembersFromChannel`, addMemberResponse)

      await this.deleteData("sc_group_members", `group_id='${groupId}' AND user_id='${userId}'`);
      logger.info("removeMember-2", "Member removed successfully");
      return this.makeResponse(200, "Member removed successfully");

    } catch (error: any) {
      logger.error("removeMember-3", "Error removing member");
      return this.makeResponse(400, error.toString());
    }
  }




 



 

}

