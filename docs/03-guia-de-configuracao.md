# Guia de Configuração

> **Entenda a diferença crítica entre segredos (`.env`) e configurações de runtime (`modules.json`).**

---

## Filosofia de Configuração

O Hub.org adota uma separação clara entre dois tipos de configuração:

```mermaid
flowchart LR
    subgraph Segredos ["🔒 .env (Segredos)"]
        E1[API Keys]
        E2[Database URL]
        E3[Admin Emails]
        E4[Tokens Secretos]
    end

    subgraph Runtime ["⚙️ modules.json (Runtime)"]
        M1[Módulos habilitados]
        M2[Valores mínimos]
        M3[Regras de votação]
        M4[Feature flags]
    end

    Segredos -->|Apenas via servidor| DEPLOY[Deploy/SSH]
    Runtime -->|Via UI Admin| ADMIN[/admin/settings]
```

| Aspecto                | `.env`             | `modules.json`               |
| ---------------------- | ------------------ | ---------------------------- |
| **Contém**             | Segredos sensíveis | Configurações do sistema     |
| **Alterável via UI?**  | ❌ Nunca           | ✅ Sim, em `/admin/settings` |
| **Versionado no Git?** | ❌ Nunca           | ✅ Pode ser                  |
| **Requer restart?**    | ✅ Sim             | ❌ Não (hot reload)          |
| **Acesso**             | SSH/Deploy         | Painel Admin                 |

---

## Arquivo `.env` — Segredos

O arquivo `.env` contém **apenas informações sensíveis** que nunca devem ser expostas ou alteradas via interface web.

### Exemplo Completo

```bash
# ============================================
# Hub.org - Variáveis de Ambiente
# ============================================
# ⚠️  NUNCA compartilhe este arquivo
# ⚠️  NUNCA versione no Git
# ============================================

# --------------------------------------------
# 🗄️ BANCO DE DADOS
# --------------------------------------------
# SQLite (default) - apenas o caminho do arquivo
DATABASE_URL="file:./data/hub.db"

# PostgreSQL (alternativa para escala)
# DATABASE_URL="postgresql://user:pass@localhost:5432/huborg"

# MySQL (legacy)
# DATABASE_URL="mysql://user:pass@localhost:3306/huborg"

# Turso/LibSQL (edge)
# DATABASE_URL="libsql://your-db.turso.io"
# DATABASE_AUTH_TOKEN="seu-token-turso"

# --------------------------------------------
# 🔐 ADMINISTRADORES
# --------------------------------------------
# Lista de emails com acesso admin (separados por vírgula)
# Esses usuários terão acesso total ao painel /admin
ADMIN_EMAILS="founder@seudominio.org,tech-lead@seudominio.org"

# --------------------------------------------
# 💳 GATEWAY DE PAGAMENTO
# --------------------------------------------
# Stripe (Internacional)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PUBLISHABLE_KEY="pk_live_..."

# PagSeguro (Brasil)
# PAGSEGURO_EMAIL="seu@email.com"
# PAGSEGURO_TOKEN="seu-token-pagseguro"

# --------------------------------------------
# 📧 EMAIL (Magic Link & Notificações)
# --------------------------------------------
# SMTP genérico
SMTP_HOST="smtp.seudominio.org"
SMTP_PORT="587"
SMTP_USER="noreply@seudominio.org"
SMTP_PASS="sua-senha-smtp"
SMTP_FROM="Hub.org <noreply@seudominio.org>"

# Alternativa: Resend.com
# RESEND_API_KEY="re_..."

# Alternativa: SendGrid
# SENDGRID_API_KEY="SG...."

# --------------------------------------------
# 🔑 OAUTH PROVIDERS
# --------------------------------------------
# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# GitHub OAuth
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."

# Discord OAuth (opcional)
# DISCORD_CLIENT_ID="..."
# DISCORD_CLIENT_SECRET="..."

# --------------------------------------------
# 🛡️ SEGURANÇA
# --------------------------------------------
# Chave para assinar cookies e tokens (gere uma aleatória!)
# Comando: openssl rand -hex 32
SESSION_SECRET="sua-chave-super-secreta-com-pelo-menos-32-caracteres"

# URL base da aplicação (sem barra final)
APP_URL="https://hub.seudominio.org"

# Ambiente: development | production
NODE_ENV="production"

# --------------------------------------------
# 📊 MONITORAMENTO (Opcional)
# --------------------------------------------
# Sentry para rastreamento de erros
# SENTRY_DSN="https://...@sentry.io/..."

# --------------------------------------------
# 🕐 CRON / AUTOMAÇÃO (Opcional)
# --------------------------------------------
# Chave para autenticar chamadas de cron externo
CRON_SECRET="chave-para-trigger-externo"
```

