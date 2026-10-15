import nodemailer from 'nodemailer';

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      // for shared hosting
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return transporter;
};

export const sendOtpEmail = async (email, otp) => {
  // If SMTP credentials are not configured in dev, log to console safely for testing
  if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('your_email')) {
    console.log(`[DEV EMAIL SIMULATION] Sending OTP to ${email}: ${otp}`);
    return true;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"AstroTring" <no-reply@astrotring.com>',
    to: email,
    subject: 'Your AstroTring Verification Code',
    text: `Your verification code is: ${otp}. It will expire in 10 minutes.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #0d0b14; color: #f3f4f6; border-radius: 8px;">
        <h2 style="color: #f59e0b; margin-top: 0;">AstroTring Verification Code</h2>
        <p>Please use the following 6-digit one-time passcode to verify your email address:</p>
        <div style="background-color: #1a162b; padding: 16px; border-radius: 6px; font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; color: #f59e0b; margin: 24px 0;">
          ${otp}
        </div>
        <p style="color: #9ca3af; font-size: 14px;">This code is valid for 10 minutes. If you did not request this verification, please disregard this email.</p>
      </div>
    `
  };

  const client = getTransporter();
  return await client.sendMail(mailOptions);
};
