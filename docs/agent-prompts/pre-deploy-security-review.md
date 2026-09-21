# REVISÃO DE SEGURANÇA PRÉ-DEPLOY — leitura linha a linha

Você **não** implementa nada nesta tarefa. Você lê código e produz achados verificáveis. Nenhum arquivo do repositório deve ser modificado — `git status --porcelain -uall` tem de terminar exatamente como começou, exceto por `REVIEW.md`, que é onde você escreve.

Antes de qualquer coisa, leia, neste worktree:

1. `docs/agent-prompts/common-rules.md` — as regras de execução e de relatório valem. As de git e de escopo de implementação não se aplicam, porque você não commita código.
2. `docs/agent-prompts/repo-state.md` — o que já existe.
3. `CLAUDE.md` — em especial a seção **Security — non-negotiable**. Ela é o contrato contra o qual você revisa.
4. `docs/security.md` §4 e §8.

## POR QUE ESTA REVISÃO EXISTE

O projeto está prestes a ir ao ar pela primeira vez, com ~30 pessoas reais e os e-mails delas no banco. Nas últimas 24 horas entraram quinze merges, incluindo a reescrita inteira da autenticação (TASK-027) e um lote de mudanças de performance que tocou quase todo serviço.

Duas coisas que aconteceram nesse período definem o padrão de prova desta revisão:

- Um agente entregou a TASK-027 com o primeiro acesso **quebrado** — `/api/auth/set-password` respondia 401 a todo convidado real — e a suíte passava, porque o teste inseria em `users` a linha cuja ausência ele deveria exercitar. **O defeito apareceu lendo o `beforeAll`, não rodando a suíte.**
- Um revisor confirmou que o ofetch marca `error.name = 'TimeoutError'`, leu isso no fonte, e estava errado sobre o efeito: o ofetch embrulha o erro num `FetchError` antes de entregá-lo, então a checagem nunca disparava. **Ler uma linha do fonte não é verificar; verificar é seguir o valor até quem o consome.**

Portanto: **suíte verde não é evidência aqui.** Todo achado seu precisa citar `arquivo:linha` e descrever o caminho concreto que produz o problema — que entrada, que estado, que resposta. "Pode ser inseguro" não é achado.

## O QUE JÁ FOI VERIFICADO — não gaste esforço aqui

Foi lido e confirmado correto. Se você discordar, diga por quê com evidência; não reabra sem ela.

- `sign-in/email` do better-auth **não** está exposta na allowlist. `/entrar` a chama por dentro, então o `checkSignInLimit` não é contornável batendo direto no better-auth.
- better-auth hasheia a senha no caminho de usuário inexistente — `node_modules/better-auth/dist/api/routes/sign-in.mjs`, `await ctx.context.password.hash(password)` antes do `throw`. O piso de timing do requisito 3 da TASK-027 vale sem hash dummy próprio.
- `revokeOtherSessions: true` é imposto no servidor, não vem do corpo do cliente.
- Limites: 10 por identificador/hora, 30 por IP/hora, 10 trocas de senha/usuário/hora. Contados **antes** de resolver o identificador.
- Ativação e reset devolvem `{ success: true }` idêntico para endereço fora da allowlist, desconhecido e já ativado, e não enviam e-mail em nenhum desses casos.
- Nenhum `console.*` em `auth.ts`, `rate-limit.ts` ou `shared/schemas/auth.ts` registra senha, hash ou código OTP.
- A lista deny-by-default continua uma lista explícita de caminhos, terminando em 404.

## ACHADOS JÁ CONHECIDOS — confirme, dimensione, não redescubra

Estes três já foram encontrados. Sua tarefa neles é **medir a exploração real**, não repetir que existem. Para cada um: é explorável hoje? por qual caminho exato? o que o transforma em explorável amanhã?

1. **`app/pages/entrar/index.vue:93`** — `getSafeRedirectUrl` aceita `/\evil.com`. Rejeita `//` mas não a barra invertida, que o navegador normaliza. Hoje o consumidor é `router.push` (linha 132). Determine se isso de fato contém a falha, e o que acontece com `next=/\evil.com`, `next=/%5Cevil.com` e `next=//evil.com` exatamente como o Vue Router os trata.
2. **Regra de senha duplicada.** `senhaSchema` (`shared/schemas/auth.ts:64`) é importado só por páginas. O servidor faz checagem própria inline em `server/services/auth.ts`. Liste **toda** divergência possível entre as duas hoje, caractere a caractere — comprimento, normalização, `trim`, unicode — e diga se alguma senha passa numa e falha na outra.
3. **`app/components/book/BookCover.vue:84`** — `isValidCoverUrl` aceita `data:` além de `https:`, contra o que o `CLAUDE.md` afirma. Determine se um `cover_url` vindo do banco alcança esse caminho, e o que um `data:` armazenado consegue de fato fazer dentro de `<img src>`.

## O ESCOPO DA REVISÃO, EM ORDEM DE RISCO

### 1. `server/services/auth.ts` — prioridade máxima

Foi auditado contra a checklist da TASK-027, não exaustivamente. Pontos declaradamente **não** verificados:

- `/entrar` e `/change-password` constroem um `Request` interno passando `request.headers` **inteiro**, incluindo `Cookie`. Siga o que o better-auth faz com um cookie de sessão presente durante `sign-in/email` e durante `change-password`. Uma sessão existente pode influenciar o resultado? Pode haver troca de senha de uma conta usando a sessão de outra?
- `resolveIdentifier` devolve `found: true` incondicionalmente no ramo de e-mail, e o campo `found` **nunca é lido** por ninguém. Campo morto costuma ser lógica pela metade: determine o que ele deveria decidir e o que acontece por ele não decidir nada.
- Identificador malformado (`ab`, `foo bar`, string vazia após trim) falha o `z.email()` do better-auth **antes** do hash, retornando mais rápido que uma senha errada. Meça a diferença. O critério da TASK-027 é "menos de uma ordem de grandeza".
- `hasPassword` não filtra `providerId = 'credential'`. Enumere o que mais pode gravar `account.password` neste projeto e se a resposta muda.
- O corpo de `change-password` é reconstruído pelo servidor, mas o cliente controla `currentPassword` e `newPassword`. Verifique se algum campo extra do cliente sobrevive até o better-auth.
- `email-otp/reset-password`: o código de um endereço serve para redefinir a senha de outro? Siga a validação até onde ela realmente acontece.

### 2. `server/services/visibility.ts` e **todos** os seus chamadores

É o único ponto de autorização do projeto, e `Viewer` é parâmetro obrigatório de propósito. Nas últimas horas, `works.ts`, `profiles.ts`, `logs.ts` e `search.ts` foram refatorados por performance.

Para **cada** leitura de `reading_logs` no repositório, confirme que passa por `visibleLogs(viewer)` e que o filtro está dentro do `and(...)` correto, não pendurado num `OR` que o anule. `grep -rn "reading_logs" server/` e não confie em nenhum arquivo por já ter sido lido antes.

Atenção especial a `server/services/search.ts`: o `ON` do `LEFT JOIN (reading_logs rl JOIN users ru ...)` é autorização disfarçada de junção. Contar um log invisível anuncia que ele existe — é o mesmo vazamento que a regra de 404-em-vez-de-403 fecha, por outra porta.

### 3. `server/services/search.ts` — SQL cru

A forma da query foi reescrita hoje. Verifique, caractere a caractere:

- `term` e `escaped` continuam **parâmetros vinculados**, nunca concatenados na string SQL.
- Os três `ILIKE`/`LIKE` mantêm `ESCAPE '\\'`, e `escapeLikeWildcards` continua cobrindo `\`, `%` e `_` na ordem certa. Um `%` digitado pelo usuário casa literalmente?
- O `EXISTS` novo não reintroduziu caminho onde o termo escape da ligação de parâmetro.

Um erro aqui é injeção de SQL, não lentidão.

### 4. Superfície de entrada de usuário

- Toda rota valida corpo e query com Zod antes de usar? `server/api/**` inteiro.
- `CLAUDE.md` diz que recurso privado responde **404, nunca 403**. Confirme em cada rota que pode devolver "existe mas você não pode ver".
- `v-html` é banido no repositório. Confirme que continua zero, inclusive em componentes tocados hoje.
- Resenhas são texto puro. Confirme que nada as renderiza como HTML e que nada as aceita como HTML.

### 5. Segredos e superfície de deploy

- Nada secreto em `runtimeConfig.public`.
- Resposta 500 não carrega stack trace nem mensagem do banco. Leia `server/utils/api.ts` e confirme que o caminho de erro não vaza nem em dev.
- `.env` não é lido por nada sob `app/`.
- Diga explicitamente se algum log, em qualquer arquivo, pode registrar e-mail, token de sessão ou código OTP.

## O QUE NÃO ENTRA NESTA REVISÃO

Não são seus, e listá-los é ruído — já estão registrados em `docs/agent-workflow.md`:

- Repositório público contra o artefato de `pg_dump` da TASK-022 — decisão do dono, não achado técnico.
- O envio de e-mail fire-and-forget que a Vercel pode não deixar terminar.
- `prepare` do `postgres.js` contra o pooler do Neon — precisa de execução contra o endpoint real, o que você não faz.
- Performance. Se algo for lento e seguro, não é desta revisão.

## FORMATO DA SAÍDA

Escreva o relatório completo em `REVIEW.md`. Na saída padrão, imprima **somente**:

```
ACHADOS: <um por linha: [CRITICO|ALTO|MEDIO|BAIXO] arquivo:linha — problema em uma frase>
EXPLORACAO: <para cada CRITICO e ALTO: a entrada exata e o efeito exato>
CONFIRMADOS: <quais dos três achados conhecidos você confirmou, e a dimensão real de cada>
LIMPO: <o que você leu e considera correto, para que ninguém releia à toa>
NAO CONSEGUI VERIFICAR: <o que exigiria executar algo que você não executa>
```

Regras sobre o relatório:

- Cada achado carrega `arquivo:linha`. Sem linha, não é achado.
- Para `CRITICO` e `ALTO`, descreva a entrada concreta e o efeito concreto. Se você não consegue descrever a entrada, rebaixe a severidade e diga que não conseguiu.
- `NAO CONSEGUI VERIFICAR` é resposta legítima e vale mais que um palpite com severidade inflada.
- **Não proponha correções em código.** Descreva o problema; quem corrige decide a forma, e uma correção sugerida com confiança já fez um teste ficar vermelho neste repositório por estar errada.
- Não reporte estilo, formatação, nomenclatura ou performance.

## PROIBIÇÕES

- Não modifique nenhum arquivo além de `REVIEW.md`. Nada de "enquanto eu estava aqui".
- Não rode `npm run build`, `npm run dev`, `npm run typecheck`, `npm run test`, nem nenhum teste de integração. Esta revisão é leitura.
- Não toque no banco de dados. Nada de `psql`, nada de script que abra conexão.
- Não imprima nem ecoe conteúdo de `.env`, connection string, senha de app ou código OTP — nem em `REVIEW.md`, nem na saída.
- Não instale dependência nenhuma.
