# Hub.org

Sistema leve e self-hosted para transparência financeira e governança de projetos Open Source e ONGs.

## Quick Start

```bash
# Instalar dependências
npm install

# Gerar cliente Prisma
npm run db:generate

# Criar banco de dados
npm run db:push

# Iniciar em modo desenvolvimento
npm run dev
```

## Estrutura

```
├── docs/                # Documentação
├── prisma/              # Schema do banco de dados
├── src/
│   ├── app.js           # Entry point (Fastify)
│   ├── config/          # Configurações
│   ├── db/              # Cliente do banco
│   ├── middleware/      # Middlewares
│   └── routes/          # Rotas da API
├── .env                 # Segredos (não versionar)
├── modules.json         # Configurações de runtime
└── package.json
```

## Endpoints

- `GET /` - Informações básicas
- `GET /status` - Health check com status do DB e módulos

## Configuração

- **`.env`**: Segredos (API keys, emails de admin, database)
- **`modules.json`**: Configurações alteráveis via admin UI

Veja [docs/03-guia-de-configuracao.md](./docs/03-guia-de-configuracao.md) para detalhes.

## Licença

MIT
