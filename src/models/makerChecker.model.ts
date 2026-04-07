import Model from "../helpers/model";
import { logger } from "../utils/logger";
import Admin from "./admin";

class MakerCheckerModel extends Model {
  
  /**
   * Create a new maker-checker request
   */
  async createRequest(data: any) {
    const requestId = this.getTrimedString(20);
    
    try {
      // Log the incoming data for debugging
      logger.info("Creating maker-checker request", {
        operation_type: data.operation_type,
        table_name: data.table_name,
        primary_key_value: data.primary_key_value,
        userId: data.userId,
        approvers_required: data.approvers_required,
        metadata: data.metadata
      });

      const requestData = {
        request_id: requestId,
        operation_type: data.operation_type, // CREATE, UPDATE, DELETE
        table_name: data.table_name,
        primary_key_value: data.primary_key_value || null,
        maker_user_id: data.userId,
        request_data: JSON.stringify(data.request_data),
        approvers_required: data.approvers_required || 1,
        approvers_approved: 0,
        status: 'pending',
        metadata: data.metadata
      };

      logger.info("Request data prepared", { requestData });
      await this.insertData("maker_checker_requests", requestData);
      logger.info("Maker-checker request inserted successfully", { requestId });
    } catch (error) {
      logger.error("Error in createRequest", error);
      logger.error("CreateRequest error details:", {
        operation_type: data.operation_type,
        table_name: data.table_name,
        userId: data.userId,
        requestId
      });
      throw error; // Re-throw to be caught by the calling function
    }
    
    // Add operation log
    await this.insertData("operation_logs", {
      user_id: data.userId,
      operation: 'MAKER_CHECKER_REQUEST_CREATED',
      details: JSON.stringify({
        request_id: requestId,
        operation_type: data.operation_type,
        table_name: data.table_name,
        primary_key_value: data.primary_key_value
      }),
      timestamp: new Date()
    });
    
    // Send email notification to admins
    try {
      const admins = await this.callQuerySafe(`SELECT email, first_name FROM admin_users WHERE status='active'`);
      for (const admin of (admins as any[])) {
        await this.sendEmail(
          'MAKER_CHECKER_REQUEST',
          admin.email,
          admin.first_name || 'Admin',
          '',
          {
            request_id: requestId,
            operation_type: data.operation_type,
            table_name: data.table_name,
            maker_user_id: data.userId
          }
        );
      }
    } catch (emailError) {
      console.error('Error sending maker-checker email notification:', emailError);
    }
    
    return this.makeResponse(200, "Request created", { request_id: requestId });
  }

  /**
   * Get all requests with their approvers/actors
   */
  async getRequests() {
    try{
    const requests = await this.callQuerySafe(`
      SELECT 
        r.*,
        GROUP_CONCAT(
          CONCAT(a.approver_user_id, ':', a.action, ':', a.approved_at, ':', COALESCE(a.notes, ''))
          SEPARATOR '|'
        ) as approvers
      FROM maker_checker_requests r
      LEFT JOIN maker_checker_approvals a ON r.request_id = a.request_id
      GROUP BY r.request_id
      ORDER BY r.date_sent DESC
    `);
    
    // Parse approvers data
    const formattedRequests = (requests as any[]).map((request: any) => {
      const approvers: any[] = [];
      if (request.approvers) {
        const approverStrings = request.approvers.split('|');
        approverStrings.forEach((approverStr: string) => {
          const [userId, action, approvedAt, notes] = approverStr.split(':');
          approvers.push({
            approver_user_id: userId,
            action: action,
            approved_at: approvedAt,
            notes: notes
          });
        });
      }
      
      return {
        ...request,
        approvers: approvers,
        request_data: request.request_data
      };
      });

      return this.makeResponse(200, "Requests retrieved", formattedRequests);
    } catch (error) {
      console.error("Error getting requests:", error);
      return this.makeResponse(500, "Error getting requests");
    }
  }

  /**
   * Get specific request by ID
   */
  async getRequestById(requestId: string) {
    const requests = await this.callQuerySafe(`
      SELECT 
        r.*,
        GROUP_CONCAT(
          CONCAT(a.approver_user_id, ':', a.action, ':', a.approved_at, ':', COALESCE(a.notes, ''))
          SEPARATOR '|'
        ) as approvers
      FROM maker_checker_requests r
      LEFT JOIN maker_checker_approvals a ON r.request_id = a.request_id
      WHERE r.request_id = '${requestId}'
      GROUP BY r.request_id
    `);
    
    if ((requests as any[]).length === 0) {
      return this.makeResponse(404, "Request not found");
    }

    const request = (requests as any[])[0];
    const approvers: any[] = [];
    if (request.approvers) {
      const approverStrings = request.approvers.split('|');
      approverStrings.forEach((approverStr: string) => {
        const [userId, action, approvedAt, notes] = approverStr.split(':');
        approvers.push({
          approver_user_id: userId,
          action: action,
          approved_at: approvedAt,
          notes: notes
        });
      });
    }

    return this.makeResponse(200, "Request found", {
      ...request,
      approvers: approvers,
      request_data: JSON.parse(request.request_data)
    });
  }

