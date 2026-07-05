import dotenv from 'dotenv';
import EmailSender from './src/helpers/email.helper';

// Load environment variables
dotenv.config();

async function testEmail() {
  const recipient = process.argv[2] || 'your-email@example.com'; // Pass email as argument

  if (recipient === 'your-email@example.com') {
    console.log('❌ Please provide a recipient email address.');
    console.log('Usage: npm run test-email your-email@gmail.com');
    console.log('   or: ts-node test-email.ts your-email@gmail.com');
    process.exit(1);
  }

  console.log(`📧 Sending test email to: ${recipient}`);
  console.log(`From: ${process.env.SMTP_FROM}`);

  const emailSender = new EmailSender();

  const success = await emailSender.sendMail(
    recipient,
    'SMTP2GO Test Email',
    'SMTP2GO Integration Test',
    `Hello! This is a test email from Social Gems using SMTP2GO.<br><br>
     If you received this, your SMTP2GO integration is working correctly!<br><br>
     Timestamp: ${new Date().toISOString()}`
  );

  if (success) {
    console.log('✅ Email sent successfully! Check your inbox (and spam folder).');
  } else {
    console.log('❌ Failed to send email. Check the error logs above.');
  }
}

testEmail();
