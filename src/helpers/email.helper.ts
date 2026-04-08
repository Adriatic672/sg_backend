import nodemailer from 'nodemailer';
import { Transporter, SendMailOptions } from 'nodemailer';

export default class EmailSender {
    private transporter: Transporter | null = null;

    constructor() {
        const host = process.env.SMTP_HOST;
        const user = process.env.MAILGUN_SMTP_USER || process.env.SMTP_USER;
        const pass = process.env.MAILGUN_SMTP_PASSWORD || process.env.SMTP_PASS;
        const port = Number(process.env.SMTP_PORT) || 2525;

        if (host && user && pass) {
            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure: false,
                requireTLS: false,
                auth: { user, pass },
                logger: true,
            });
        }
    }

    async sendMail(to: string, subject: string, heading: string, body: string) {
        if (!this.transporter) {
            console.log(`[MockEmail] To: ${to} | Subject: ${subject}`);
            return true;
        }

        const html = this.createHtmlEmail(heading, body);
        let envSubject = process.env.TABLE_IDENTIFIER
        if (envSubject == "stage") {
            envSubject = subject + " (Stage) "
        } else {
            envSubject = subject
        }

        const mailOptions: SendMailOptions = {
            from: `Social Gems <${process.env.MAILGUN_SMTP_FROM || 'you@yourdomain.com'}>`, // Specify the sender's name and email
            to,
            subject: envSubject,
            html,
        };

        try {
            const info = await this.transporter!.sendMail(mailOptions);
            console.log('Message sent: %s', info.messageId);
            return true;
        } catch (error) {
            console.error('Error sending email:', error);
            return false;
        }
    }

    private createHtmlEmail(heading: string, body: string, footer = "The Social Gems Team"): string {
      return `
    <!DOCTYPE html>
    <html lang="en" xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Social Gems Email</title>
        <style>
          /* Reset & Responsive Fixes */
          body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
          img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
          body { margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif; }
          table { border-collapse: collapse !important; }
          a { color: #F1C75B; text-decoration: none; }
    
          /* Responsive Styles */
          @media screen and (max-width: 600px) {
            .email-container { width: 100% !important; }
            .content { padding: 20px !important; font-size: 15px !important; }
            .header-logo img { max-height: 60px !important; }
            .app-buttons img { height: 34px !important; }
          }
        </style>
      </head>
      <body bgcolor="#f4f4f4">
    
        <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f4">
          <tr>
            <td align="center" style="padding:20px 10px;">
              <table class="email-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
    
                <!-- Branding -->
                <tr>
                  <td align="center" bgcolor="#F1C75B" style="padding:25px 15px 15px 15px;">
                    <div class="header-logo">
                      <img src="https://admin.socialgems.me/assets/slogo-B_GKtXUA.png" alt="Social Gems" style="max-height:40px; display:block; margin:0 auto;">
                    </div>
                  </td>
                </tr>
    
                <!-- Heading -->
                <tr>
                  <td bgcolor="#fff" style="padding:15px 25px;">
                    <div style="font-weight:700; font-size:24px; color:#000; margin-top:0px;">${heading}</div>
                  </td>
                </tr>            
    
                <!-- Body -->
                <tr>
                  <td class="content" style="padding:10px 25px; font-size:16px; line-height:1.7; color:#1F2937;">
                    <p style="margin:0 0 12px;">${body}</p>
                  </td>
                </tr>
    
                <!-- CTA / Download Banner -->
                <tr>
                  <td bgcolor="#fff8dc" align="center" style="padding:20px 15px; border-top:1px solid #ffe599;">
                    <p style="margin:0 0 12px; font-weight:bold; color:#111;">Download the Social Gems App Now!</p>
                    <table cellpadding="0" cellspacing="0" border="0" align="center" class="app-buttons">
                      <tr>
                        <td style="padding:0 5px;">
                          <a href="https://play.google.com/store/apps/details?id=com.tekjuice.social_gems" target="_blank">
                            <img src="https://social-gems.s3.us-east-1.amazonaws.com/Playstore.png" alt="Get it on Google Play" style="height:38px; display:block;">
                          </a>
                        </td>
                        <td style="padding:0 5px;">
                          <a href="https://apps.apple.com/ug/app/social-gems/id6736918664" target="_blank">
                            <img src="https://social-gems.s3.us-east-1.amazonaws.com/Appstore.png" alt="Download on the App Store" style="height:38px; display:block;">
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
    
                <!-- Stay Connected / Socials -->
                <tr>
                  <td style="font-size:0px;padding:25px 5px 5px 5px;word-break:break-word" align="center">
                    <div style="font-family:Arial, sans-serif;font-size:14px;font-weight:900;line-height:20px;text-align:center;color:#f0b90b">Stay connected!</div>
                  </td>
                </tr>   
    
                <tr>
                  <td align="center" style="padding:0 0 10px 0;font-size:0">
                    <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                      <tr>
                        <td style="padding:0 10px;"><a href="https://www.facebook.com/share/1DRXjrUcan/?mibextid=LQQJ4d" target="_blank"><img src="https://social-gems.s3.us-east-1.amazonaws.com/Facebook.png" alt="Fb" width="24" style="display:block;border:0;"></a></td>
                        <td style="padding:0 10px;"><a href="https://x.com/socialgems_ug?s=21&t=e3hDCBTz5hi2lkSy-3BO9A" target="_blank"><img src="https://social-gems.s3.us-east-1.amazonaws.com/X.png" alt="Tw" width="24" style="display:block;border:0;"></a></td>
                        <td style="padding:0 10px;"><a href="https://www.instagram.com/socialgems.ug?igsh=YXJoYzl5bTBvMTRn" target="_blank"><img src="https://social-gems.s3.us-east-1.amazonaws.com/Instagram.png" alt="Inst" width="24" style="display:block;border:0;"></a></td>
                        <td style="padding:0 10px;"><a href="https://www.tiktok.com/@social_gems_?_t=ZM-8uQSMzJIl7O&_r=1" target="_blank"><img src="https://social-gems.s3.us-east-1.amazonaws.com/TikTok.png" alt="TikTok" width="24" style="display:block;border:0;"></a></td>
                        <td style="padding:0 10px;"><a href="https://youtube.com/@socialgems.africa?si=D1fE5QGW43k3cxS_" target="_blank"><img src="https://social-gems.s3.us-east-1.amazonaws.com/YouTube.png" alt="YouTube" width="24" style="display:block;border:0;"></a></td>
                        <td style="padding:0 10px;"><a href="https://www.linkedin.com/company/social-gems-africa/" target="_blank"><img src="https://social-gems.s3.us-east-1.amazonaws.com/Linkedin.png" alt="In" width="24" style="display:block;border:0;"></a></td>
                      </tr>
                    </table>
                  </td>
                </tr>
    
                <!-- Footer -->
                <tr>
                  <td align="center" style="padding:20px; font-size:12px; color:#6B7280; background-color:#ffffff;">
                    <p style="margin:0; font-weight:700; color:#111111;">Social Gems Limited</p>
                    <p style="margin:0;"><a href="#" style="color:#6B7280; text-decoration:underline;">Unsubscribe</a></p>
                  </td>
                </tr>
    
              </table>
            </td>
          </tr>
        </table>
    
      </body>
    </html>
      `;
    }
    
      
      
    //       <p><a href="#">Unsubscribe</a></p>

}
