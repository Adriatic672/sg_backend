-- Add notification templates for job board payments
-- Run this to enable payment notifications

INSERT INTO notification_templates (operation, title, body, channel, category) VALUES 
('JOB_COMPLETED', 'Job Completed!', 'Your work has been approved! Payment of {amount} has been processed.', 'ALL', 'WALLET')
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

INSERT INTO notification_templates (operation, title, body, channel, category) VALUES 
('PAYMENT_RECEIVED', 'Payment Received!', 'You received {amount}.', 'ALL', 'WALLET')
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

INSERT INTO notification_templates (operation, title, body, channel, category) VALUES 
('WORK_APPROVED', 'Work Approved!', 'Your submission has been approved. Payment is on the way!', 'ALL', 'CAMPAIGN')
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);
