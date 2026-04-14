import Model from "../helpers/model";
import { subscribeToTopic, unsubscribeFromTopic } from '../helpers/FCM';
import { getItem, setItem } from "../helpers/connectRedis";
import Stripe from 'stripe';
import RelworxMobileMoney from "../thirdparty/Relworx";
import crypto from 'crypto';
import { logger } from '../utils/logger';
import cloudWatchLogger from '../helpers/cloudwatch.helper';

const mm = new RelworxMobileMoney()

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      if (process.env.ENVIRONMENT === 'production') throw new Error('STRIPE_SECRET_KEY is not configured');
      console.warn('[StripeMock] Using mock Stripe instance');
      _stripe = {
        subscriptions: { list: async () => ({ data: [] }) },
        paymentIntents: { retrieve: async () => ({ status: 'succeeded', amount: 1000 }) },
        checkout: { sessions: { create: async () => ({ url: 'http://mock-url', id: 'mock_session_id' }) } }
      } as any;
    } else {
      _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
    }
  }
  return _stripe!;
}

export default class Payments extends Model {

  constructor() {
    super();
  }

  async handleUserLogin(data: any) {
    logger.info(`handleUserLogin`, data)
    const { userId, ip } = data;
    this.saveApiLog(data)
    const today = new Date().toISOString().split("T")[0];

    // Insert login only if not already logged in today
    try {
      this.callParameterizedQuery(
        "INSERT IGNORE INTO user_logins (user_id, login_date, ip_address) VALUES (?, ?, ?)",
        [userId, today, ip]
      )
    } catch (e) {
      console.error("Error inserting login:", e);
    }

    const streakRow = await this.selectDataQuery("user_streaks", `user_id='${userId}'`)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    if (streakRow.length === 0) {

      // First streak entry
      this.callParameterizedQuery(
        "INSERT INTO user_streaks (user_id, streak_count, last_activity_date) VALUES (?, ?, ?)",
        [userId, 1, today]
      );
    } else if (streakRow[0].last_activity_date === today) {
      // Already updated today, do nothing
      return;
    } else if (streakRow[0].last_activity_date === yesterdayStr) {
      const streak = streakRow[0];
      this.callParameterizedQuery(
        "UPDATE user_streaks SET streak_count = ?, last_activity_date = ? WHERE user_id = ?",
        [streak.streak_count + 1, today, userId]
      );

      const currentStreak = streak.streak_count + 1;

      if (currentStreak == 2) {
        this.rewardGems(userId, 5, "3 DAY STREAK REWARD")
        this.callParameterizedQuery(
          "UPDATE user_streaks SET streak_count = 1, last_activity_date = ? WHERE user_id = ?",
          [today, userId]
        );
      }

      if (currentStreak == 7) {
        this.rewardGems(userId, 20, "7 DAY STREAK REWARD")
        this.callParameterizedQuery(
          "UPDATE user_streaks SET streak_count = 1, last_activity_date = ? WHERE user_id = ?",
          [today, userId]
        );
      }
    } else {
      // Missed a day, reset streak
      this.callParameterizedQuery(
        "UPDATE user_streaks SET streak_count = 1, last_activity_date = ? WHERE user_id = ?",
        [today, userId]
      );
    }


  }




  async validateUserAccount(data: any) {
    const { account_number, pay_method, currency } = data;
    if (pay_method == "MOBILE_MONEY") {
      const accountInfo = await mm.validateNumber(account_number)
      return accountInfo
    }
    return this.makeResponse(400, `Invalid payment method`);
  }

  async webhookRel(data: any) {
    try {
      console.log(`webhookRel`, data)
      const { status, customer_reference } = data;
      this.logOperation("RELWORX_WEBHOOK", data.internal_reference, data.customer_reference, data)

      if (!customer_reference) {
        return this.makeResponse(400, "Internal reference is required");
      }

      // Retrieve the transaction using the internal reference
      const transaction: any = await this.callQuerySafe(`SELECT * FROM wl_transactions WHERE trans_id='${customer_reference}'`);
      if (transaction.length === 0) {
        return this.makeResponse(404, "Transaction not found");
      }
      const trans_type = transaction[0].trans_type
      if (trans_type == "DEPOSIT") {
        const updatedStatus = status === "success" ? "success" : "failed";
        const amount = transaction[0].cr_amount
        return await this.completePendingDeposit(customer_reference, amount, updatedStatus);

      } else {

        // Update the transaction status based on the webhook data
        const updatedStatus = status === "success" ? "SUCCESS" : "FAILED";
        await this.updateData('wl_transactions', `trans_id='${customer_reference}'`, { status: updatedStatus });
        return this.makeResponse(200, "Transaction status updated successfully");
      }
    } catch (error: any) {
      cloudWatchLogger.error("Error handling webhook", error, { data });
      return this.makeResponse(500, "Error handling webhook");
    }
  }


  async getRate(from_currency: string, to_currency: string) {
    if (from_currency == to_currency) {
      return 1;
    }
    const rates = await this.selectDataQuery("exchange_rates", `from_currency='${from_currency}' AND to_currency='${to_currency}'`);
    return rates.length > 0 ? rates[0].rate : 0
  }

