import { config } from '../../config/loader.js';

// Import providers (will be created next)
// Dynamic import or switch case based on config would be better for tree-shaking 
// but for simplicity we'll implement a registry.

class PaymentService {
  constructor() {
    this.providers = new Map();
    this.defaultProvider = null;
    this.initialize();
  }

  initialize() {
    const paymentConfig = config.modules?.payments || {};

    // Initialize configured providers
    // We will implement specific providers as needed
    if (paymentConfig.stripe?.enabled) {
      // this.registerProvider('stripe', new StripeProvider(paymentConfig.stripe));
    }
    
    if (paymentConfig.mercadopago?.enabled) {
      // this.registerProvider('mercadopago', new MercadoPagoProvider(paymentConfig.mercadopago));
    }

    if (paymentConfig.manual?.enabled) {
      // Manual provider is always available if enabled
      this.registerProvider('manual', {
        createPayment: async (amount, metadata) => ({
          status: 'pending',
          instructions: paymentConfig.manual.instructions,
          pix_key: paymentConfig.manual.pix_key,
          id: `manual_${Date.now()}`
        })
      });
      this.defaultProvider = 'manual';
    }
  }

  registerProvider(name, providerInstance) {
    this.providers.set(name, providerInstance);
    if (!this.defaultProvider) {
      this.defaultProvider = name;
    }
  }

  getProvider(name) {
    const provider = this.providers.get(name) || this.providers.get(this.defaultProvider);
    if (!provider) {
      throw new Error(`Payment provider '${name}' not found and no default available.`);
    }
    return provider;
  }

  async createPayment(providerName, { amount, currency, description, metadata }) {
    const provider = this.getProvider(providerName);
    return await provider.createPayment({ amount, currency, description, metadata });
  }

  async verifyPayment(providerName, paymentId) {
    const provider = this.getProvider(providerName);
    if (provider.verifyPayment) {
        return await provider.verifyPayment(paymentId);
    }
    throw new Error(`Provider ${providerName} does not support automatic verification.`);
  }
}

export const paymentService = new PaymentService();
