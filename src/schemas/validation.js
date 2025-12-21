import { z } from 'zod';

/**
 * Donation request schema
 */
export const donateSchema = z.object({
  amount: z.number()
    .positive('Valor deve ser positivo')
    .min(0.01, 'Valor mínimo: R$ 0.01'),
  message: z.string().max(500).optional(),
  email: z.string().email('Email inválido').optional(),
});

/**
 * Expense request schema (Admin only)
 */
export const expenseSchema = z.object({
  amount: z.number()
    .positive('Valor deve ser positivo')
    .min(0.01, 'Valor mínimo: R$ 0.01'),
  description: z.string()
    .min(3, 'Descrição deve ter pelo menos 3 caracteres')
    .max(200, 'Descrição máxima: 200 caracteres'),
  category: z.enum([
    'infrastructure',
    'service',
    'salary',
    'marketing',
    'legal',
    'other'
  ]).default('other'),
  recipient: z.string().max(100).optional(),
});

/**
 * Pagination query schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * User email schema
 */
export const emailSchema = z.object({
  email: z.string().email('Email inválido'),
});

/**
 * Validate request body with Zod schema
 * Returns a Fastify preHandler hook
 */
export function validateBody(schema) {
  return async (request, reply) => {
    const result = schema.safeParse(request.body);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Dados inválidos na requisição',
        details: errors,
      });
    }
    
    request.validatedBody = result.data;
  };
}

/**
 * Validate query params with Zod schema
 */
export function validateQuery(schema) {
  return async (request, reply) => {
    const result = schema.safeParse(request.query);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Parâmetros inválidos',
        details: errors,
      });
    }
    
    request.validatedQuery = result.data;
  };
}