  async fetchAndUpdateExchangeRates() {
    try {
      console.log("🔄 Fetching supported currencies and updating exchange rates...");

      // Get supported currencies from database
      const supportedCurrencies = await this.selectDataQuery("supported_currencies", "status=1");

      if (supportedCurrencies.length === 0) {
        return this.makeResponse(404, "No supported currencies found");
      }

      console.log(`📊 Found ${supportedCurrencies.length} supported currencies:`, supportedCurrencies.map((c: any) => c.currency));

      const baseCurrency = 'USD'; // Use USD as base currency
      const exchangeRates = [];

      // For each supported currency, get exchange rate from USD
      for (const currency of supportedCurrencies) {
        if (currency.currency === baseCurrency) continue;

        try {
          // Get rate from external API (using exchangerate-api.com as example)
          const rate = await this.fetchExchangeRateFromAPI(baseCurrency, currency.currency);

          if (rate > 0) {
            exchangeRates.push({
              from_currency: baseCurrency,
              to_currency: currency.currency,
              rate: rate,
              markup: 0.00,
              updated_at: new Date()
            });

            // Also add reverse rate
            exchangeRates.push({
              from_currency: currency.currency,
              to_currency: baseCurrency,
              rate: 1 / rate,
              markup: 0.00,
              updated_at: new Date()
            });
          }
        } catch (error) {
          console.error(`❌ Failed to fetch rate for ${currency.currency}:`, error);
        }
      }

      // Insert/update exchange rates
      let insertedCount = 0;
      for (const rate of exchangeRates) {
        try {
          // Check if rate already exists
          const existingRate = await this.selectDataQuery(
            "exchange_rates",
            `from_currency='${rate.from_currency}' AND to_currency='${rate.to_currency}'`
          );

          if (existingRate.length > 0) {
            // Update existing rate
            await this.updateData(
              "exchange_rates",
              `from_currency='${rate.from_currency}' AND to_currency='${rate.to_currency}'`,
              { rate: rate.rate, updated_at: rate.updated_at }
            );
          } else {
            // Insert new rate
            await this.insertData("exchange_rates", rate);
            insertedCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to insert rate ${rate.from_currency}->${rate.to_currency}:`, error);
        }
      }

      return this.makeResponse(200, `Exchange rates updated successfully. ${insertedCount} new rates added.`, {
        totalRates: exchangeRates.length,
        newRates: insertedCount,
        currencies: supportedCurrencies.map((c: any) => c.currency)
      });

    } catch (error) {
      console.error("❌ Error updating exchange rates:", error);
      return this.makeResponse(500, "Error updating exchange rates");
    }
  }

  private async fetchExchangeRateFromAPI(fromCurrency: string, toCurrency: string): Promise<number> {
    try {
      // Using exchangerate-api.com (free tier)
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
      const data = await response.json();

      if (data.rates && data.rates[toCurrency]) {
        return data.rates[toCurrency];
      }

      throw new Error(`Rate not found for ${fromCurrency} to ${toCurrency}`);
    } catch (error) {
      console.error(`❌ API fetch failed for ${fromCurrency}->${toCurrency}:`, error);
      return 0;
    }
  }



  async getExchangeRate(data: any) {
    try {
      const { from_currency, to_currency } = data;

      if (!from_currency || !to_currency) {
        return this.makeResponse(400, "From currency and to currency are required");
      }

      // Hardcoded exchange rate for now
      const exchangeRate = await this.getRate(from_currency, to_currency);

      return this.makeResponse(200, "Exchange rate retrieved successfully", {
        from_currency,
        to_currency,
        rate: exchangeRate,
      });
    } catch (error: any) {
      cloudWatchLogger.error("Error retrieving exchange rate", error, { data });
      return this.makeResponse(500, "Error retrieving exchange rate");
    }
  }

  private hashPin(pin: string): string {
    return crypto.createHash('sha256').update(pin).digest('hex');
  }


  async setTransactionPin(data: any) {
    try {
      const { userId, pin, confirm_pin } = data;
      if (!userId || !pin) {
        return this.makeResponse(400, "User ID and PIN are required");
      }
      if (pin !== confirm_pin) {
        return this.makeResponse(400, "PIN and confirm PIN do not match");
      }

      // Hash the PIN using SHA-256.
      const hashedPin = this.hashPin(pin);
      await this.updateData('user_wallets', `user_id= '${userId}'`, { wallet_pin: hashedPin });
      return this.makeResponse(200, "Transaction PIN set successfully");
    } catch (error: any) {
      cloudWatchLogger.error("Error setting transaction PIN", error, { data });
      return this.makeResponse(500, "Error setting transaction PIN");
    }
  }


  async isAccountLocked(userId: string) {
    const userResult: any = await this.callQuerySafe(`SELECT wallet_pin FROM user_wallets WHERE user_id='${userId}'`);
    if (userResult.length === 0) {
      return this.makeResponse(404, "User not found");
    }
    const user = userResult[0];
    const status = user.status;
    const deactivated_until = user.deactivated_until;
    const remainingTime = deactivated_until ? Math.ceil((new Date(deactivated_until).getTime() - new Date().getTime()) / (1000 * 60)) : 0;
    if (status == "onhold" || remainingTime > 0) {
      const isUnlocked = await this.unlockWallet(userId);
      if (!isUnlocked) {
        return this.makeResponse(403, `Account is locked due to multiple failed PIN attempts. Try again after ${remainingTime} minutes.`);
      }
    }
    return false;
  }
  async validatePin(userId: string, pin: string) {
    try {
      if (!userId || !pin) {
        return this.makeResponse(400, "User ID and PIN are required");
      }

      // Fetch user PIN


      // Fetch pin attempt record
      const attemptResult: any = await this.callQuerySafe(`
        SELECT failed_attempts, lock_time, last_failed_attempt 
        FROM pin_attempts 
        WHERE user_id='${userId}'
      `);

      const userResult: any = await this.callQuerySafe(`SELECT wallet_pin FROM user_wallets WHERE user_id='${userId}'`);
      if (userResult.length === 0) {
        return this.makeResponse(404, "User not found");
      }
      const user = userResult[0];
      const now = new Date();
      let failedAttempts = 0;
      let lockTime: Date | null = null;
      let lastFailed: Date | null = null;

      if (attemptResult.length > 0) {
        failedAttempts = attemptResult[0].failed_attempts;
        lockTime = attemptResult[0].lock_time ? new Date(attemptResult[0].lock_time) : null;
        lastFailed = attemptResult[0].last_failed_attempt ? new Date(attemptResult[0].last_failed_attempt) : null;

        if (lockTime && (now.getTime() - lockTime.getTime()) < 86400000) {
          return this.makeResponse(403, "Account is locked due to multiple failed PIN attempts. Try again after 24 hours.");
        }

        if (lockTime && (now.getTime() - lockTime.getTime()) >= 86400000) {
          // Unlock after 24 hours
          await this.callQuerySafe(`DELETE FROM pin_attempts WHERE user_id = '${userId}'`);
          failedAttempts = 0;
          lockTime = null;
          lastFailed = null;
        }
      }

      const within3Minutes = lastFailed && (now.getTime() - lastFailed.getTime()) < 180000;

      // Show warnings


      const hashedInputPin = this.hashPin(pin);
      const pinValid = user.wallet_pin === hashedInputPin;

      if (!pinValid) {
        const newAttempts = within3Minutes ? failedAttempts + 1 : 1;

        if (newAttempts >= 5) {
          const lockNow = now.toISOString().slice(0, 19).replace('T', ' ');
          if (attemptResult.length > 0) {
            await this.callQuerySafe(`
              UPDATE pin_attempts
              SET failed_attempts = ${newAttempts}, lock_time = '${lockNow}', last_failed_attempt = NOW()
              WHERE user_id = '${userId}'
            `);
          } else {
            await this.callQuerySafe(`
              INSERT INTO pin_attempts (user_id, failed_attempts, lock_time, last_failed_attempt)
              VALUES ('${userId}', ${newAttempts}, '${lockNow}', NOW())
            `);
          }

          return this.makeResponse(403, "Account is now locked due to multiple failed PIN attempts. Try again after 24 hours.");
        }

        // Update failed attempts if under 5
        if (attemptResult.length > 0) {
          await this.callQuerySafe(`
            UPDATE pin_attempts
            SET failed_attempts = ${newAttempts}, last_failed_attempt = NOW()
            WHERE user_id = '${userId}'
          `);
        } else {
          await this.callQuerySafe(`
            INSERT INTO pin_attempts (user_id, failed_attempts, last_failed_attempt)
            VALUES ('${userId}', 1, NOW())
          `);
        }

        if (within3Minutes && failedAttempts === 3) {
          return this.makeResponse(403, "You have 2 attempts left. Please try again.");
        }
        if (within3Minutes && failedAttempts === 4) {
          return this.makeResponse(403, "You have 1 attempt left. Please try again.");
        }

        return this.makeResponse(401, "Invalid PIN");
      }

      // On success, reset
      await this.callQuerySafe(`DELETE FROM pin_attempts WHERE user_id = '${userId}'`);

      return this.makeResponse(200, "PIN validated successfully");

    } catch (error: any) {
      console.error("Error validating PIN:", error.message);
      return this.makeResponse(500, "Error validating PIN");
    }
  }




  async getTransactionById(transactionId: string) {
    try {
      logger.info(`transactionId`, transactionId)
      if (!transactionId) {
        return this.makeResponse(400, "Transaction ID is required");
      }

      const transaction: any = await this.callQuerySafe(`SELECT * FROM wl_transactions WHERE trans_id='${transactionId}'`);
      if (transaction.length === 0) {
        return this.makeResponse(404, "Transaction not found");
      }

      return this.makeResponse(200, "Transaction retrieved successfully", transaction[0]);
    } catch (error: any) {
      console.error("Error retrieving transaction:", error.message);
      return this.makeResponse(500, "Error retrieving transaction", { error: error.message });
    }
  }

  async unlockWallet(userId: string) {
    try {
      if (!userId) {
        return false;
      }

      // Check if user exists
      const userInfo: any = await this.getUserById(userId);
      if (!userInfo || userInfo.length === 0) {
        return false;
      }

      // Get wallet info
      const walletInfo: any = await this.callQuerySafe(`SELECT * FROM user_wallets WHERE user_id='${userId}'`);
      if (!walletInfo || walletInfo.length === 0) {
        return false;
      }

      const wallet = walletInfo[0];
      const deactivatedUntil = wallet.deactivated_until;

      if (!deactivatedUntil) {
        return false;
      }

      const now = new Date();
      const deactivatedDate = new Date(deactivatedUntil);

      if (now < deactivatedDate) {
        const minutesLeft = Math.ceil((deactivatedDate.getTime() - now.getTime()) / (60 * 1000));
        return false;
      }

      // Remove any pin_attempts for this user
      await this.callQuerySafe(`DELETE FROM pin_attempts WHERE user_id = '${userId}'`);

      // Set wallet status to 'active' and clear deactivated_until
      await this.updateData('user_wallets', `user_id='${userId}'`, { status: 'active', deactivated_until: null });

      return true;
    } catch (error: any) {
      console.error("Error unlocking wallet:", error.message);
      return false;
    }
  }

  async resetTransactionPIN(data: any) {
    try {
      this.logOperation("RESET_TRANSACTION_PIN", data.userId, data.newPin, data);
      const { userId, emailCode, phoneCode, newPin, confirmPin } = data;
      if (!userId) {
        return this.makeResponse(400, "User ID is required");
      }
      if (!emailCode && !phoneCode) {
        return this.makeResponse(400, "Email code or phone code is required");
      }


      const userInfo: any = await this.getUserCompleteprofile(userId);

      if (userInfo.length === 0) {
        return this.makeResponse(400, "User not found");
      }

      const verifyEmail = await this.verifyPhone(emailCode, userInfo[0].email, userId);
      const verifyPhone = await this.verifyPhone(phoneCode, userInfo[0].phone, userId);
      if (!verifyEmail) {
        return this.makeResponse(400, "Email code is invalid");
      }
      if (!verifyPhone) {
        return this.makeResponse(400, "Phone code is invalid");
      }

      if (newPin !== confirmPin) {
        return this.makeResponse(400, "New PIN and confirm PIN do not match");
      }

      const user: any = await this.callQuerySafe(`SELECT wallet_pin FROM user_wallets WHERE user_id='${userId}'`);
      if (user.length === 0) {
        return this.makeResponse(404, "User not found");
      }

      const hashedNewPin = this.hashPin(newPin);

      const email = userInfo[0].email;
      const first_name = userInfo[0].first_name;


      // Set deactivated_until to 24 hours from now
      const deactivated_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await this.updateData('user_wallets', `user_id='${userId}'`, { wallet_pin: hashedNewPin });
      await this.updateData('user_wallets', `user_id='${userId}'`, { "status": "onhold", "deactivated_until": deactivated_until });
      this.sendEmail("PIN_RESET", email, first_name, "");
      return this.makeResponse(200, "Transaction PIN reset successfully");

    } catch (error: any) {
      console.error("Error resetting transaction PIN:", error.message);
      return this.makeResponse(500, "Error resetting transaction PIN", { error: error.message });
    }
  }
  async verifyPhone(otp: any, email: any, userId: any) {
    try {
      const users: any = await this.selectDataQuery("user_otp", `account_no='${email}' and otp='${otp}' `);
      if (users.length === 0) {
        return false;
      }
      return true;
    } catch (error: any) {
      console.error("Error verifying phone:", error.message);
      return false;
    }
  }



  async changeTransactionPin(data: any) {
    try {
      const { userId, oldPin, newPin, confirmPin } = data;
      if (!userId) {
        return this.makeResponse(400, "User ID is required");
      }
      if (!oldPin || !newPin || !confirmPin) {
        return this.makeResponse(400, "Old PIN, new PIN, and confirm PIN are required");
      }
      if (newPin !== confirmPin) {
        return this.makeResponse(400, "New PIN and confirm PIN do not match");
      }

      // Retrieve the user's current hashed PIN from the database.
      const user: any = await this.callQuerySafe(`SELECT wallet_pin FROM user_wallets WHERE user_id='${userId}'`);
      if (user.length === 0) {
        return this.makeResponse(404, "User not found");
      }

      // Validate the old PIN.
      const hashedOldPin = this.hashPin(oldPin);
      if (user[0].wallet_pin !== hashedOldPin) {
        return this.makeResponse(401, "Invalid old PIN");
      }

      // Hash the new PIN.
      const hashedNewPin = this.hashPin(newPin);
      await this.updateData('user_wallets', `user_id = '${userId}'`, { wallet_pin: hashedNewPin });
      return this.makeResponse(200, "Transaction PIN reset successfully");
    } catch (error: any) {
      console.error("Error resetting transaction PIN:", error.message);
      return this.makeResponse(500, "Error resetting transaction PIN", { error: error.message });
    }
  }

  async getUserWallet(userId: string, currency: string) {
    const wallet = await this.GenerateCurrencyWallet(userId, currency);
    return wallet;
  }

  async GetWallet(userId: string, currency: string) {
    const wallet = await this.GenerateCurrencyWallet(userId, currency);
    logger.info("wallet", wallet)
    if (wallet == false) {
      return this.makeResponse(404, "wallet not failed");
    }

    return this.makeResponse(200, "success", wallet);
  }

  async getTransactionStatement(data: any) {
    try {
      const { userId, currency } = data;

      const wallet_id = await this.getWalletInfoByUserId(userId, currency)
      if (!wallet_id) {
        //  return this.makeResponse(404, "Wallet not found", []);
      }
      const transactions: any = await this.callQuerySafe(`select * from wl_transactions where (dr_wallet_id='${wallet_id}' or cr_wallet_id='${wallet_id}') and status!='PENDING' order by id desc`);

      let transaction_statement = []
      for (const transaction of transactions) {
        const dr_wallet_id = transaction.dr_wallet_id
        let op_type = "CREDIT"
        let account_name = transaction.account_name
        if (dr_wallet_id == wallet_id) {
          op_type = "DEBIT"
          if (transaction.payment_method == 'WALLET') {
            const walletInfo = await this.getWalletInfoByWalletId(dr_wallet_id)
            if (walletInfo != null) {
              account_name = walletInfo.first_name + " " + walletInfo.last_name
            } else {
              account_name = ""
            }
          }
        }
        transaction.op_type = op_type
        transaction.status = transaction.status.toLowerCase()
        transaction.account_name = account_name
        transaction_statement.push(transaction)
      }

      return this.makeResponse(200, "Transaction statement retrieved successfully", transaction_statement);
    } catch (error: any) {
      console.error("Error retrieving transaction statement:", error.message);
      return this.makeResponse(500, "Error retrieving transaction statement", { error: error.message });
    }
  }

  async getWalletInfoByUserId(userId: string, asset: string) {
    const walletInfo: any = await this.callQuerySafe(`select wallet_id from user_wallets where user_id='${userId}' and asset='${asset}'`);
    if (walletInfo.length == 0) {
      return null
    }
    return walletInfo[0].wallet_id
  }

  async getWalletInfoByWalletId(wallet_id: string) {
    const walletInfo: any = await this.callQuerySafe(`SELECT w.wallet_id, up.first_name, up.last_name, u.email, up.phone FROM user_wallets w INNER JOIN users_profile up ON w.user_id = up.user_id INNER JOIN users u ON w.user_id = u.user_id WHERE w.wallet_id='${wallet_id}'`);
    if (walletInfo.length == 0) {
      return null
    }
    return walletInfo[0]
  }

  async detectCurrency(phoneNumber: string) {
    try {
      if (phoneNumber.startsWith("+256")) {
        return "UGX"
      } else if (phoneNumber.startsWith("+255")) {
        return "TZS"
      } else if (phoneNumber.startsWith("+250")) {
        return "RWF"
      } else if (phoneNumber.startsWith("+254")) {
        return "KES"
      } else {
        return "USD"
      }
    } catch (error: any) {
      console.error("Error detecting currency:", error.message);
      return this.makeResponse(500, "Error detecting currency", { error: error.message });
    }
  }

  async depositRequest(data: any) {
    try {
      console.log("depositRequest", data)
      const { userId, amount, paymentMethod, currency, account_number, converted_amount, redirect_url } = data;
      this.logOperation("DEPOSIT_REQUEST", userId, currency, data)
      const baseCurrency = "USD"

      // Validate input
      if (!userId || !amount || !currency) {
        return this.makeResponse(400, "User ID,paymentMethod, amount, and currency are required");
      }

      if (amount <= 0) {
        return this.makeResponse(400, "Amount must be greater than zero");
      }
      if (amount > 5000 && baseCurrency == 'USD') {
        return this.makeResponse(400, "Amount must be less than $5000");
      }
      const refId = `t${this.getRandomString()}`


      const issuerWalletId: any = process.env.USD_ISSUER
      const creditWallet: any = await this.getUserWallet(userId, baseCurrency);
      if (!creditWallet) {
        return this.makeResponse(404, "Credit wallet not found");
      }
      const userWalletId = creditWallet.wallet_id
      const paymentMethods = await this.getPaymentTypes()
      const allowedPaymentMethods = paymentMethods.data
      if (!allowedPaymentMethods.includes(paymentMethod)) {
        return this.makeResponse(400, "Invalid payment method");
      }
      let request_amount = amount
      let request_currency = currency
      request_amount = data.converted_amount

      console.log("request_amount", paymentMethod, request_amount, currency)

      if (paymentMethod == "MOBILE") {
        // Validate the phone number
        if (!account_number || typeof account_number !== 'string' || !/^\+\d{8,15}$/.test(account_number)) {
          return this.makeResponse(400, "Invalid or missing phone number. Please provide a valid phone number in international format (e.g., +12345678901).");
        }
        request_currency = await this.detectCurrency(account_number)
        console.log("request_currency", request_currency)
        const rate = await this.getRate(request_currency, "USD")
        const newAmount = Number((converted_amount * rate).toFixed(0))
        console.log("newAmount", newAmount)
        request_amount = converted_amount;
        // request_amount = Number((amount * rate).toFixed(0))
      }

      const newTransaction = {
        trans_id: refId,
        user_id: userId,
        dr_wallet_id: issuerWalletId,
        cr_wallet_id: userWalletId,
        asset:currency,
        currency,
        amount,
        deposit_currency: request_currency,
        request_amount,
        trans_type: "DEPOSIT",
        narration: "DEPOSIT REQUEST",
        status: 'PENDING',
        running_balance: 0
      };
      await this.insertData('wl_transactions', newTransaction);


      // MOCK PAYMENT: If we are in dev/local/debug, skip the real payment gateway
      if (paymentMethod === "MOBILE" && process.env.ENVIRONMENT !== 'production') {
        logger.info(`[Mock Payment] Skipping Relworx call for ${refId} in ${process.env.ENVIRONMENT} mode`);

        // 1. Update transaction status to SUCCESS
        await this.updateData('wl_transactions', `trans_id='${refId}'`, { status: 'SUCCESS' });

        // 2. Credit the user's wallet directly
        const currentWallet: any = await this.callQuerySafe(`SELECT balance FROM user_wallets WHERE wallet_id='${userWalletId}'`);
        if (currentWallet.length > 0) {
          const newBalance = parseFloat(currentWallet[0].balance) + parseFloat(amount);
          await this.updateData('user_wallets', `wallet_id='${userWalletId}'`, { balance: newBalance });
        }
        return this.makeResponse(200, "Deposit Successful (Mock)");
      }

      if (paymentMethod == "MOBILE") {
        logger.info(`[Relworx] Initiating Payment: Ref=${refId}, Acc=${account_number}, Amt=${request_amount} ${request_currency}`);
        const requestPayment = await mm.requestPayment(refId, account_number, request_currency, request_amount, "DEPOSIT REQUEST")
        logger.info("requestPayment", requestPayment)
        if (requestPayment.status != 200) {
          return this.makeResponse(400, "Failed to request payment");
        }
        return requestPayment
      } else if (paymentMethod == "CARD") {

        const redirectUrl = redirect_url || process.env.WEBSITE_URL || 'https://www.web.socialgems.me/'
        // const successUrl = `${redirectUrl}payment/?refId=${refId}&status='success'`
        const successUrl = `${redirectUrl}?refId=${refId}&status='success'`
        const cancelUrl = `${redirectUrl}?refId=${refId}&status='failed'`
        const cardInfo = {
          sub_tag: "gOjdlNeligy",
          userId: userId,
          amount: amount,
          currency: currency,
          op_type: "Payment",
          successUrl: successUrl,
          cancelUrl: cancelUrl
        }
        return this.InitPayment(cardInfo, "Payment", refId)
      }




    } catch (error: any) {
      console.error("Error processing deposit:", error.message);
      return this.makeResponse(500, "Error processing deposit", { error: error.message });
    }

  }

  async getPaymentTypesv2(operation: string = 'ALL', country: any = 'ALL') {
    let paymentMethods: any = []
    paymentMethods = await this.callQuerySafe(`SELECT * FROM payment_types WHERE (country='${country}' OR country='ALL') AND (operation='${operation}' OR operation='ALL')`);
    //const data = paymentMethods.map((method: any) => method.type);
    // const data = ["WALLET", "MOBILE", "BANK", "CARD"]
    return this.makeResponse(200, "success", paymentMethods);
  }


  async getPaymentTypes(operation: string = 'ALL', country: any = 'ALL') {
    let paymentMethods: any = []
    if (country == "ALL") {
      paymentMethods = await this.callQuerySafe(`SELECT type FROM payment_types `);
    } else {
      paymentMethods = await this.callQuerySafe(`SELECT * FROM payment_types WHERE (country='${country}' OR country='ALL') AND (operation='${operation}' OR operation='ALL')`);
    }

    const data = paymentMethods.map((method: any) => method.type);
    // const data = ["WALLET", "MOBILE", "BANK", "CARD"]
    return this.makeResponse(200, "success", data);
  }


  async getWalletByUserName(id: any) {
    const user: any = await this.getUserByUserName(id)
    if (user.length > 0) {
      const userId = user[0].user_id
      const wallet = await this.GenerateCurrencyWallet(userId, "USD");
      const wallet_id = wallet.wallet_id
      const response = {
        wallet_id,
        user_id: userId,
        first_name: user[0].first_name,
        last_name: user[0].last_name,
        email: user[0].email,
        username: user[0].username,
      }

      return this.makeResponse(200, "success", response);
    }
    return this.makeResponse(404, "User not found");
  }

  async HandleWebhook(req: any) {
    logger.info(`WEBHOOK_1`, req.body);

    // Access the event directly from req.body
    const event = req.body;
    logger.info(`WEBHOOK_2 Event Type: ${event.type}`);

    try {
      // Process the event type
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;

          // Access metadata, userId, and subTag from the session
          const userId = session.metadata?.userId || "";
          const subTag = session.metadata?.subTag || "";

          logger.info(`SESSION_PRO Metadata:`, session.metadata);

          // Retrieve the payment intent ID
          const paymentIntentId = session.payment_intent as string;

          logger.info(`Checkout session completed. Payment Intent: ${paymentIntentId}`);

          // Fetch the Payment Intent details
          const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);

          if (paymentIntent.status === "succeeded") {
            // Credit the user in your system
            await this.creditUserAccount(userId, paymentIntent.amount / 100, subTag);
            logger.info(`User ${userId} credited with ${paymentIntent.amount / 100}`);
          }
          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          logger.info(`Payment Intent succeeded: ${paymentIntent.id}`);
          break;
        }

        case "charge.succeeded": {
          const charge = event.data.object as Stripe.Charge;
          logger.info(`Charge succeeded: ${charge.id}`);
          logger.info(`Amount Captured: ${charge.amount / 100} ${charge.currency}`);
          break;
        }

        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }

      // Return success response
      return this.makeResponse(200, "Webhook handled successfully");
    } catch (err) {
      console.error(`Webhook Error: ${(err as Error).message}`);
      return this.makeResponse(400, `Webhook Error: ${(err as Error).message}`);
    }
  }

  async login(data: any) {
    try {
      const { userId, pin } = data;
      const pinValidation = await this.validatePin(userId, pin);
      return pinValidation;
    } catch (error: any) {
      console.error("Error during login:", error.message);
      return this.makeResponse(500, "Error during login", { error: error.message });
    }
  }

  async supportedCurrency(currency: string) {
    const currencyInfo = await this.callQuerySafe(`SELECT * FROM supported_currencies where currency='${currency}' and has_payout=1`);
    if (currencyInfo.length == 0) {
      return false
    }
    return currencyInfo[0];
  }

  async transferRequest(data: any) {
    try {
      console.log("transferRequest", data)
      const { userId, receiverId, amount, payment_method_id, pin, paymentMethod, currency } = data;
      let narration = "SOCIAL GEMS"
      const payout_currency = currency
      const baseCurrency = "USD"
      let account_number = data.account_number || ""

      if (typeof amount === "string") {
        return this.makeResponse(400, "Amount must be a number, not a string");
      }

      if (amount < 0.1) {
        return this.makeResponse(400, "Amount must be greater than 0.1 USD");
      }



      const conversionRate = await this.getRate(baseCurrency, currency);
      if (conversionRate == 0) {
        return this.makeResponse(400, "Exchange not available for " + baseCurrency + " to " + currency + " at the moment");
      }
      const convertedAmount = amount * conversionRate;

      const paymentMethods = await this.getPaymentTypes()
      const allowedPaymentMethods = paymentMethods.data
      if (!allowedPaymentMethods.includes(paymentMethod)) {
        // return this.makeResponse(400, "Invalid payment method");
      }
      const isAccountLocked = await this.isAccountLocked(userId);
      if (isAccountLocked != false) {
        return isAccountLocked;
      }

      let account_name = ""
      let crWalletId: any = process.env.USD_ISSUER

      let paymentType = paymentMethod.toUpperCase();

      if (paymentType == "WALLET" && account_number.length > 4) {
        crWalletId = account_number
      } else if (paymentType === 'BANK' && account_number) {
        // One-off bank withdrawal — account details come directly in the request body
        account_name = data.account_name || '';
        const supportedCurrency = await this.supportedCurrency(payout_currency);
        if (!supportedCurrency) {
          return this.makeResponse(400, "Payout is not supported for " + payout_currency);
        }
      } else {

        const supportedCurrency = await this.supportedCurrency(payout_currency);
        if (!supportedCurrency) {
          return this.makeResponse(400, "Payout is not supported for " + payout_currency);
        }

        const getPaymentMethod: any = await this.getUserPaymentMethod(payment_method_id, paymentMethod, userId)
        if (getPaymentMethod.length == 0) {
          return this.makeResponse(404, "Invalid payment method");
        }
        account_number = getPaymentMethod[0].account_number
        account_name = getPaymentMethod[0].account_name
        paymentType = getPaymentMethod[0].type

      }

      if (paymentType.toUpperCase() === "MOBILE") {

        if (process.env.ENVIRONMENT == 'stage') {
          return this.makeResponse(400, "Transaction request sent, but mobile money payout is not available in stage");
        }
        const phoneRegex = /^[1-9]\d{1,14}$/;
        if (!account_number.startsWith("+")) {
          account_number = `+${account_number}`;
        }
        if (!phoneRegex.test(account_number.replace("+", ""))) {
          return this.makeResponse(400, "Invalid phone number format for MOBILE_MONEY");
        }
      }

      const pinValidation = await this.validatePin(userId, pin);
      if (pinValidation.status !== 200) {
        return pinValidation;
      }

      const userInfo: any = await this.getUserById(userId);
      const creditWallet: any = await this.getUserWallet(userId, currency);
      if (!creditWallet) {
        return this.makeResponse(404, "Credit wallet not found");
      }
      const refId = `r${this.getRandomString()}`
      const trans_id = `t${this.getRandomString()}`

      const userWalletId = creditWallet.wallet_id
      const transferObj = await this.walletTransfer(trans_id, userId, crWalletId, "WITHDRAW", amount, 0, currency, narration, userWalletId, refId, paymentType, account_number, account_name);
      const status = transferObj.status
      if (status != 200) {
        const message = transferObj.message
        await this.updateTransactionStatus(trans_id, message, "FAILED", "FAILED");
        return transferObj
      }

      if (paymentType == "WALLET") {
        const message = transferObj.message
        await this.updateTransactionStatus(trans_id, message, "SUCCESS", "SUCCESS");
        return transferObj
      }

      // USD bank transfers: create a pending admin-approval record here where
      // the full `data` object (bank_name, account_name, swift_code) is in scope.
      // The wallet debit above already happened; we hold it in PROCESSING until
      // admin manually processes and marks it PAID.
      if (paymentType.toUpperCase() === 'BANK') {
        const requestId = `uw${this.getRandomString()}`;
        await this.insertData('usd_withdrawal_requests', {
          request_id:     requestId,
          user_id:        userId,
          trans_id:       refId,
          amount,
          currency:       payout_currency,
          account_number,
          account_name:   data.account_name  || '',
          bank_name:      data.bank_name     || '',
          swift_code:     data.swift_code    || '',
          status:         'PENDING',
        });
        await this.updateTransactionStatus(refId, 'Awaiting admin processing', 'PROCESSING', 'PROCESSING');
        this.sendAppNotification(userId, 'USD_WITHDRAWAL_SUBMITTED', '', amount.toString(), '', '', 'WALLET');
        return this.makeResponse(200, 'Your USD withdrawal request has been submitted. Admin will process it manually and notify you.');
      }

      if (process.env.ENVIRONMENT != 'production') {
        return transferObj
      }

      const finalResponse = await this.makeThirdpartyTransfer(userId, convertedAmount, paymentType, account_number, currency, payout_currency, narration, refId)
      logger.info("finalResponse", finalResponse)
      return finalResponse
    } catch (error) {
      await this.rollbackTransaction();
      console.error("Error in transferRequest:", error);
      return this.makeResponse(203, "Error creating transfer transaction");
    }
  }

  async makeThirdpartyTransfer(
    userId: string,
    amount: number,
    paymentMethod: string,
    account_number: string,
    currency: string,
    payout_currency: string,
    narration: string,
    refId: string
  ) {
    try {
      const payload = {
        userId,
        amount,
        paymentMethod,
        account_number,
        currency,
        payout_currency,
        narration
      }
      this.logOperation(`THIRD_PARTY_PAYOUT_INFO`, refId, account_number, payload)

      if (!userId || !amount || !currency || !account_number || !payout_currency) {
        return this.makeResponse(400, "userId, amount, currency, payout_currency, and account_number are required");
      }

      if (currency.toUpperCase() !== "USD") {
        return this.makeResponse(400, "Payout is only supported in USD");
      }





      // Retrieve the user's debit wallet using the provided wallet_id (assumed maintained in USD)
      const debitWallet: any = await this.getUserWallet(userId, currency);
      if (!debitWallet) {
        return this.makeResponse(404, "Debit wallet not found");
      }


      const userWalletId = debitWallet.wallet_id;
      logger.info(`wallet_id`, userWalletId);

      const reference = this.getRandomString();


      let thirdpartyPayResponse: any = null;
      let statusCode = 400
      let message = ""


      if (paymentMethod.toUpperCase() == "MOBILE") {
        thirdpartyPayResponse = await mm.sendPayment(reference, account_number, payout_currency, amount, narration);
        logger.info(`thirdpartyPay:`, thirdpartyPayResponse);
        statusCode = thirdpartyPayResponse.status
        message = thirdpartyPayResponse.message
      } else {
        // BANK is handled earlier in transferRequest() before this method is called.
        // Any other method reaching here is unsupported.
        await this.updateTransactionStatus(refId, message, "FAILED", "PENDING_REVERSAL");
        return this.makeResponse(400, "Invalid payment method for " + payout_currency);
      }

      if (statusCode == 200) {
        await this.updateTransactionStatus(refId, message, "SUCCESS", "SUCCESS");
      } else if (statusCode == 400) {
        await this.updateTransactionStatus(refId, message, "FAILED", "FAILED");
      } else if (statusCode == 500) {
        await this.updateTransactionStatus(refId, message, "FAILED", "PENDING_REVERSAL");
      } else {
        await this.updateTransactionStatus(refId, message, "FAILED", "FAILED");
      }
      return this.makeResponse(statusCode, thirdpartyPayResponse.message);
    } catch (error: any) {
      console.error("Error processing mobile money payout:", error.message);
      return this.makeResponse(500, "Error processing mobile money payout", { error: error.message });
    }
  }



  async getActiveSubscription(userId: string) {
    try {
      const userInfo: any = await this.getUserById(userId);
      if (userInfo.length === 0) {
        return this.makeResponse(400, "User not found");
      }

      const customerId = userInfo[0].stripe_customer_id;
      if (!customerId) {
        return this.makeResponse(400, "User does not have a Stripe customer ID");
      }

      const subscriptions = await getStripe().subscriptions.list({
        customer: customerId,
        status: 'active',
      });

      return this.makeResponse(200, "Active subscriptions retrieved successfully", subscriptions.data);
    } catch (error: any) {
      console.error("Error retrieving subscriptions:", error.message);
      return this.makeResponse(500, "Error retrieving subscriptions", { error: error.message });
    }
  }


  async pendingReversals() {
    try {
      const transactions: any = await this.callQuerySafe(`SELECT * FROM wl_transactions WHERE system_status='PENDING_REVERSAL'`);
      console.log("pendingReversal", transactions)
      for (let i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];
        await this.makeTransactinReversal(transaction);
      }
    } catch (error: any) {
      console.error("Error making transaction reversal:", error.message);
      return this.makeResponse(500, "Error making transaction reversal", { error: error.message });
    }
  }


  async makeTransactinReversal(transaction: any) {
    const oldTransId = transaction.trans_id

    try {
      const message = transaction.message
      await this.updateTransactionStatus(oldTransId, message, "FAILED", "IN_PROGRESS");
      const userId = transaction.user_id
      const amount = transaction.amount
      const currency = transaction.currency
      const dr_wallet_id = transaction.dr_wallet_id
      const cr_wallet_id = transaction.cr_wallet_id
      const fee = transaction.fee
      const trans_id = `t${this.getRandomString()}`
      const reversalObj = await this.walletTransfer(trans_id, userId, dr_wallet_id, "DEPOSIT", amount, 0, currency, "REVERSAL", cr_wallet_id, trans_id);
      const status = reversalObj.status
      if (status == 200) {
        await this.updateTransactionStatus(trans_id, message, "SUCCESS", "SUCCESS");
        await this.updateTransactionStatus(oldTransId, message, "FAILED", "REVERSED");

      } else {
        await this.updateTransactionStatus(trans_id, message, "FAILED", "FAILED");
        await this.updateTransactionStatus(oldTransId, message, "FAILED", "REVERSAL_FAILED");

      }
      return reversalObj;

    } catch (error: any) {
      console.error("Error making transaction reversal:", error.message);
      await this.updateTransactionStatus(oldTransId, "FAILED", "FAILED", "REVERSAL_FAILED");
      return this.makeResponse(500, "Error making transaction reversal", { error: error.message });
    }
  }


  async InitPayment(data: any, op_type: string = 'subscription', refId: string = '') {
    try {
      console.log("InitPayment", data)
      const { sub_tag, userId, successUrl, cancelUrl, type } = data;

      let amount: number;

      // MOCK PAYMENT: If we are in dev/local/debug, skip the real Stripe call
      if (process.env.ENVIRONMENT !== 'production') {
        logger.info(`[Mock Payment] Skipping Stripe call for card payment in ${process.env.ENVIRONMENT} mode`);
        const mockSessionId = `cs_test_${this.getRandomString()}`;
        const mockPaymentUrl = `${successUrl}?session_id=${mockSessionId}`;

        return this.makeResponse(200, 'Mock payment session created successfully', {
          paymentUrl: mockPaymentUrl,
          sessionId: mockSessionId,
        });
      }

      let currency: string;
      let description: string;
      let subName: string;

      if (op_type == 'subscription') {
        const subInfo: any = await this.getSubscription(sub_tag)
        if (subInfo.length == 0) {
          return this.makeResponse(400, "Invalid subscription plan");
        }
        amount = subInfo[0].price * 100
        currency = subInfo[0].currency
        subName = subInfo[0].name
        description = subInfo[0].description
      } else {
        amount = (data.amount) * 100
        currency = data.currency
        description = "DEPOSIT"
      }


      const userInfo: any = await this.getUserById(userId);
      if (userInfo.length == 0) {
        return this.makeResponse(400, "User not found");
      }
      const email = userInfo[0].email

      // Validate the input
      if (!amount || amount <= 0 || !currency || !cancelUrl) {
        return this.makeResponse(400, 'Amount, currency, successUrl, and cancelUrl are required', null);
      }

      // Create a Checkout Session
      const session = await getStripe().checkout.sessions.create({
        billing_address_collection: 'auto',
        customer_email: email,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `SOCIAL Gems ${op_type}`,
                description,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: {
          userId: userId,
          subTag: sub_tag,
          opType: op_type,
          refId: refId
        },
      });

      return this.makeResponse(200, 'Payment session created successfully', {
        paymentUrl: session.url,
        sessionId: session.id,
      });
    } catch (error: any) {
      console.error('Error creating checkout session:', error.message);
      return this.makeResponse(500, 'Error creating checkout session', { error: error.message });
    }
  }

  async addPaymentMethod(data: any) {
    try {
      const { userId, type, currency, phone_number, country_code, network, account_name, bank_name, bank_code, account_number, bank_address, bank_phone_number, bank_country } = data;

      const user_id = userId

      const paymentMethods = await this.getPaymentTypes()
      const allowedPaymentMethods = paymentMethods.data
      if (!allowedPaymentMethods.includes(type)) {
        return this.makeResponse(400, "Invalid payment method");
      }



      // Validate input
      if (!user_id || !type) {
        return this.makeResponse(400, "User ID and type are required");
      }

      const newPaymentMethod = {
        payment_method_id: "pm" + this.getRandomString(),
        user_id,
        type,
        currency,
        phone_number,
        country_code,
        network,
        account_name,
        bank_name,
        bank_code,
        account_number: type == "MOBILE" ? phone_number : account_number,
        bank_address,
        bank_phone_number,
        bank_country
      };

      await this.insertData('payment_methods', newPaymentMethod);
      return this.makeResponse(201, "Payment method added successfully", newPaymentMethod);
    } catch (error: any) {
      console.error("Error adding payment method:", error.message);
      return this.makeResponse(500, "Error adding payment method", { error: error.message });
    }
  }

   async deletePaymentMethod(payment_method_id: string, userId: string) {
     try {
       if (!payment_method_id) {
         return this.makeResponse(400, "Payment method ID is required");
       }

       const method: any = await this.callQuerySafe(`SELECT * FROM payment_methods WHERE payment_method_id='${payment_method_id}' `);

       if (method.length == 0) {
         return this.makeResponse(404, "Payment method not found");
       }

       await this.callQuerySafe(`DELETE FROM payment_methods WHERE user_id='${userId}' AND payment_method_id='${payment_method_id}'`);
       return this.makeResponse(200, "Payment method deleted successfully");
     } catch (error: any) {
       console.error("Error deleting payment method:", error.message);
       return this.makeResponse(500, "Error deleting payment method", { error: error.message });
     }
   }

  async exportTransactionsCSV(data: any) {
    try {
      const { userId, currency } = data;

      const wallet_id = await this.getWalletInfoByUserId(userId, currency);
      const transactions: any = await this.callQuerySafe(`
        SELECT 
          trans_id,
          created_at,
          narration,
          amount,
          currency,
          status,
          trans_type,
          payment_method
        FROM wl_transactions 
        WHERE (dr_wallet_id='${wallet_id}' or cr_wallet_id='${wallet_id}') 
          and status!='PENDING' 
        ORDER BY id DESC
      `);

      const headers = ['Transaction ID', 'Date', 'Description', 'Amount', 'Currency', 'Status', 'Type', 'Payment Method'];
      const csvRows = [headers.join(',')];

      for (const tx of transactions) {
        const row = [
          tx.trans_id,
          tx.created_at,
          `"${tx.narration.replace(/"/g, '""')}"`,
          tx.amount,
          tx.currency,
          tx.status,
          tx.trans_type,
          tx.payment_method || ''
        ];
        csvRows.push(row.join(','));
      }

      return csvRows.join('\n');
    } catch (error: any) {
      console.error("Error exporting transactions CSV:", error.message);
      throw error;
    }
  }


  async getMyUsdWithdrawals(userId: string) {
    try {
      if (!userId) {
        return this.makeResponse(400, 'User ID is required');
      }
      const rows: any = await this.callQuerySafe(
        `SELECT request_id, amount, currency, account_number, account_name, bank_name, swift_code, status, created_at
         FROM usd_withdrawal_requests
         WHERE user_id = '${userId}'
         ORDER BY created_at DESC`
      );
      return this.makeResponse(200, 'ok', rows);
    } catch (error: any) {
      console.error('getMyUsdWithdrawals error:', error.message);
      return this.makeResponse(500, 'Error fetching USD withdrawal history');
    }
  }

  async getUserPaymentMethod(paymentMethod: string, type: string, userId: string) {
    // return await this.callQuerySafe(`SELECT * FROM payment_methods WHERE payment_method_id='${paymentMethod}' and type='${type}' AND user_id='${userId}'`);
    return await this.callQuerySafe(`SELECT * FROM payment_methods WHERE payment_method_id='${paymentMethod}' AND user_id='${userId}'`);
  }

  async getUserPaymentMethods(q: any, user_id: string) {
    try {
      logger.info(`getUserPaymentMethods`, q.type || "ALL")
      if (!user_id) {
        return this.makeResponse(400, "User ID is required");
      }

      let paymentMethods: any = []
      if (q.type) {
        paymentMethods = await this.callQuerySafe(`SELECT * FROM payment_methods WHERE user_id='${user_id}' and type='${q.type}'`);


      } else {
        paymentMethods = await this.callQuerySafe(`SELECT * FROM payment_methods WHERE user_id='${user_id}'`);

      }

      if (paymentMethods.length == 0) {
        const userInfo: any = await this.callQuerySafe(`SELECT * FROM users_profile WHERE user_id='${user_id}'`);
        logger.info(`userInfo`, userInfo)
        if (userInfo.length > 0) {
          const phone = userInfo[0].phone
          const iso_code = userInfo[0].iso_code
          if (iso_code == "UG" && phone.length > 9) {

            const obj = {
              payment_method_id: "pm" + this.getRandomString(),
              user_id,
              type: "MOBILE",
              currency: "UGX",
              phone_number: phone,
              country_code: "UG",
              network: "MTN",
              account_name: userInfo[0].first_name + " " + userInfo[0].last_name,
              bank_name: "",
              bank_code: "",
              account_number: phone,
              bank_address: "",
              bank_phone_number: "",
              bank_country: "UG"
            }
            await this.insertData('payment_methods', obj);
            paymentMethods = await this.callQuerySafe(`SELECT * FROM payment_methods WHERE user_id='${user_id}' and type='${q.type}'`);

          }
        }
      }

      return this.makeResponse(200, "Payment methods retrieved successfully", paymentMethods);
    } catch (error: any) {
      console.error("Error retrieving payment methods:", error.message);
      return this.makeResponse(500, "Error retrieving payment methods", { error: error.message });
    }
  }



}
