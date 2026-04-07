-- Add notification templates for campaign submissions

-- Template for when a task submission is rejected
INSERT INTO notification_templates (operation, title, body) 
VALUES (
  'SUBMISSION_REJECTED',
  'Campaign Task Submission Rejected',
  'Dear {name},<br><br>
   Unfortunately, your task submission for a campaign has been rejected by the brand.<br><br>
   <strong>Rejection Details:</strong><br>
   Reason: {reason}<br><br>
   Please review the campaign requirements and resubmit your work if applicable. If you have any questions about the rejection, please contact the campaign creator or our support team.<br><br>
   <a href="https://app.socialgems.me/campaigns" style="background-color: #ffcc66; color: #333333; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View My Campaigns</a><br><br>
   Best regards,<br>
   The Social Gems Team'
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  body = VALUES(body);

-- Template for when a user completes a campaign
INSERT INTO notification_templates (operation, title, body) 
VALUES (
  'CAMPAIGN_USER_COMPLETED',
  'Campaign Completed - Awaiting Review',
  'Dear {name},<br><br>
   Congratulations! You have successfully completed a campaign.<br><br>
   Your submission is now under review by the brand. You will be notified once the brand has reviewed and approved your work.<br><br>
   <a href="https://app.socialgems.me/campaigns" style="background-color: #ffcc66; color: #333333; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View My Campaigns</a><br><br>
   Thank you for using Social Gems!<br><br>
   Best regards,<br>
   The Social Gems Team'
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  body = VALUES(body);

-- Template for when an admin/brand receives notification of campaign completion
INSERT INTO notification_templates (operation, title, body) 
VALUES (
  'CAMPAIGN_ADMIN_COMPLETED',
  'Campaign Submission Received - Action Required',
  'Dear {name},<br><br>
   An influencer has completed one of your campaigns and submitted their work for review.<br><br>
   Please log in to review the submission and approve or reject it.<br><br>
   <a href="https://business.socialgems.me/campaigns" style="background-color: #ffcc66; color: #333333; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Submissions</a><br><br>
   Best regards,<br>
   The Social Gems Team'
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  body = VALUES(body);

