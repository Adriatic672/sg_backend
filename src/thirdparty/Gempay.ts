import axios, { AxiosError, AxiosInstance } from "axios";
import Model from "../helpers/model";

export interface PaymentProviderResponse {
  status: number;
  message: string;
  data: any;
}

export interface DepositRequest {
  reference: string;
  userId: string;
  amount: number;
  currency: string;
  phoneNumber?: string;
  redirectUrl?: string;
}

export interface PayoutRequest {
  reference: string;
  userId: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  accountName?: string;
  note?: string;
}

export default class GempayProvider {
  private axiosInstance: AxiosInstance;
  private model = new Model();

  constructor() {
    const baseURL = process.env.GEMPAY_BASE_URL || "http://localhost:9000";
    const token = process.env.GEMPAY_BEARER_TOKEN || process.env.GEMPAY_API_TOKEN || "";

    this.axiosInstance = axios.create({
      baseURL,
      timeout: Number(process.env.GEMPAY_TIMEOUT_MS || 30000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  get enabled(): boolean {
    return (process.env.PAYMENT_PROVIDER || "").toLowerCase() === "gempay"
      && Boolean(process.env.GEMPAY_BASE_URL);
  }

  private normaliseResponse(data: any, fallbackMessage: string): PaymentProviderResponse {
    const status = Number(data?.status ?? data?.statusCode ?? (data?.success === false ? 400 : 200));
    return {
      status,
      message: data?.message || fallbackMessage,
      data: data?.data ?? data,
    };
  }

  private handleError(error: unknown, fallbackMessage: string): PaymentProviderResponse {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>;
      if (axiosError.response?.data) {
        return this.normaliseResponse(axiosError.response.data, fallbackMessage);
      }
      return { status: 500, message: axiosError.message, data: null };
    }
    return { status: 500, message: fallbackMessage, data: null };
  }

  async initiateMobileDeposit(request: DepositRequest): Promise<PaymentProviderResponse> {
    const path = process.env.GEMPAY_DEPOSIT_PATH || "/pay/wallet/depositRequest";
    const payload = {
      userId: request.userId,
      amount: request.amount,
      currency: request.currency,
      payment_mode: "MOBILE_MONEY_DEPOSIT",
      idempotency_key: request.reference,
      redirect_url: request.redirectUrl,
      accountInfo: {
        phone_number: request.phoneNumber,
        currency: request.currency,
      },
      source: "SOCIAL_GEMS",
      callback_url: process.env.GEMPAY_SOCIALGEMS_WEBHOOK_URL,
      external_reference: request.reference,
    };

    try {
      this.model.logOperation("GEMPAY_DEPOSIT_REQUEST", request.reference, request.userId, payload);
      const response = await this.axiosInstance.post(path, payload);
      this.model.logOperation("GEMPAY_DEPOSIT_RESPONSE", request.reference, request.userId, response.data);
      return this.normaliseResponse(response.data, "Deposit request sent");
    } catch (error) {
      this.model.logOperation("GEMPAY_DEPOSIT_ERROR", request.reference, request.userId, this.handleError(error, "Gempay deposit failed"));
      return this.handleError(error, "Gempay deposit failed");
    }
  }

  async initiateMobilePayout(request: PayoutRequest): Promise<PaymentProviderResponse> {
    const path = process.env.GEMPAY_PAYOUT_PATH || "/pay/merchant/payout";
    const payload = {
      phone_number: request.phoneNumber,
      amount: request.amount,
      currency: request.currency,
      account_name: request.accountName || "",
      note: request.note || "SocialGems payout",
      reference: request.reference,
      userId: request.userId,
      source: "SOCIAL_GEMS",
      callback_url: process.env.GEMPAY_SOCIALGEMS_WEBHOOK_URL,
      external_reference: request.reference,
    };

    try {
      this.model.logOperation("GEMPAY_PAYOUT_REQUEST", request.reference, request.userId, payload);
      const response = await this.axiosInstance.post(path, payload);
      this.model.logOperation("GEMPAY_PAYOUT_RESPONSE", request.reference, request.userId, response.data);
      return this.normaliseResponse(response.data, "Payout request sent");
    } catch (error) {
      this.model.logOperation("GEMPAY_PAYOUT_ERROR", request.reference, request.userId, this.handleError(error, "Gempay payout failed"));
      return this.handleError(error, "Gempay payout failed");
    }
  }
}
