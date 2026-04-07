import axios, { AxiosInstance, AxiosError } from 'axios';
import Model from '../helpers/model';


interface emResponse {
  status: number;    // 200 if API response "success" is true, 400 if false
  message: string;   // API's "message" field
  data: any;         // Entire API response data
}

class RelworxMobileMoney {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.RELWORX_URL || 'https://payments.relworx.com/api/mobile-money',
      headers: {
        'Authorization': `Bearer ${process.env.RELWORX_API_KEY}`,
        'Accept': 'application/vnd.relworx.v2',
        'Content-Type': 'application/json',
      },


    });
    console.log(`RelworxMobileMoney initialized with base URL`, {
      'Authorization': `Bearer ${process.env.RELWORX_API_KEY}`,
      'Accept': 'application/vnd.relworx.v2',
      'Content-Type': 'application/json',
    })
  }


  private transformResponse(apiData: any): emResponse {
    console.log(`transformResponse`, apiData)
    const { success, message } = apiData;
    const status = success ? 200 : 400;
    return {
      status,
      message,
      data: apiData,
    };
  }

  /**
   * Handles any Axios errors by checking for an API response.
   *
   * @param error The error thrown by Axios
   */
  private handleError(error: unknown): emResponse {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response && axiosError.response.data) {
        // Transform the response from the API (which may contain a "success" field)
        return this.transformResponse(axiosError.response.data);
      } else {
        return {
          status: 400,
          message: axiosError.message,
          data: null,
        };
      }
    } else {
      return {
        status: 400,
        message: 'An unexpected error occurred.',
        data: null,
      };
    }
  }

  public async requestPayment(
    reference: string,
    msisdn: string,
    currency: string,
    amount: number,
    description?: string
  ): Promise<emResponse> {
    const thirdpartyAccount = process.env.REL_ACCOUNT_NUMBER || ""
    const payload = {
      account_no: thirdpartyAccount,
      reference,
      msisdn,
      currency,
      amount,
      description,
    };

    try {
      new Model().logOperation("RELWORX_COLLECTION_PAYMENT", reference, thirdpartyAccount, payload)
      const response = await this.axiosInstance.post('/request-payment', payload);
      console.log('requestPayment success:', response.data);
      new Model().logOperation("RELWORX_COLLECTION_PAYMENT", reference, thirdpartyAccount, "", JSON.stringify(response.data))
      return this.transformResponse(response.data);
    } catch (error) {
      console.error('requestPayment error:', error);
      return this.handleError(error);
    }
  }


  public async sendPayment(
    reference: string,
    msisdn: string,
    currency: string,
    amount: number,
    description?: string
  ): Promise<emResponse> {
    const thirdpartyAccount = process.env.REL_ACCOUNT_NUMBER || ""
    const payload = {
      account_no: thirdpartyAccount,
      reference,
      msisdn,
      currency,
      amount,
      description,
    };
    console.log(`sendPaymentInformation`, payload)

    try {
      new Model().logOperation(`MOBILE_MONEY`, reference, thirdpartyAccount, payload)
      const response = await this.axiosInstance.post('/send-payment', payload);
      console.log('sendPayment success:', response.data);
      try {
        new Model().logOperation(`MOBILE_MONEY`, reference, "", "", JSON.stringify(response.data))
      } catch (error) {

      }
      return this.transformResponse(response.data);
    } catch (error) {
      console.error('sendPayment error:', error);
      return this.handleError(error);
    }
  }


  public async validateNumber(msisdn: string): Promise<emResponse> {
    const payload = { msisdn };

    try {
      const response = await this.axiosInstance.post('/validate', payload);
      console.log('validateNumber success:', response.data);
      return this.transformResponse(response.data);
    } catch (error) {
      console.error('validateNumber error:', error);
      return this.handleError(error);
    }
  }


  public async getWalletBalance(accountNo: string, currency: string): Promise<emResponse> {
    const payload = { account_no: accountNo, currency };

    try {
      const response = await this.axiosInstance.post('/check-balance', payload);
      console.log('getWalletBalance success:', response.data);
      return this.transformResponse(response.data);
    } catch (error) {
      console.error('getWalletBalance error:', error);
      return this.handleError(error);
    }
  }


  public async checkRequestStatus(accountNo: string, reference: string): Promise<emResponse> {
    const payload = { account_no: accountNo, reference };

    try {
      const response = await this.axiosInstance.post('/check-status', payload);
      console.log('checkRequestStatus success:', response.data);
      return this.transformResponse(response.data);
    } catch (error) {
      console.error('checkRequestStatus error:', error);
      return this.handleError(error);
    }
  }
}

export default RelworxMobileMoney;
