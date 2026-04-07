import Model from "../helpers/model";
import { subscribeToTopic, unsubscribeFromTopic } from '../helpers/FCM';
import { setItem } from "../helpers/connectRedis";
import Stripe from 'stripe';
import { logger } from '../utils/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-12-18.acacia' });

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
      const { sub_tag, userId, successUrl, cancelUrl } = data;

      // Retrieve subscription plan info
      const subInfo: any = await this.selectDataQuery(
        "subscriptions",
        `sub_tag='${sub_tag}'`
      );
      if (subInfo.length === 0) {
        return this.makeResponse(400, "Invalid subscription plan");
      }

      const priceId = subInfo[0].stripe_price_tag;

      // Retrieve user info
      const userInfo = await this.selectDataQuery(
        "users",
        `user_id='${userId}'`
      );
      if (userInfo.length === 0) {
        return this.makeResponse(400, "User not found");
      }
      const email = userInfo[0].email;

      // Create Stripe customer if not already created
      let customerId = userInfo[0].stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({ email });
        customerId = customer.id;

        // Update user with Stripe customer ID
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
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
      });

      // Check if the user already has a subscription
      const existingSubscription = await this.selectDataQuery(
        "user_subscriptions",
        `user_id='${userId}' AND subscription_id=${subInfo[0].id}`
      );

      const startDate = new Date().toISOString().split("T")[0];

      if (existingSubscription.length > 0) {
        // Update the existing subscription record
        await this.updateData(
          "user_subscriptions",
          `user_id='${userId}' AND subscription_id=${subInfo[0].id}`,
          {
            status: "inactive",
            start_date: startDate,
            auto_renew: 1,
            updated_at: new Date().toISOString(),
          }
        );
      } else {
        // Insert a new subscription record
        const newSubscription = {
          user_id: userId,
          subscription_id: subInfo[0].id,
          status: "inactive",
          start_date: startDate,
          auto_renew: 1,
          created_at: new Date().toISOString(),
        };

        await this.insertData("user_subscriptions", newSubscription);
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

          // Access metadata, userId, and subTag from the session
          const userId = session.metadata?.userId || "";
          const subTag = session.metadata?.subTag || "";
          const opType = session.metadata?.opType || "";
          const refId = session.metadata?.refId || "";

 
          logger.info(`SESSION_PRO Metadata:`, session.metadata);

          // Retrieve the payment intent ID
          const paymentIntentId = session.payment_intent as string;

          logger.info(`Checkout session completed. Payment Intent: ${paymentIntentId}`);

          // Fetch the Payment Intent details
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

          if (paymentIntent.status === "succeeded") {
            // Credit the user in your system
            if (opType === "Payment") {
              await this.completePendingDeposit(refId, paymentIntent.amount / 100,"success");
            } else {
              await this.creditUserAccount(userId, paymentIntent.amount / 100, subTag);
            }
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





}
