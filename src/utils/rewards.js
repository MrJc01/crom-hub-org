import { config } from '../config/loader.js';

/**
 * Get badges for a user based on their total donation amount
 * @param {number} totalDonated 
 * @returns {Array<{tag: string, color: string, amount: number}>}
 */
export function getUserBadges(totalDonated) {
    const rewards = config.modules.donations?.settings?.rewards || [];
    if (!rewards.length || !totalDonated) return [];

    // Filter rewards that user has achieved
    // If we want cumulative badges:
    // return rewards.filter(r => totalDonated >= r.amount);
    
    // If we want only the highest badge:
    const eligible = rewards.filter(r => totalDonated >= r.amount);
    return eligible.length ? [eligible[eligible.length - 1]] : [];
}
