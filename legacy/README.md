# Site Legado (Pré-Nuxt)

Este diretório contém a versão estática original do *Meus Livros* (Single Page Application com Vue 3 e Google Charts via CDN, sem build step).

## Como executar

Para servir a aplicação legada localmente:

```bash
cd legacy
python -m http.server 8000
```

Em seguida, acesse `http://localhost:8000`.

## Ciclo de Vida

Estes arquivos são mantidos aqui em estado executável até que o novo app Nuxt alcance paridade funcional de recursos (conforme planejado em `docs/migration.md` §9).
Após a paridade e a conclusão da migração dos dados (`livros.json`), estes arquivos serão arquivados ou removidos conforme o cronograma do projeto.
