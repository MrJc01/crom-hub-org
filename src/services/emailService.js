import { config } from '../config/loader.js';
import nodemailer from 'nodemailer';

let transporter = null;

if (config.smtp?.host && !config.isDev) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port || 587,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

/**
 * Send an email
 * In development, this just logs to console
 */
export async function sendEmail({ to, subject, html, text }) {
  if (config.isDev && !transporter) {
    console.log('\n================ EMAIL ================');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('---------------------------------------');
    console.log(text || html);
    console.log('=======================================\n');
    return true;
  }

  if (transporter) {
    try {
      await transporter.sendMail({
        from: config.smtp.from || '"Hub.org" <noreply@hub.org>',
        to,
        subject,
        text,
        html,
      });
      return true;
    } catch (err) {
      console.error('Failed to send email:', err);
      return false;
    }
  }

  console.warn('Email service not configured and not in dev mode.');
  return false;
}
