import axios from 'axios';
import { google } from 'googleapis'; // To handle OAuth2 authentication
import fs from 'fs';

// Firebase project configuration
const FCM_ENDPOINT: string = process.env.FCM_ENDPOINT || "https://fcm.googleapis.com/v1/projects/app-social-gems/messages:send";
const GOOGLE_CREDENTIALS_PATH = './firebase.json';

// Function to get OAuth2 access token
const getAccessToken = async () =>{
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  const accessToken = await auth.getAccessToken();
  console.log(`AccessToken: ${accessToken}`,{
    keyFile: GOOGLE_CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  return accessToken;
};

// Function to send a notification to a topic or a device
const sendNotification = async (recipient: string, data: any, isTopic: boolean = false): Promise<boolean> => {
  console.log(`sendNotification`,recipient,data)

  if (process.env.ENVIRONMENT !== 'production' && !fs.existsSync(GOOGLE_CREDENTIALS_PATH)) {
    console.log(`[MockFCM] Notification to ${recipient}: ${data.title || 'No Title'}`);
    return true;
  }
  
  // Convert all data values to strings as FCM requires string key-value pairs
  const fcmData: { [key: string]: string } = {};
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined && data[key] !== null) {
      fcmData[key] = String(data[key]);
    }
  });

  const message = {
    message: {
      [isTopic ? "topic" : "token"]: recipient, // Use "topic" for topic-based messages, "token" for device-specific
      data: fcmData,
      android: {
        priority: "high",
      },
      notification: {
        title: data.title,
        body: data.body,
      },
    },
  };

  try {
    const accessToken = await getAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };

    const response = await axios.post(FCM_ENDPOINT, message, { headers });
    console.log(`Successfully sent message to ${isTopic ? "topic" : "device"}:`, response.data);
    return true;
  } catch (error: any) {
    console.error(`Error sending message to ${isTopic ? "topic" : "device"}:`, error.response?.data || error.message);
    return false;
  }
};

 
const subscribeToTopic = async (token: string, topic: string): Promise<boolean> => {
  if (process.env.ENVIRONMENT !== 'production' && !fs.existsSync(GOOGLE_CREDENTIALS_PATH)) {
    console.log(`[MockFCM] Subscribed ${token} to topic ${topic}`);
    return true;
  }

  const url = `https://iid.googleapis.com/iid/v1/${token}/rel/topics/${topic}`;
  const accessToken = await getAccessToken();

  const headers = {
    Authorization: `Bearer ${accessToken}`, // OAuth2 Bearer token
    'Content-Type': 'application/json',
    access_token_auth: true
  };


  try {
    const response = await axios.post(url, {}, { headers });
    console.log(`Successfully subscribed tokens to topic "${topic}":`, response.data);
    return true;
  } catch (error: any) {
    console.error(`Error subscribing tokens to topic "${topic}":`, error.response?.data || error.message);
    return false;
  }
};

async function unsubscribeFromTopic(token:string, topic:string) {
  try {
    const url = `https://iid.googleapis.com/iid/v1/${token}/rel/topics/${topic}`;
    const accessToken = await getAccessToken();

    const headers = {
      'Authorization': `Bearer ${accessToken}`, // Replace with your access token
      'Content-Type': 'application/json'
    };

    const response = await axios.delete(url, { headers });

    if (response.status !== 200) {
      throw new Error(`Unsubscription failed: ${response.statusText}`);
    }

    console.log('Unsubscribed from topic:', topic);
  } catch (error:any) {
    console.error('Error unsubscribing from topic:', error);
  }
}

export { sendNotification, subscribeToTopic, unsubscribeFromTopic };
