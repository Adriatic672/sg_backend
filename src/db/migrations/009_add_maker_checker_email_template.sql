-- Add email template for maker-checker requests
INSERT INTO notification_templates (operation, subject, message) VALUES (
  'MAKER_CHECKER_REQUEST',
  'New Maker-Checker Request - Action Required',
  'A new maker-checker request has been created and requires your approval.<br><br>
   <strong>Request Details:</strong><br>
   Request ID: {request_id}<br>
   Operation: {operation_type}<br>
   Table: {table_name}<br>
   Maker: {maker_user_id}<br><br>
   Please log into the admin panel to review and approve/reject this request.<br><br>
   <a href="https://admin.socialgems.me/approvals" style="background-color: #ffcc66; color: #333333; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Request</a>'
);