### Criando seu `.env`

```bash
# Copie o exemplo
cp .env.example .env

# Gere uma chave de sessão segura
openssl rand -hex 32

# Edite com seus valores
nano .env
```

> ⚠️ **IMPORTANTE:** Adicione `.env` ao seu `.gitignore` imediatamente!

---

## Arquivo `modules.json` — Configurações de Runtime

O arquivo `modules.json` contém **configurações do sistema** que podem ser alteradas pelo administrador via interface web em `/admin/settings`.

### Exemplo Completo

```json
{
  "$schema": "./schemas/modules.schema.json",
  "version": "1.0.0",

  "organization": {
    "name": "Meu Projeto Open Source",
    "description": "Uma breve descrição do projeto",
    "logo_url": "/images/logo.png",
    "primary_color": "#6366f1",
    "currency": "BRL",
    "locale": "pt-BR"
  },

  "modules": {
    "donations": {
      "enabled": true,
      "settings": {
        "min_amount": 5.0,
        "max_amount": 10000.0,
        "allow_anonymous": true,
        "show_donor_handle": true,
        "show_amount": true,
        "show_message": true,
        "suggested_amounts": [10, 25, 50, 100],
        "goal": {
          "enabled": true,
          "target_amount": 5000.0,
          "deadline": "2024-12-31",
          "description": "Meta para manter os servidores em 2024"
        }
      }
    },

    "voting": {
      "enabled": true,
      "settings": {
        "pay_to_create": {
          "enabled": true,
          "amount": 10.0,
          "description": "Taxa para evitar spam de propostas"
        },
        "pay_to_vote": {
          "enabled": false,
          "amount": 0
        },
        "quorum": {
          "min_votes": 10,
          "min_percentage": 0,
          "require_both": false
        },
        "duration_days": 7,
        "allow_comments": false,
        "show_results_during_voting": false
      }
    },

    "transparency": {
      "enabled": true,
      "settings": {
        "show_all_transactions": true,
        "show_transaction_amounts": true,
        "show_donor_messages": true,
        "show_expense_details": true,
        "dashboard_public": true
      }
    },

    "audit_log": {
      "enabled": true,
      "settings": {
        "public": true,
        "log_admin_actions": true,
        "log_user_actions": false,
        "actions_to_log": [
          "BAN_USER",
          "UNBAN_USER",
          "DELETE_PROPOSAL",
          "EDIT_PROPOSAL",
          "CANCEL_VOTE",
          "REFUND_TRANSACTION",
          "CHANGE_SETTINGS"
        ],
        "retention_days": 365
      }
    },

    "cron": {
      "enabled": true,
      "settings": {
        "auto_payments": {
          "enabled": true,
          "schedule": "0 8 1 * *",
          "payments": [
            {
              "id": "hosting",
              "description": "Servidor DigitalOcean",
              "amount": 24.0,
              "currency": "USD",
              "recipient": "DigitalOcean",
              "category": "infrastructure"
            },
            {
              "id": "domain",
              "description": "Renovação de domínio",
              "amount": 40.0,
              "currency": "BRL",
              "recipient": "Registro.br",
              "category": "infrastructure",
              "frequency": "yearly",
              "next_due": "2024-06-15"
            }
          ]
        },
        "backups": {
          "enabled": true,
          "schedule": "0 3 * * *",
          "retention_count": 7
        }
      }
    },

    "notifications": {
      "enabled": false,
      "settings": {
        "email_on_donation": false,
        "email_on_vote_end": false,
        "email_on_goal_reached": true
      }
    }
  },

  "security": {
    "rate_limiting": {
      "enabled": true,
      "requests_per_minute": 60
    },
    "require_email_verification": true,
    "session_duration_hours": 168
  },

  "customization": {
    "custom_css_enabled": false,
    "custom_css_path": "/custom/styles.css",
    "footer_links": [
      {
        "label": "GitHub",
        "url": "https://github.com/seu-projeto"
      },
      {
        "label": "Documentação",
        "url": "/docs"
      }
    ]
  },

  "landing_page": {
    "sections_order": [
      "hero",
      "about",
      "features",
      "transparency",
      "donate",
      "philosophy"
    ],
    "sections_data": {
      "hero": {
        "enabled": true,
        "title": "Transparência Radical",
        "subtitle": "para Projetos que Importam"
      }
    }
  }
}
```

