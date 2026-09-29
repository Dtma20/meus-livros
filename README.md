# Vue 3 + Vite

## Resenhas gravadas no JSON

O botão **Adicionar livro** no cabeçalho abre o cadastro. No modal de um livro, **Editar livro** altera seus dados e **Remover livro** pede confirmação antes de excluir. Essas ações gravam em `public/livros.json` e atualizam a biblioteca e seus indicadores. Autores podem ser informados um por linha e gêneros separados por vírgulas. A edição dos dados preserva a resenha existente.

Execute `npm run dev` e use o botão **Salvar resenha** no modal. O servidor grava o campo `review` em `public/livros.json` (ou `public/quadrinhos.json` para quadrinhos). Novas resenhas usam `review_format: "text"` para preservar texto e quebras de linha sem interpretar HTML. As resenhas antigas em HTML continuam compatíveis.

`npm run build` seguido de `npm run preview` também oferece a gravação e lê as coleções atualizadas de `public/`. O servidor precisa de permissão para escrever nessa pasta. Esta API é destinada ao uso local; não a exponha publicamente sem autenticação.

Uma hospedagem apenas estática não executa esta API: publicar somente `dist/` não permite editar os arquivos no servidor. Nesse caso, é necessário hospedar um backend com armazenamento persistente.

Resenhas antigas salvas no navegador continuam acessíveis; para transferi-las ao JSON, abra a resenha, clique em **Editar resenha** e depois em **Salvar resenha**.

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).
