# Customização Visual

> **Personalize a aparência do Hub.org**

---

## Cores do Tema

### Cor Primária

Defina a cor principal no `modules.json`:

```json
{
  "organization": {
    "primary_color": "#6366f1"
  }
}
```

**Sugestões de cores:**
| Estilo | Hex |
|--------|-----|
| Índigo (padrão) | `#6366f1` |
| Azul | `#3b82f6` |
| Verde | `#10b981` |
| Rosa | `#ec4899` |
| Laranja | `#f97316` |

---

## Modo Claro/Escuro

### Toggle Automático

O Hub.org suporta temas dinâmicos. O usuário pode alternar pelo botão 🌙/☀️ no header.

### Tema Padrão

Configure o tema inicial no `modules.json`:

```json
{
  "theme": {
    "default": "dark"
  }
}
```

Opções: `"dark"` ou `"light"`

### Persistência

A preferência do usuário é salva no `localStorage` do navegador e persiste entre sessões.

---

## CSS Personalizado

### Classes Principais

| Classe           | Descrição            |
| ---------------- | -------------------- |
| `.glass`         | Efeito glassmorphism |
| `.gradient-bg`   | Gradiente de fundo   |
| `.animate-float` | Animação flutuante   |

### Sobrescrevendo Estilos

Adicione CSS personalizado no `src/views/layout.ejs`:

```html
<style>
  /* Suas customizações aqui */
  .glass {
    background: rgba(0, 0, 0, 0.2);
  }
</style>
```

---

## Seções da Landing Page

### Reordenando

Use o Admin Panel (`/admin`) ou edite diretamente:

```json
{
  "landing_page": {
    "sections_order": ["hero", "about", "updates", "donate", "transparency"]
  }
}
```

### Habilitando/Desabilitando

```json
{
  "landing_page": {
    "sections_data": {
      "features": {
        "enabled": false
      }
    }
  }
}
```

---

## Próximos Passos

- **[Guia de Configuração](./03-guia-de-configuracao.md)** — Configurações completas
