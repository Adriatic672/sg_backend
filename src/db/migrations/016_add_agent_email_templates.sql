INSERT INTO notification_templates (operation, title, body) 
VALUES (
  'ADD_AGENT',
  'Welcome to Social Gems - Agent Account Created',
  'Dear {name},<br><br>
   Welcome to Social Gems! Your agent account has been successfully created.<br><br>
   <strong>Your Login Credentials:</strong><br>
   Email: Check your email inbox<br>
   Temporary Password: <strong>{otp}</strong><br><br>
   Please log in to the agent portal and change your password immediately for security purposes.<br><br>
   <a href="{AGENT_URL}" style="background-color: #ffcc66; color: #333333; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Login to Agent Portal</a><br><br>
   If you have any questions or need assistance, please contact our support team.<br><br>
   Best regards,<br>
   The Social Gems Team'
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  body = VALUES(body);

-- Template for when an agent password is reset by admin
INSERT INTO notification_templates (operation, title, body) 
VALUES (
  'RESET_AGENT_PASSWORD',
  'Your Social Gems Agent Password Has Been Reset',
  'Dear {name},<br><br>
   Your Social Gems agent account password has been reset by an administrator.<br><br>
   <strong>Your New Temporary Password:</strong> <strong>{otp}</strong><br><br>
   Please log in to the agent portal using this temporary password and change it immediately for security purposes.<br><br>
   <a href="{AGENT_URL}" style="background-color: #ffcc66; color: #333333; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Login to Agent Portal</a><br><br>
   If you did not request this password reset, please contact our support team immediately.<br><br>
   Best regards,<br>
   The Social Gems Team'
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  body = VALUES(body);