### Configuração de Layout

O layout da página inicial é controlado via `landing_page` no `modules.json`.

- **`sections_order`**: Array definindo a ordem de exibição das seções.
- **`sections_data`**: Configurações específicas (título, subtítulo, habilitado) para cada seção.
  Isso permite reordenar seções facilmente apenas alterando o array.

### Acessando Configurações via UI

O administrador pode alterar essas configurações em `/admin/settings`:

```
┌─────────────────────────────────────────────────┐
│  ⚙️  Configurações do Sistema                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  📦 Módulos                                     │
│  ┌─────────────────────────────────────────┐   │
│  │ [✓] Doações                             │   │
│  │ [✓] Votação                             │   │
│  │ [✓] Transparência                       │   │
│  │ [✓] Audit Log                           │   │
│  │ [ ] Notificações por Email              │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  💰 Doações                                     │
│  ┌─────────────────────────────────────────┐   │
│  │ Valor mínimo:    [R$ 5,00        ]      │   │
│  │ Valor máximo:    [R$ 10.000,00   ]      │   │
│  │ [✓] Permitir doações anônimas           │   │
│  │ [✓] Mostrar valor das doações           │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  🗳️ Votação                                     │
│  ┌─────────────────────────────────────────┐   │
│  │ Taxa para criar proposta: [R$ 10,00]    │   │
│  │ Taxa para votar:          [Gratuito]    │   │
│  │ Duração padrão:           [7 dias  ]    │   │
│  │ Quorum mínimo:            [10 votos]    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [💾 Salvar Configurações]                      │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Fluxo de Configuração Inicial

```mermaid
sequenceDiagram
    participant Dev as Desenvolvedor
    participant Server as Servidor
    participant Admin as Admin UI

    Note over Dev: Setup Inicial
    Dev->>Server: 1. Copia .env.example
    Dev->>Server: 2. Preenche segredos no .env
    Dev->>Server: 3. npm install && npm start

    Note over Server: Primeiro Boot
    Server->>Server: 4. Cria database
    Server->>Server: 5. Roda migrações
    Server->>Server: 6. Carrega modules.json

    Note over Admin: Configuração Runtime
    Admin->>Server: 7. Acessa /admin/settings
    Admin->>Server: 8. Ajusta configurações
    Server->>Server: 9. Atualiza modules.json
    Server->>Server: 10. Hot reload (sem restart)
```

---

## Boas Práticas

### ✅ Faça

- Mantenha o `.env` fora do controle de versão
- Use variáveis de ambiente diferentes para dev/prod
- Documente todas as variáveis no `.env.example`
- Faça backup do `modules.json` antes de alterações grandes
- Valide o `modules.json` contra o schema

### ❌ Não Faça

- Nunca coloque API Keys no `modules.json`
- Nunca exponha o `.env` via web server
- Nunca commite segredos no Git (mesmo "só uma vez")
- Nunca modifique o `.env` pelo painel admin

---

## Validação de Configuração

O sistema valida automaticamente as configurações no boot:

```javascript
// src/config/validator.js
import Ajv from "ajv";
import schema from "../schemas/modules.schema.json";

export function validateModulesConfig(config) {
  const ajv = new Ajv();
  const validate = ajv.compile(schema);

  if (!validate(config)) {
    console.error("❌ Configuração inválida:");
    validate.errors.forEach((err) => {
      console.error(`   ${err.instancePath}: ${err.message}`);
    });
    process.exit(1);
  }

  console.log("✅ Configuração validada com sucesso");
  return config;
}
```

---

## Próximos Passos

- **[Módulos do Sistema](./04-modulos-do-sistema.md)** — Entenda cada módulo em detalhes.
- **[Banco de Dados](./05-banco-de-dados.md)** — Veja o schema completo.
