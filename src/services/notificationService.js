/**
 * Notification Service - Outgoing webhooks (Discord/Slack)
 */
import { config } from '../config/loader.js';

/**
 * Send Discord webhook notification
 */
export async function sendDiscordNotification(embed) {
  const webhookUrl = config.notifications?.discord_webhook;
  
  if (!webhookUrl) {
    console.log('[Notifications] Discord webhook not configured');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });
    
    if (!response.ok) {
      console.error('[Discord] Webhook failed:', response.status);
      return false;
    }
    
    console.log('[Discord] Notification sent');
    return true;
  } catch (err) {
    console.error('[Discord] Error:', err.message);
    return false;
  }
}

/**
 * Send Slack webhook notification
 */
export async function sendSlackNotification(blocks) {
  const webhookUrl = config.notifications?.slack_webhook;
  
  if (!webhookUrl) {
    console.log('[Notifications] Slack webhook not configured');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    
    if (!response.ok) {
      console.error('[Slack] Webhook failed:', response.status);
      return false;
    }
    
    console.log('[Slack] Notification sent');
    return true;
  } catch (err) {
    console.error('[Slack] Error:', err.message);
    return false;
  }
}

/**
 * Notify about new donation
 */
export async function notifyDonation({ amount, donorHandle, message }) {
  const embed = {
    title: '💰 Nova Doação!',
    color: 0x4ade80, // Green
    fields: [
      { name: 'Valor', value: `R$ ${amount.toFixed(2)}`, inline: true },
      { name: 'Doador', value: donorHandle || 'Anônimo', inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: config.organization.name },
  };
  
  if (message) {
    embed.fields.push({ name: 'Mensagem', value: message });
  }

  await sendDiscordNotification(embed);
  
  // Slack format
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💰 Nova Doação!*\n*R$ ${amount.toFixed(2)}* de ${donorHandle || 'Anônimo'}`,
      },
    },
  ];
  await sendSlackNotification(blocks);
}

/**
 * Notify about new proposal
 */
export async function notifyProposal({ title, authorHandle }) {
  const embed = {
    title: '🗳️ Nova Proposta',
    description: title,
    color: 0x6366f1, // Primary
    fields: [
      { name: 'Autor', value: `@${authorHandle}`, inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: config.organization.name },
  };

  await sendDiscordNotification(embed);
}

export default {
  sendDiscordNotification,
  sendSlackNotification,
  notifyDonation,
  notifyProposal,
};
