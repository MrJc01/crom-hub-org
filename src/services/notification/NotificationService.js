import nodemailer from 'nodemailer';
import { config } from '../../config/loader.js';

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.whatsappConfig = null;
    this.initialize();
  }

  initialize() {
    const integrations = config.modules?.integrations || {};

    // Email Setup
    if (integrations.email?.enabled) {
      this.emailTransporter = nodemailer.createTransport({
        host: integrations.email.host,
        port: integrations.email.port,
        secure: integrations.email.port === 465, // true for 465, false for other ports
        auth: {
          user: integrations.email.user,
          pass: integrations.email.pass,
        },
      });
      this.emailFrom = integrations.email.from;
    }

    // WhatsApp Setup
    if (integrations.whatsapp?.enabled) {
      this.whatsappConfig = integrations.whatsapp;
    }
  }

  async sendEmail(to, subject, html) {
    if (!this.emailTransporter) {
      console.warn('⚠️ Email service not enabled or configured.');
      return false;
    }

    try {
      const info = await this.emailTransporter.sendMail({
        from: this.emailFrom,
        to,
        subject,
        html,
      });
      console.log('📧 Email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }
  }

  async sendWhatsApp(to, templateName, components = []) {
    if (!this.whatsappConfig || !this.whatsappConfig.enabled) {
      console.warn('⚠️ WhatsApp service not enabled.');
      return false;
    }

    try {
      // Official WhatsApp Business API implementation
      const url = `https://graph.facebook.com/v19.0/${this.whatsappConfig.phone_number_id}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.whatsappConfig.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'pt_BR' }, // Configurable?
            components: components
          }
        })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message);
      }
      
      console.log('📱 WhatsApp sent:', data.messages?.[0]?.id);
      return true;
    } catch (error) {
      console.error('❌ Failed to send WhatsApp:', error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
