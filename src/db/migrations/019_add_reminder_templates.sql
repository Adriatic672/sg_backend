-- Migration: Add reminder notification templates
-- Created: 2024-10-24

-- Add template for reminding user to accept campaign invite
INSERT INTO `notification_templates` (`operation`, `channel`, `title`, `content`, `email_subject`, `email_content`) 
VALUES (
  'SEND_REMINDER_ACCEPT_INVITE', 
  'EMAIL', 
  'Reminder: Accept Campaign Invitation', 
  'Don''t forget to accept your campaign invitation!',
  'Reminder: Campaign Invitation Waiting for You - {{campaign_title}}',
  '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #f39c12;">Reminder: Campaign Invitation Pending</h2>
      <p>Hi {{first_name}},</p>
      <p>This is a friendly reminder that you have a pending campaign invitation for <strong>{{campaign_title}}</strong>.</p>
      <p>The campaign is waiting for your response. Please log in to your account to review and accept the invitation.</p>
      <div style="margin: 30px 0;">
        <a href="{{app_url}}/campaigns/{{campaign_id}}" style="background-color: #f39c12; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Review Invitation
        </a>
      </div>
      <p>Don''t miss this opportunity!</p>
      <p>Best regards,<br>The Social Gems Team</p>
    </div>
  </body></html>'
)
ON DUPLICATE KEY UPDATE 
  `title` = VALUES(`title`),
  `content` = VALUES(`content`),
  `email_subject` = VALUES(`email_subject`),
  `email_content` = VALUES(`email_content`);

-- Add template for reminding user to start campaign
INSERT INTO `notification_templates` (`operation`, `channel`, `title`, `content`, `email_subject`, `email_content`) 
VALUES (
  'SEND_REMINDER_START_CAMPAIGN', 
  'EMAIL', 
  'Reminder: Start Your Campaign Tasks', 
  'Time to get started on your campaign!',
  'Reminder: Start Your Campaign - {{campaign_title}}',
  '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #27ae60;">Reminder: Time to Start Your Campaign</h2>
      <p>Hi {{first_name}},</p>
      <p>This is a friendly reminder that you''ve accepted the campaign <strong>{{campaign_title}}</strong>, but haven''t started working on it yet.</p>
      <p>The campaign is currently active and waiting for you to begin. Don''t miss out on this earning opportunity!</p>
      <div style="margin: 30px 0;">
        <a href="{{app_url}}/campaigns/{{campaign_id}}" style="background-color: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Start Campaign Now
        </a>
      </div>
      <p>Remember, completing your tasks on time ensures you get paid faster!</p>
      <p>Best regards,<br>The Social Gems Team</p>
    </div>
  </body></html>'
)
ON DUPLICATE KEY UPDATE 
  `title` = VALUES(`title`),
  `content` = VALUES(`content`),
  `email_subject` = VALUES(`email_subject`),
  `email_content` = VALUES(`email_content`);

