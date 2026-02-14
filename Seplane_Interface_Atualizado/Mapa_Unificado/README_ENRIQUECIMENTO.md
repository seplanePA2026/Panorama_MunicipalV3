# Enriquecimento automático (pontos de ensino)

Ao clicar em um ponto da camada **ESTAB_DE_ENSINO_PA**, o popup busca automaticamente um **POI de educação** próximo ao ponto (prioridade em **5 m**) e tenta preencher:

- Nome da instituição
- Endereço
- Rede (Pública/Privada quando for possível inferir)
- Foto (quando existir em fontes abertas)

## Como testar

1) Abra esta pasta no VSCode
2) Clique com o botão direito em `index.html` → **Open with Live Server**
3) Faça um hard refresh no navegador: **Ctrl + Shift + R**
4) Clique em um ponto azul (ESTAB_DE_ENSINO_PA)

## Precisão quando existem duas instituições próximas

Se o OSM retornar mais de um candidato perto do ponto, o popup exibirá uma seção **"Próximas"** com botões.

- Clique na opção correta
- O mapa **salva sua escolha** neste navegador (localStorage)

## Sobre fotos

Sem API paga, as fotos dependem do cadastro em:

- `image` / `wikidata` / `wikipedia` no OpenStreetMap
- Wikidata (imagem P18)
- Wikimedia Commons (imagens georreferenciadas próximas)

Se você precisa de **foto como no Google Maps** para praticamente todos os pontos, use o **proxy do Google Places** (veja `README_GOOGLE_PROXY.md`).