  /**
   * Approve or reject a request
   */
  async actionRequest(requestId: string, userId: string, action: 'approved' | 'rejected') {
    // Check if request exists
    const request = await this.selectDataQuery("maker_checker_requests", `request_id='${requestId}'`);
    if (request.length === 0) {
      return this.makeResponse(404, `Maker-checker request with ID '${requestId}' not found. The request may have been deleted or the ID may be incorrect.`);
    }

    // Check if already approved/rejected by this user
    const existingApproval = await this.selectDataQuery("maker_checker_approvals", 
      `request_id='${requestId}' AND approver_user_id='${userId}'`);
    
    if (existingApproval.length > 0) {
      const existingAction = existingApproval[0].action;
      const actionText = existingAction === 'approved' ? 'approved' : 'rejected';
      return this.makeResponse(400, `You have already ${actionText} this request. Each user can only act once on a request.`);
    }

    // Add approval/rejection record
    await this.insertData("maker_checker_approvals", {
      request_id: requestId,
      approver_user_id: userId,
      action: action,
      notes: ''
    });

    // Update request status
    const currentRequest = request[0];
    if (action === 'approved') {
      const currentApproved = currentRequest.approvers_approved + 1;
      const required = currentRequest.approvers_required;
      
      const updateData: any = {
        approvers_approved: currentApproved,
        date_last_approved: new Date()
      };

      if (currentApproved >= required) {
        updateData.status = 'approved';
        
        // Automatically execute the approved request
        try {
          const executionResult = await this.executeApprovedRequest(requestId);
          if (executionResult.status === 200) {
            updateData.status = 'executed';
            updateData.executed_at = new Date();
          }
        } catch (executionError) {
          logger.error("Error auto-executing approved request", { error: executionError, requestId });
          // Keep status as 'approved' but don't mark as executed
        }
      }

      await this.updateData("maker_checker_requests", `request_id='${requestId}'`, updateData);
    } else {
      // Rejected - immediately set status to rejected
      await this.updateData("maker_checker_requests", `request_id='${requestId}'`, {
        status: 'rejected',
        date_last_approved: new Date()
      });
    }

    // Add operation log for approval/rejection
    await this.insertData("operation_logs", {
      user_id: userId,
      operation: action === 'approved' ? 'MAKER_CHECKER_REQUEST_APPROVED' : 'MAKER_CHECKER_REQUEST_REJECTED',
      details: JSON.stringify({
        request_id: requestId,
        action: action
      }),
      timestamp: new Date()
    });

    return this.makeResponse(200, `Request ${action} successfully`);
  }

  /**
   * Get all actions/approvals for a specific request
   */
  async getRequestActions(requestId: string) {
    const actions = await this.callQuerySafe(`
      SELECT 
        a.*,
        up.first_name,
        up.last_name,
        up.username
      FROM maker_checker_approvals a
      LEFT JOIN users_profile up ON a.approver_user_id = up.user_id
      WHERE a.request_id = '${requestId}'
      ORDER BY a.approved_at ASC
    `);

    return this.makeResponse(200, "Request actions retrieved", actions);
  }

  /**
   * Execute approved request (for CREATE, UPDATE, DELETE operations)
   */
  async executeApprovedRequest(requestId: string) {
    const request = await this.getRequestById(requestId);
    if (request.status !== 200) {
      return request;
    }

    const requestData = request.data;
    const { operation_type, table_name, primary_key_value, request_data } = requestData;

    try {
      let result;
      
      // Special handling for delete account operations
      if (operation_type === 'DELETE' && table_name === 'users' && request_data.influencer_id) {
        // Import Admin model to use executeDeleteAccount
        const adminModel = new Admin()
        result = await adminModel.executeDeleteAccount(request_data);
      } else {
        // Standard operations
        switch (operation_type) {
          case 'CREATE':
            result = await this.insertData(table_name, request_data);
            break;
            
          case 'UPDATE':
            if (!primary_key_value) {
              return this.makeResponse(400, "Primary key value required for UPDATE operation");
            }
            result = await this.updateData(table_name, `id='${primary_key_value}'`, request_data);
            break;
            
          case 'DELETE':
            if (!primary_key_value) {
              return this.makeResponse(400, "Primary key value required for DELETE operation");
            }
            result = await this.deleteData(table_name, `id='${primary_key_value}'`);
            break;
            
          default:
            return this.makeResponse(400, "Invalid operation type");
        }
      }

      return this.makeResponse(200, `${operation_type} operation executed successfully`, result);
    } catch (error) {
      logger.error("Error executing maker-checker request", { error, requestId, operation_type: requestData.operation_type, table_name: requestData.table_name });
      return this.makeResponse(500, `Failed to execute ${requestData.operation_type} operation on ${requestData.table_name}. Please check the logs for details.`);
    }
  }
}

export default MakerCheckerModel;
