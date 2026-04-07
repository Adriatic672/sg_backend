-- Add notification template for campaign activation

INSERT INTO notification_templates (operation, title, body) 
VALUES (
  'CAMPAIGN_ACTIVATED_SENDER_EMAIL',
  'Campaign Activated Successfully',
  'Greetings,<br><br>
   Great news! Your campaign <strong>{name}</strong> has been successfully activated and is now live.<br><br>
   <strong>Campaign Details:</strong><br>
   Campaign Name: {name}<br>
   Status: <span style="color: #4CAF50; font-weight: bold;">ACTIVE</span><br><br>
   
   <strong>What happens next?</strong><br>
   ✓ Approved influencers can now start working on your campaign<br>
   ✓ You can track progress in real-time from your dashboard<br>
   ✓ You will receive notifications when influencers complete tasks<br>
   ✓ You can review and approve submissions as they come in<br><br>
   
   
   <strong>Need Help?</strong><br>
   If you have any questions or need assistance managing your campaign, our support team is here to help.<br><br>
   
   Thank you for choosing Social Gems!<br><br>
   Best regards,<br>'
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  body = VALUES(body);

