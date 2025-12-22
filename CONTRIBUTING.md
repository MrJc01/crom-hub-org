# Contribuindo para o Hub.org

Obrigado por querer contribuir! 🎉

## 📋 Como Contribuir

### Reportando Bugs

1. Verifique se o bug já foi reportado
2. Crie uma issue com título descritivo
3. Inclua: passos para reproduzir, comportamento esperado, comportamento atual

### Sugerindo Melhorias

1. Abra uma issue com tag `enhancement`
2. Descreva a funcionalidade e seu caso de uso

### Pull Requests

1. Fork o repositório
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Faça commits semânticos: `feat: add new module`
4. Rode os testes: `npm test`
5. Abra um PR para a branch `main`

---

## 🧩 Criando Novos Módulos

### Estrutura de um Módulo

```
src/
├── services/
│   └── meuModuloService.js    # Lógica de negócio
├── routes/
│   └── meuModulo.js           # Endpoints HTTP
└── views/
    └── pages/
        └── meu-modulo.ejs     # Interface (opcional)
```

### 1. Criar o Service

```javascript
// src/services/meuModuloService.js
import { prisma } from "../db/client.js";
import { config } from "../config/loader.js";

export async function minhaFuncao() {
  // Sua lógica aqui
}
```

### 2. Criar as Rotas

```javascript
// src/routes/meuModulo.js
import { minhaFuncao } from "../services/meuModuloService.js";

export function registerMeuModuloRoutes(app) {
  app.get("/meu-modulo", async (req, reply) => {
    const data = await minhaFuncao();
    return reply.send(data);
  });
}
```

### 3. Registrar no app.js

```javascript
import { registerMeuModuloRoutes } from "./routes/meuModulo.js";
// ...
registerMeuModuloRoutes(app);
```

### 4. Adicionar ao modules.json

```json
{
  "modules": {
    "meu_modulo": {
      "enabled": true,
      "settings": {}
    }
  }
}
```

---

## 📏 Padrões de Código

- **ESLint**: `npm run lint`
- **Prettier**: `npm run format`
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`)

---

## 🧪 Testes

```bash
npm test
```

---

## 📄 Licença

Ao contribuir, você concorda que suas contribuições serão licenciadas sob a Licença MIT.
