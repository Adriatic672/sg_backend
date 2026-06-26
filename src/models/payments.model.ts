import Model from "../helpers/model";
import { subscribeToTopic, unsubscribeFromTopic } from '../helpers/FCM';
import { setItem } from "../helpers/connectRedis";
import Stripe from 'stripe';
import { logger } from '../utils/logger';
import { setUserTier } from '../helpers/subscriptionTier';
import RelworxMobileMoney from "../thirdparty/Relworx";

function relworx() {
  return new RelworxMobileMoney();
}

const mysqlNow = (): string => new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
  }
  return _stripe!;
}
const stripe = new Proxy({} as Stripe, {
  get: (_target, prop) => (getStripe() as any)[prop],
});

export default class Payments extends Model {


  async getInvoiceUrl(invoiceId: string) {
    try {
      const invoice = await stripe.invoices.retrieve(invoiceId);

      if (invoice.hosted_invoice_url) {
        return invoice.hosted_invoice_url;
      } else {
        return "Hosted invoice URL not available";
      }
    } catch (error: any) {
      console.error("Error retrieving invoice:", error.message);
      throw new Error("Failed to retrieve invoice URL");
    }
  }
  async createSubscription(data: any) {
    try {
      const { sub_tag, userId, successUrl, cancelUrl, payment_method } = data;

      // Retrieve subscription plan info
      const subInfo: any = await this.selectDataQuery(
        "subscriptions",
        `sub_tag='${sub_tag}'`
      );
      if (subInfo.length === 0) {
        return this.makeResponse(400, "Invalid subscription plan");
      }

      // Retrieve user info
      const userInfo = await this.selectDataQuery(
        "users",
        `user_id='${userId}'`
      );
      if (userInfo.length === 0) {
        return this.makeResponse(400, "User not found");
      }

      const startDate = new Date().toISOString().split("T")[0];
      const endDateObj = new Date(); endDateObj.setDate(endDateObj.getDate() + 30);
      const endDate = endDateObj.toISOString().split("T")[0];
      const tier = sub_tag.toUpperCase() === 'CREATOR_PRO' ? 'pro'
                 : sub_tag.toUpperCase() === 'CREATOR_PLUS' ? 'plus'
                 : null;

      // ── Wallet payment path ──────────────────────────────────────────────────
      if (payment_method === 'wallet') {
        const planPrice = parseFloat(subInfo[0].price);

        // Get user's KES wallet
        const walletRows: any = await this.selectDataQuery(
          'user_wallets',
          `user_id='${userId}' AND asset='KES' AND status='active'`
        );
        if (walletRows.length === 0) {
          return this.makeResponse(400, 'No active KES wallet found. Please fund your wallet first.');
        }
        const wallet = walletRows[0];
        const available = parseFloat(wallet.balance_available ?? wallet.available_balance ?? 0);

        if (available < planPrice) {
          return this.makeResponse(400, `Insufficient wallet balance. You have KES ${available.toFixed(2)} but need KES ${planPrice.toFixed(2)}.`);
        }

        // Deduct from wallet
        const newBalance = parseFloat(wallet.balance) - planPrice;
        const newAvailable = available - planPrice;
        const newWithdrawn = parseFloat(wallet.total_withdrawn ?? 0) + planPrice;
        await this.updateData(
          'user_wallets',
          `wallet_id='${wallet.wallet_id}'`,
          {
            balance: newBalance.toFixed(2),
            balance_available: newAvailable.toFixed(2),
            total_withdrawn: newWithdrawn.toFixed(2),
          }
        );

        // Record transaction
        const transId = 't' + Date.now().toString(16) + Math.random().toString(16).slice(2, 10);
        await this.insertData('wl_transactions', {
          trans_id: transId,
          user_id: userId,
          dr_wallet_id: wallet.wallet_id,
          cr_wallet_id: '0X00000000001',
          trans_type: 'DR',
          op_type: 'SUBSCRIPTION',
          status: 'SUCCESS',
          system_status: 'SUCCESS',
          currency: 'KES',
          asset: 'KES',
          amount: planPrice.toFixed(2),
          running_balance: newBalance.toFixed(2),
          fee: '0.00',
          narration: `${sub_tag} subscription`,
          payment_method: 'wallet',
          created_on: mysqlNow(),
        });

        // Activate subscription immediately
        const existingSub: any = await this.selectDataQuery(
          'user_subscriptions',
          `user_id='${userId}' AND subscription_id=${subInfo[0].id}`
        );
        if (existingSub.length > 0) {
          await this.updateData(
            'user_subscriptions',
            `user_id='${userId}' AND subscription_id=${subInfo[0].id}`,
            { status: 'active', start_date: startDate, end_date: endDate, auto_renew: 1, updated_at: mysqlNow() }
          );
        } else {
          await this.insertData('user_subscriptions', {
            user_id: userId,
            subscription_id: subInfo[0].id,
            status: 'active',
            start_date: startDate,
            end_date: endDate,
            auto_renew: 1,
            created_at: mysqlNow(),
          });
        }

        if (tier) await setUserTier(userId, tier);

        return this.makeResponse(200, 'Subscription activated successfully');
      }

      // ── M-Pesa STK push path (Relworx) ──────────────────────────────────────
      if (payment_method === 'mpesa') {
        const phone = userInfo[0].phone;
        if (!phone) {
          return this.makeResponse(400, 'No phone number on your account. Please add a phone number first.');
        }
        const msisdn = phone.startsWith('+') ? phone : `+${phone}`;
        const planPrice = parseFloat(subInfo[0].price);
        const refId = `sub${Date.now().toString(16)}`;

        // Record a pending subscription transaction
        await this.insertData('wl_transactions', {
          trans_id: refId,
          user_id: userId,
          dr_wallet_id: '0X00000000000',
          cr_wallet_id: '0X00000000001',
          trans_type: 'CR',
          op_type: 'SUBSCRIPTION',
          status: 'PENDING',
          system_status: 'PENDING',
          currency: 'KES',
          asset: 'KES',
          amount: planPrice.toFixed(2),
          narration: `${sub_tag} subscription via M-Pesa`,
          payment_method: 'mpesa',
          created_on: mysqlNow(),
        });

        // Store sub_tag so webhook can activate the right plan
        await this.insertData('sub_payment_pending', {
          trans_id: refId,
          user_id: userId,
          sub_tag,
          start_date: startDate,
          end_date: endDate,
          created_at: mysqlNow(),
        }).catch(() => {
          // Table may not exist yet — fall back to narration lookup in webhook
        });

        const requestPayment = await relworx().requestPayment(refId, msisdn, 'KES', planPrice, `${subInfo[0].name} subscription`);
        logger.info('mpesa subscription payment request', { refId, requestPayment });

        if (requestPayment.status !== 200) {
          await this.updateData('wl_transactions', `trans_id='${refId}'`, { status: 'FAILED', system_status: 'FAILED' });
          return this.makeResponse(400, requestPayment.message || 'Failed to initiate M-Pesa payment. Please try again.');
        }

        return this.makeResponse(202, 'M-Pesa prompt sent to your phone. Enter your PIN to complete the subscription.');
      }

      // ── Stripe card path ─────────────────────────────────────────────────────
      const priceId = subInfo[0].stripe_price_tag;
      const email = userInfo[0].email;

      // Create Stripe customer if not already created
      let customerId = userInfo[0].stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({ email });
        customerId = customer.id;
        await this.updateData(
          "users",
          `user_id='${userId}'`,
          { stripe_customer_id: customerId }
        );
      }

      // Create a Checkout Session for the subscription
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
      });

      // Check if the user already has a subscription
      const existingSubscription = await this.selectDataQuery(
        "user_subscriptions",
        `user_id='${userId}' AND subscription_id=${subInfo[0].id}`
      );

      if (existingSubscription.length > 0) {
        await this.updateData(
          "user_subscriptions",
          `user_id='${userId}' AND subscription_id=${subInfo[0].id}`,
          { status: "inactive", start_date: startDate, end_date: endDate, auto_renew: 1, updated_at: mysqlNow() }
        );
      } else {
        await this.insertData("user_subscriptions", {
          user_id: userId,
          subscription_id: subInfo[0].id,
          status: "inactive",
          start_date: startDate,
          end_date: endDate,
          auto_renew: 1,
          created_at: mysqlNow(),
        });
      }

      return this.makeResponse(200, "Checkout session created successfully", {
        paymentUrl: session.url,
        sessionId: session.id,
      });
    } catch (error: any) {
      console.error("Error creating subscription:", error.message);
      return this.makeResponse(500, "Error creating subscription", {
        error: error.message,
      });
    }
  }

  async findUserByStripeCustomerId(id: any) {
    return await this.callQuerySafe(`select * from users where stripe_customer_id='${id}'`);
  }

  async logEvent(eventType: string,ref_id:string,userId:string, details: any) {
    logger.info(`Event Type: ${eventType}`, details);
    // Log the event details to a database or external logging service
   await this.insertData("event_logs", {
      event_type: eventType,
      ref_id: ref_id,
      user_id: userId,
      details: JSON.stringify(details)
     });
  
     return false;
  }
  async HandleWebhook(req: any) {
    logger.info(`WEBHOOK_1`, req.body);

    // Access the event directly from req.body
    const event = req.body;
    logger.info(`WEBHOOK_2 Event Type: ${event.type}`);

    try {
      try {
        const session = event.data.object as Stripe.Checkout.Session;

        const userId = session.metadata?.userId || "";
        const subTag = session.metadata?.subTag || "";
        const opType = session.metadata?.opType || "";
        const refId = session.metadata?.refId || "";

        this.logEvent(event.type,refId, userId,session);
      }catch (error) {  
      }

      // Process the event type
      switch (event.type) {
       
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;

          const userId = session.metadata?.userId || "";
          const subTag = session.metadata?.subTag || "";
          const opType = session.metadata?.opType || "";
          const refId = session.metadata?.refId || "";

          logger.info(`SESSION_PRO Metadata:`, session.metadata);

          if (session.mode === "subscription" && userId) {
            // Activate the creator's subscription tier
            const tier = subTag === "CREATOR_PRO" ? "pro" : subTag === "CREATOR_PLUS" ? "plus" : null;
            if (tier) {
              const subInfo: any = await this.getSubscription(subTag);
              if (subInfo.length > 0) {
                await this.updateData(
                  "user_subscriptions",
                  `user_id='${userId}' AND subscription_id=${subInfo[0].id}`,
                  { status: "active", updated_at: mysqlNow() }
                );
              }
              await setUserTier(userId, tier);
              logger.info(`User ${userId} activated tier: ${tier}`);
            }
          } else {
            // One-off payment flow
            const paymentIntentId = session.payment_intent as string;
            logger.info(`Checkout session completed. Payment Intent: ${paymentIntentId}`);
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            if (paymentIntent.status === "succeeded") {
              if (opType === "Payment") {
                await this.completePendingDeposit(refId, paymentIntent.amount / 100, "success");
              } else {
                await this.creditUserAccount(userId, paymentIntent.amount / 100, subTag);
              }
              logger.info(`User ${userId} credited with ${paymentIntent.amount / 100}`);
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          // Subscription cancelled â€” downgrade user to free
          const sub = event.data.object as Stripe.Subscription;
          const userRows: any = await this.findUserByStripeCustomerId(sub.customer as string);
          if (userRows && userRows.length > 0) {
            await setUserTier(userRows[0].user_id, "free");
            logger.info(`User ${userRows[0].user_id} downgraded to free (subscription cancelled)`);
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



  async getActiveSubscription(userId: string) {
    try {
      const userInfo = await this.getUserById(userId);
      if (userInfo.length === 0) {
        return this.makeResponse(400, "User not found");
      }

      const customerId = userInfo[0].stripe_customer_id;
      if (!customerId) {
        return this.makeResponse(400, "User does not have a Stripe customer ID");
      }

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
      });

      return this.makeResponse(200, "Active subscriptions retrieved successfully", subscriptions.data);
    } catch (error: any) {
      console.error("Error retrieving subscriptions:", error.message);
      return this.makeResponse(500, "Error retrieving subscriptions", { error: error.message });
    }
  }






  async InitPayment(data: any) {
    try {
      const { sub_tag, userId, cancelUrl } = data;

      const subInfo: any = await this.getSubscription(sub_tag)
      if (subInfo.length == 0) {
        return this.makeResponse(400, "Invalid subscription plan");
      }
      const amount = subInfo[0].price * 100
      const currency = subInfo[0].currency
      const subName = subInfo[0].name
      const description = subInfo[0].description


      const userInfo = await this.getUserById(userId);
      if (userInfo.length == 0) {
        return this.makeResponse(400, "User not found taken");
      }
      const email = userInfo[0].email

      // Validate the input
      if (!amount || amount <= 0 || !currency  || !cancelUrl) {
        return this.makeResponse(400, 'Amount, currency, successUrl, and cancelUrl are required', null);
      }
      const successUrl = "https://www.sg-web.tekjuice.xyz/payment/?refId="


      // Create a Checkout Session
      const session = await stripe.checkout.sessions.create({
        billing_address_collection: 'auto',
        customer_email: email,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Social Gems ${subName} plan`,
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
          subTag: sub_tag
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
  async getMySubscription(userId: string) {
    const rows: any = await this.callQuerySafe(`
      SELECT us.id, us.status, us.start_date, us.auto_renew, us.created_at, us.updated_at,
             s.name, s.description, s.price, s.currency, s.sub_tag, s.features
      FROM user_subscriptions us
      JOIN subscriptions s ON us.subscription_id = s.id
      WHERE us.user_id = '${userId}' AND us.status = 'active'
      ORDER BY us.created_at DESC
      LIMIT 1
    `);
    if (!rows || rows.length === 0) {
      return this.makeResponse(200, 'No active subscription', null);
    }
    return this.makeResponse(200, 'Subscription retrieved', rows[0]);
  }

  async cancelSubscription(userId: string) {
    const userRows: any = await this.callQuerySafe(
      `SELECT stripe_customer_id FROM users WHERE user_id = '${userId}'`
    );
    if (!userRows || userRows.length === 0) {
      return this.makeResponse(400, 'User not found');
    }
    const customerId = userRows[0].stripe_customer_id;
    if (!customerId) {
      return this.makeResponse(400, 'No Stripe account linked to this user');
    }
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });
    if (subscriptions.data.length === 0) {
      return this.makeResponse(400, 'No active subscription to cancel');
    }
    await stripe.subscriptions.update(subscriptions.data[0].id, {
      cancel_at_period_end: true,
    });
    return this.makeResponse(200, 'Subscription will be cancelled at the end of the current billing period');
  }
}