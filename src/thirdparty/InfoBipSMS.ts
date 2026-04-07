// src/services/InfoBipSMS.ts

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

interface InfoBipConfig {
  apiKey: string;
  baseUrl: string;
  applicationId?: string;
  whatsAppSender?: string;
}

class InfoBipSMS {
  private config: InfoBipConfig | null = null;
  private client: AxiosInstance | null = null;

  constructor() {
    this.initializeInfoBipClient();
  }

  private initializeInfoBipClient(): void {
    const apiKey = process.env.INFOBIP_API_KEY || "d36977b7dd09e2901bfe06c96e4be92b-d03af84e-edac-413d-b37c-1f1febeb9252";
    const rawBase = process.env.INFOBIP_BASE_URL || 'https://3oz1ld.api.infobip.com/';
    const baseUrl = rawBase.replace(/\/+$/, ''); // strip trailing slash
    const applicationId = process.env.INFOBIP_APPLICATION_ID || 'SocialGems';
    const whatsAppSender = process.env.INFOBIP_WHATSAPP_SENDER;

    if (!apiKey) {
      console.error('InfoBip API key is missing');
      return;
    }

    this.config = { apiKey, baseUrl, applicationId, whatsAppSender };
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `App ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 10_000,
    });
  }

  /** Send an SMS via InfoBip */
  async sendSMS(
    toPhone: string,
    message: string,
    from: string = 'InfoSMS'
  ): Promise<
    | { success: true; messageId: string; status: any }
    | { success: false; error: string }
  > {
    if (!this.client || !this.config) {
      return { success: false, error: 'InfoBip client not initialized' };
    }

    const to = "+" + toPhone
    if (!/^\+\d{10,15}$/.test(to)) {
      return {
        success: false,
        error: 'Invalid phone number format. Must start with "+" and include 10–15 digits.',
      };
    }

    const payload = {
      messages: [
        {
          destinations: [{ to }],
          from,
          text: message,
        },
      ],
    };

    try {
      const resp = await this.client.post('/sms/2/text/advanced', payload);
      const result = resp.data;
      console.log("STEP1-SMS", result)  
      const sent = result.messages?.[0];
      if (sent && sent.status?.groupId === 1) {
        console.log("STEP2-SMS", sent)
        return { success: true, messageId: sent.messageId, status: sent.status };
      } else {
        const desc = sent?.status?.description || 'Unknown error';
        return { success: false, error: `Failed to send SMS: ${desc}` };
      }
    } catch (err: any) {
      console.log("STEP3-SMS", err)
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Unknown error sending SMS';
      logger.error('Error sending SMS:', msg);
      return { success: false, error: msg };
    }
  }

  /** Create a 2FA application */
  async create2FAApplication(
    name: string = '2FA Application'
  ): Promise<
    | { success: true; data: any }
    | { success: false; error: string }
  > {
    if (!this.client) {
      return { success: false, error: 'InfoBip client not initialized' };
    }

    const payload = {
      name,
      enabled: true,
      configuration: {
        pinAttempts: 10,
        allowMultiplePinVerifications: true,
        pinTimeToLive: '15m',
        verifyPinLimit: '1/3s',
        sendPinPerApplicationLimit: '100/1d',
        sendPinPerPhoneNumberLimit: '10/1d',
      },
    };

    try {
      const resp = await this.client.post('/2fa/2/applications', payload);
      logger.info('2FA application created:', resp.data);
      return { success: true, data: resp.data };
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Unknown error creating 2FA application';
      logger.error('Error creating 2FA app:', msg);
      return { success: false, error: msg };
    }
  }

  async sendWhatsAppTemplate(
    to: string,
    placeholders: number,
    language: string = 'en',
  ) : Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> { 


    const newTo = "+" + to
    const sender = '447860034985';
    if (!/^\+\d{10,15}$/.test(newTo)) {
      return {
        success: false,
        error:
          'Invalid phone number. Must start with "+" and include 10–15 digits.',
      };
    }

    // build the template payload


    let data = JSON.stringify({
      "messages": [
        {
          "from": "447860034985",
          "to": newTo,
          "content": {
            "templateName": "gems_number_verification",
            "templateData": {
              "body": {
                "placeholders": [
                  placeholders
                ]
              },
              "buttons": [
                {
                  "type": "URL",
                  "parameter": placeholders
                }
              ]
            },
            "language": "en_US"
          }
        }
      ]
    });

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://3oz1ld.api.infobip.com/whatsapp/1/message/template',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'App d36977b7dd09e2901bfe06c96e4be92b-d03af84e-edac-413d-b37c-1f1febeb9252'
      },
      data: data
    };

    try {

      const response = await axios.request(config)
      const result = response.data;
      console.log("STEP1-WHATSAPP-TEMPLATE", result)
      const sent = result.messages?.[0];
      if (sent && sent.status?.groupId === 1) {
        console.log("STEP2-WHATSAPP-TEMPLATE", sent)
        return { success: true, data: response.data };
      } else {
        console.log("STEP2-WHATSAPP-TEMPLATE", sent)
        const desc = sent?.status?.description || 'Unknown error';
        return { success: false, error: `Failed to send SMS: ${desc}` };
      }
    } catch (err: any) {
      console.log("STEP3-WHATSAPP-TEMPLATE", err)
      return { success: false, error: `Failed to send SMS: ${err.response?.data.messages[0].status}` };
    }

  }

}

export default new InfoBipSMS();
