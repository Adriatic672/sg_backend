import MakerCheckerModel from '../models/makerChecker.model';

class MakerCheckerHelper {
  private model: MakerCheckerModel;

  constructor() {
    this.model = new MakerCheckerModel();
  }

  /**
   * Create a maker-checker request
   * @param operationType - CREATE, UPDATE, or DELETE
   * @param tableName - The database table name
   * @param primaryKeyValue - The primary key value (null for CREATE, required for UPDATE/DELETE)
   * @param userId - User ID of the maker
   * @param requestData - The data to be approved
   * @param approversRequired - Number of approvers needed (default: 1)
   */
  async createRequest(
    operationType: 'CREATE' | 'UPDATE' | 'DELETE',
    tableName: string,
    primaryKeyValue: string | null,
    userId: string,
    requestData: any,
    approversRequired: number = 1,
    metadata: any = null
  ) {
    return await this.model.createRequest({
      operation_type: operationType,
      table_name: tableName,
      primary_key_value: primaryKeyValue,
      userId: userId,
      request_data: requestData,
      approvers_required: approversRequired,
      metadata: metadata
    });
  }

  /**
   * Check if a request is approved and execute it
   * @param requestId - The request ID to check and execute
   */
  async executeIfApproved(requestId: string) {
    const request = await this.model.getRequestById(requestId);
    
    if (request.status !== 200) {
      return request;
    }

    if (request.data.status === 'approved') {
      return await this.model.executeApprovedRequest(requestId);
    } else if (request.data.status === 'rejected') {
      return { status: 400, message: 'Request has been rejected' };
    } else {
      return { status: 400, message: 'Request is still pending approval' };
    }
  }

  /**
   * Get all requests
   */
  async getRequests() {
    return await this.model.getRequests();
  }

  /**
   * Get specific request
   */
  async getRequest(requestId: string) {
    return await this.model.getRequestById(requestId);
  }

  /**
   * Action a request (approve or reject)
   */
  async actionRequest(requestId: string, userId: string, action: 'approved' | 'rejected') {
    return await this.model.actionRequest(requestId, userId, action);
  }

  /**
   * Get request actions
   */
  async getRequestActions(requestId: string) {
    return await this.model.getRequestActions(requestId);
  }
}

export default new MakerCheckerHelper();
