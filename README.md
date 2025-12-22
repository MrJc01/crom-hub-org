# 🏛️ Hub.org

> **Plataforma de Transparência, Financiamento e Governança para Projetos Open Source**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/hub-org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ Funcionalidades

| Módulo           | Descrição                                         |
| ---------------- | ------------------------------------------------- |
| 💰 **Doações**   | Receba doações via Stripe com total transparência |
| 📊 **Dashboard** | Visualize saldo, entradas e saídas em tempo real  |
| 🗳️ **Votação**   | Governança participativa com propostas e votos    |
| 📝 **Updates**   | Blog de atualizações estilo changelog             |
| 🤖 **Cron**      | Pagamentos automáticos de infraestrutura          |
| 📋 **Audit Log** | Registro público de ações administrativas         |

---

## 🚀 Início Rápido

### 1. Clone o repositório

```bash
git clone https://github.com/hub-org/hub-org.git
cd hub-org
npm install
```

### 2. Configure o ambiente

```bash
cp .env.example .env
# Edite .env com suas configurações
```

### 3. Inicialize o banco de dados

```bash
npx prisma db push
```

### 4. Inicie o servidor

```bash
npm run dev
```

Acesse: **http://localhost:3000**

---

## ⚙️ Configuração

Todas as configurações ficam no `modules.json`:

```json
{
  "organization": {
    "name": "Meu Projeto",
    "primary_color": "#6366f1"
  },
  "modules": {
    "donations": { "enabled": true },
    "voting": { "enabled": true }
  }
}
```

📖 Documentação completa em [`docs/`](./docs/)

---

## 🔐 Variáveis de Ambiente

| Variável            | Descrição                  |
| ------------------- | -------------------------- |
| `DATABASE_URL`      | URL do banco SQLite        |
| `ADMIN_EMAILS`      | Emails dos administradores |
| `STRIPE_SECRET_KEY` | Chave secreta do Stripe    |
| `SESSION_SECRET`    | Chave para sessões         |

Veja `.env.example` para a lista completa.

---

## 🚢 Deploy

### Railway (Recomendado)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/hub-org)

### Render

1. Fork este repositório
2. Crie um Web Service no Render
3. Configure as variáveis de ambiente
4. Deploy!

### Docker

```bash
docker build -t hub-org .
docker run -p 3000:3000 --env-file .env hub-org
```

---

## 📚 Documentação

- [Visão Geral](./docs/01-visao-geral.md)
- [Arquitetura](./docs/02-arquitetura.md)
- [Guia de Configuração](./docs/03-guia-de-configuracao.md)
- [Módulos do Sistema](./docs/04-modulos-do-sistema.md)
- [Banco de Dados](./docs/05-banco-de-dados.md)
- [Customização Visual](./docs/06-customizacao-visual.md)

---

## 🤝 Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para detalhes sobre como contribuir.

---

## 📄 Licença

MIT © Hub.org Contributors

---

<p align="center">
  <sub>Feito com ❤️ para a comunidade Open Source</sub>
</p>
