import { logger } from "../utils/logger";

class SMSHelper {
    private africasTalkingConfig: {
        username: string;
        apiKey: string;
        shortCode: string | null;
        baseUrl: string;
    } | null = null;
    private smsTemplates: { [key: string]: string } = {};

    constructor() {
        this.initializeSMSClient();
    }
    initializeSMSClient() {
        const username = process.env.AFRICAS_TALKING_USERNAME || 'socialgems';
        const apiKey = process.env.AFRICAS_TALKING_API_KEY || "1234567890"
        const shortCode = process.env.AFRICAS_TALKING_SHORT_CODE || null
        const baseUrl = process.env.AFRICAS_TALKING_BASE_URL || 'https://api.africastalking.com/version1/messaging';
        try {
            if (username && apiKey) {
                this.africasTalkingConfig = {
                    username: username,
                    apiKey: apiKey,
                    shortCode: shortCode || null,
                    baseUrl: baseUrl
                };
            }
        } catch (error) {
            console.error('Failed to initialize SMS client:', error);
        }
    }


    isUgandaAirtelNumber(phone: string): boolean {
        // 1) Strip out spaces, dashes, parentheses, etc.
        const cleaned = phone.replace(/[\s\-\(\)]/g, '');

        // 2) Normalize to local “0XXXXXXXXX” format
        let local = cleaned;
        if (local.startsWith('+256')) {
            local = '0' + local.slice(4);
        } else if (local.startsWith('256')) {
            local = '0' + local.slice(3);
        }

        // 3) Check it’s 10 digits total and prefix is one of Airtel’s blocks:
        //    070X, 074X or 075X  (where X is 0–9) followed by 6 more digits.
        const airtelUgandaRegex = /^0(70[0-9]|74[0-9]|75[0-9])\d{6}$/;

        return airtelUgandaRegex.test(local);
    }

    async sendAFSMS(toPhone: string, message: string, from: string = "") {
        const to = "+" + toPhone
        try {

            if (!this.africasTalkingConfig) {
                throw new Error('Africa\'s Talking SMS client not initialized');
            }


            // Validate phone number
            if (!/^\+\d{10,15}$/.test(to)) {
                throw new Error('Invalid phone number format. Ensure it starts with "+" followed by 10-15 digits.');
            }



            // Prepare the request data
            const requestData = new URLSearchParams({
                username: this.africasTalkingConfig.username,
                to: to,
                message: message
            });

            // Add sender ID if provided or configured
            if (from) {
                requestData.append('from', from);
            } else if (this.africasTalkingConfig.shortCode) {
                requestData.append('from', this.africasTalkingConfig.shortCode);
            }

            // Make the API request
            const response = await fetch(this.africasTalkingConfig.baseUrl, {
                method: 'POST',
                headers: {
                    'apiKey': this.africasTalkingConfig.apiKey,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: requestData
            });

            const result = await response.json();

            if (result.SMSMessageData && result.SMSMessageData.Recipients && result.SMSMessageData.Recipients.length > 0) {
                const recipient = result.SMSMessageData.Recipients[0];

                if (recipient.status === 'Success') {
                    logger.info('SMS sent successfully:', recipient.messageId);
                    return {
                        success: true,
                        messageId: recipient.messageId
                    };
                } else {
                    throw new Error(`Failed to send SMS: ${recipient.status}`);
                }
            }

            throw new Error('Failed to send SMS: Invalid response from Africa\'s Talking');
        } catch (error) {
            console.error('Error sending SMS:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    private replaceTemplateVars(template: string, data: { [key: string]: string }): string {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] || match);
    }
}

export default new SMSHelper();