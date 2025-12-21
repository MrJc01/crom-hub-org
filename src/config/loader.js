import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { config as dotenvConfig } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..", "..");

// ============================================
// Zod Schemas
// ============================================

// Environment Variables Schema
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  ADMIN_EMAILS: z.string().min(1, "ADMIN_EMAILS é obrigatório"),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET deve ter pelo menos 16 caracteres"),
  APP_URL: z.string().url().optional().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Stripe (opcional em desenvolvimento)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // SMTP (opcional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // OAuth (opcional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Cron
  CRON_SECRET: z.string().optional(),
});

// Modules JSON Schema
const modulesSchema = z.object({
  version: z.string(),

  organization: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    logo_url: z.string().optional(),
    primary_color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    currency: z.string().length(3).default("BRL"),
    locale: z.string().default("pt-BR"),
  }),

  modules: z.object({
    donations: z
      .object({
        enabled: z.boolean(),
        settings: z
          .object({
            min_amount: z.number().positive(),
            max_amount: z.number().positive(),
            allow_anonymous: z.boolean().default(true),
            show_donor_handle: z.boolean().default(true),
            show_amount: z.boolean().default(true),
            suggested_amounts: z.array(z.number()).optional(),
          })
          .optional(),
      })
      .optional(),

    voting: z
      .object({
        enabled: z.boolean(),
        settings: z
          .object({
            pay_to_create: z
              .object({
                enabled: z.boolean(),
                amount: z.number().min(0),
              })
              .optional(),
            pay_to_vote: z
              .object({
                enabled: z.boolean(),
                amount: z.number().min(0),
              })
              .optional(),
            quorum: z
              .object({
                min_votes: z.number().int().positive(),
              })
              .optional(),
            duration_days: z.number().int().positive().default(7),
          })
          .optional(),
      })
      .optional(),

    transparency: z
      .object({
        enabled: z.boolean(),
        settings: z
          .object({
            show_all_transactions: z.boolean().default(true),
            show_transaction_amounts: z.boolean().default(true),
            dashboard_public: z.boolean().default(true),
          })
          .optional(),
      })
      .optional(),

    audit_log: z
      .object({
        enabled: z.boolean(),
        settings: z
          .object({
            public: z.boolean().default(true),
            log_admin_actions: z.boolean().default(true),
            actions_to_log: z.array(z.string()).optional(),
            retention_days: z.number().int().positive().default(365),
          })
          .optional(),
      })
      .optional(),

    cron: z
      .object({
        enabled: z.boolean(),
        settings: z
          .object({
            auto_payments: z
              .object({
                enabled: z.boolean(),
                payments: z
                  .array(
                    z.object({
                      id: z.string(),
                      description: z.string(),
                      amount: z.number().positive(),
                      currency: z.string().length(3),
                      recipient: z.string(),
                    })
                  )
                  .optional(),
              })
              .optional(),
          })
          .optional(),
      })
      .optional(),
  }),

  security: z
    .object({
      rate_limiting: z
        .object({
          enabled: z.boolean().default(true),
          requests_per_minute: z.number().int().positive().default(60),
        })
        .optional(),
      session_duration_hours: z.number().int().positive().default(168),
    })
    .optional(),

  landing_page: z
    .object({
      sections_order: z.array(z.string()),
      sections_data: z.record(
        z.object({
          enabled: z.boolean().default(true),
          // Allow any other settings properties
        }).catchall(z.any())
      ),
    })
    .optional(),
});

// ============================================
// Loaders
// ============================================

function loadEnv() {
  const envPath = join(ROOT_DIR, ".env");

  if (!existsSync(envPath)) {
    console.error("❌ Arquivo .env não encontrado!");
    console.error("   Copie .env.example para .env e preencha os valores.");
    process.exit(1);
  }

  dotenvConfig({ path: envPath });

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Erro de validação do .env:");
    result.error.errors.forEach((err) => {
      console.error(`   ${err.path.join(".")}: ${err.message}`);
    });
    process.exit(1);
  }

  console.log("✅ Variáveis de ambiente validadas");
  return result.data;
}

function loadModules() {
  const modulesPath = join(ROOT_DIR, "modules.json");

  if (!existsSync(modulesPath)) {
    console.error("❌ Arquivo modules.json não encontrado!");
    process.exit(1);
  }

  let rawContent;
  try {
    rawContent = JSON.parse(readFileSync(modulesPath, "utf-8"));
  } catch (err) {
    console.error("❌ Erro ao parsear modules.json:");
    console.error(`   ${err.message}`);
    process.exit(1);
  }

  const result = modulesSchema.safeParse(rawContent);

  if (!result.success) {
    console.error("❌ Erro de validação do modules.json:");
    result.error.errors.forEach((err) => {
      console.error(`   ${err.path.join(".")}: ${err.message}`);
    });
    process.exit(1);
  }

  console.log("✅ Configurações de módulos validadas");
  return result.data;
}

// ============================================
// Config Export
// ============================================

const env = loadEnv();
const modules = loadModules();

// Parse admin emails into array
const adminEmails = env.ADMIN_EMAILS.split(",").map((e) =>
  e.trim().toLowerCase()
);

export const config = {
  // Environment
  env: env.NODE_ENV,
  isDev: env.NODE_ENV === "development",
  isProd: env.NODE_ENV === "production",

  // Server
  port: parseInt(process.env.PORT || "3000", 10),
  appUrl: env.APP_URL,

  // Database
  databaseUrl: env.DATABASE_URL,

  // Security
  sessionSecret: env.SESSION_SECRET,
  adminEmails,

  // Stripe
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  },

  // SMTP
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : undefined,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },

  // OAuth
  oauth: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },

  // Cron
  cronSecret: env.CRON_SECRET,

  // Modules (from modules.json)
  organization: modules.organization,
  modules: modules.modules,
  security: modules.security,
  version: modules.version,
  landingPage: modules.landing_page || { sections_order: [], sections_data: {} },
};

export function isAdmin(email) {
  if (!email) return false;
  return adminEmails.includes(email.toLowerCase());
}

export default config;
