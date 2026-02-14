# Fotos do Google Maps (opcional) — Proxy Google Places

Para obter fotos como as do Google Maps em praticamente todos os pontos, **não dá** para puxar direto do navegador sem expor a chave.
A solução correta é usar um **proxy (backend)** que chama o Google Places/Photos e devolve JSON + imagens com CORS.

Este pacote já está pronto para usar um proxy, bastando configurar `window.Q2W_ENRICH_CONFIG.googleProxyUrl`.

## Opção mais simples: Cloudflare Worker

### 1) Crie o Worker
- No Cloudflare Dashboard → Workers & Pages → Create Worker
- Cole o código do arquivo `google_proxy_worker.js`

### 2) Configure a chave
No Worker, em *Settings → Variables*:
- **GOOGLE_PLACES_KEY** = sua chave (API Key) com **Places API** habilitada

### 3) Publique
Depois de publicar, você terá uma URL tipo:
- `https://seu-worker.seu-subdominio.workers.dev`

### 4) Configure o mapa
Abra `index.html` e adicione **antes** de carregar `resources/enrichment.js`:

```html
<script>
  window.Q2W_ENRICH_CONFIG = {
    // aponta para o endpoint /lookup do worker
    googleProxyUrl: 'https://seu-worker.seu-subdominio.workers.dev/lookup'
  };
</script>
```

Pronto: ao clicar nos pontos, o popup passa a receber `name`, `address` e `photoUrl` do Google.

---

## Observações
- **Custo**: Google Places é cobrado por uso. Ative billing e acompanhe limites.
- **Termos**: respeite os termos do Google para exibição de conteúdo.
- O proxy serve a foto via `/photo?ref=...` para **não vazar a API key** no front-end.
