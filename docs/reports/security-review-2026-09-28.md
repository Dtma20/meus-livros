# Revisão de segurança pré-deploy - somente leitura

- Worktree: `C:\Users\diogo\Documents\ml-secreview`, HEAD destacado em `d618e70` (= `develop`).
- Data: 2026-09-28.
- Especificação seguida: `docs/agent-prompts/pre-deploy-security-review.md`, com as atualizações do pedido (tasks 028-062, superfície nova de admin, membros, feed, biblioteca, observabilidade e estatísticas).
- Fonte de terceiros lida só para leitura em `C:\Users\diogo\Documents\ml-verify\node_modules`: better-auth 1.7.5, better-call, drizzle-orm 0.45.2, vue-router 5.3.1, @nuxt/nitro-server, nitropack 2.13.4.
- Nada foi executado: nem build, nem teste, nem banco. Nenhum `.env` foi lido. Todo achado abaixo vem de leitura, e o caminho do valor foi seguido até quem o consome.

---

## 1. Achados

Ordem: severidade, depois risco. Cada item traz arquivo:linha, a entrada concreta e o efeito concreto.

### [ALTO] A-1. O gate de ativação e de reset vira oráculo de allowlist quando o better-auth rejeita a requisição encaminhada

**Onde**
- `server/services/auth.ts:267-282`: o wrapper lê o corpo com `request.text()` e faz `JSON.parse`, sem olhar o `Content-Type`.
- `server/services/auth.ts:297-317`: para endereço fora da allowlist, e para endereço já ativado, o wrapper responde ele mesmo `200 {success:true}`.
- `server/services/auth.ts:319-325`: para convidado **ainda não ativado**, encaminha ao better-auth os **headers originais** e o `bodyText` cru, e devolve a resposta dele **sem olhar `ok`**.
- `server/services/auth.ts:477-492`: `forget-password/email-otp` tem o mesmo desenho. Responde ele mesmo `200` quando o endereço não está na allowlist ou não tem senha. Encaminha cru quando o endereço está **ativo**.
- better-auth: `dist/api/index.mjs:163` define `allowedMediaTypes: ["application/json"]` para o roteador. `better-call/dist/utils.mjs:8-21` responde **415** a qualquer outro `Content-Type`, ou à ausência dele, antes de chegar ao endpoint. `dist/plugins/email-otp/routes.mjs:55-58` exige `type: z.enum([...])`, e sem ele o zod devolve 400.

**Entrada, primeira variante: identifica quem foi convidado e ainda não ativou.**
```
POST /api/auth/email-otp/send-verification-otp
Content-Type: text/plain
{"email":"alvo@exemplo.com"}
```
Uma variante com o mesmo efeito: `Content-Type: application/json` e corpo `{"email":"alvo@exemplo.com"}` sem o campo `type`, ou com `"type":"change-email"`.
- Endereço fora da allowlist: `200 {"success":true}`, vindo de `auth.ts:299-305`.
- Endereço já ativado: `200 {"success":true}`, vindo de `auth.ts:309-316`.
- Convidado não ativado: **415** (ou 400) com o corpo de erro do better-auth, vindo de `auth.ts:319-325`.

**Entrada, segunda variante: identifica quem já está ativo.**
```
POST /api/auth/forget-password/email-otp
Content-Type: text/plain
{"email":"alvo@exemplo.com"}
```
- Fora da allowlist, ou convidado sem senha: `200 {"success":true}`, vindo de `auth.ts:479-484`.
- Membro ativo: **415**, vindo de `auth.ts:486-492`.

**Efeito.** Duas requisições classificam qualquer e-mail num dos três estados, *não convidado*, *convidado não ativado* e *ativo*. É exatamente o que `docs/security.md` §4.3 proíbe ("Nothing user-facing may distinguish the last two"), e o item do checklist §13 ("indistinguishable from an allowlisted one") fica falso. A consulta é **silenciosa**: o 415 e o 400 disparam antes de o better-auth gerar ou enviar código, então o dono do endereço não recebe e-mail nenhum. O único custo é o rate limit, de 5 por e-mail e 20 por IP por hora (`rate-limit.ts:26-27`). Não exige sessão nem `Origin`: `server/middleware/origin.ts:11` deixa passar requisição sem `Origin`.

**Por que ALTO e não CRÍTICO.** O vazamento é de pertencimento. Revela quais e-mails estão na lista e se a pessoa já ativou a conta. Não dá acesso a conta nenhuma. A severidade vem de o controle declarado e o item do checklist de lançamento estarem quebrados por uma requisição trivial.

**Relação com "O QUE JÁ FOI VERIFICADO".** A afirmação de que as respostas são idênticas continua verdadeira para requisição **bem-formada**. O furo está no ramo em que o better-auth rejeita o que o wrapper aceitou.

---

### [MEDIO] M-1. Remover um convite não revoga o acesso de quem já ativou

**Onde**
- `server/services/invites.ts:133-136`: `removeInvite` apaga só a linha de `allowed_emails`.
- `server/services/auth.ts:398-450`: `/entrar` não consulta `allowed_emails`.
- `server/services/auth.ts:236-260`: `getSessionUserByHeaders` também não consulta, e toda rota autenticada passa por ele via `server/utils/session.ts`.

**Entrada.** O admin clica em "Remover" na linha de um membro com status "Ativado". A tela só pergunta `Remover o convite de <email>?` (`app/pages/app/admin/convites.vue:257`). Em seguida o membro faz `POST /api/auth/entrar` com handle e senha.

**Efeito.** A resposta é 200 com sessão nova, e as sessões que já existiam continuam valendo. O ex-membro lê o feed, os membros e os perfis, e escreve registros e obras. A TASK-038 declara isso ("only stops new codes and password resets"). Só que `docs/security.md` §12 apresenta a remoção da linha como **o** controle para "A leaked allowlist address", e a tela de admin não avisa que o acesso continua. Na prática, o único controle de revogação documentado não funciona para quem já ativou a conta.

---

### [MEDIO] M-2. Qualquer membro apaga qualquer edição e altera em silêncio os registros dos outros

**Onde**
- `server/services/catalog.ts:519-533`: `deleteEdition` não confere autor, não confere se há registros apontando para a edição e não grava `updated_by`.
- `server/db/schema.ts:157`: `reading_logs.edition_id` tem `onDelete: 'set null'`.

**Entrada.** O id vem de `GET /api/works/<id>/editions`, que é público (`server/api/works/[id]/editions.get.ts`). Depois, `DELETE /api/editions/<uuid de uma edição usada no registro de outra pessoa>` com qualquer sessão válida.

**Efeito.** A resposta é 204. O `edition_id` do registro da outra pessoa vira NULL, e com isso mudam a capa e a contagem de páginas nas estatísticas (`stats.ts:226-228`, `profiles.ts:257`) e o total de páginas no progresso de leitura. O commit `648cfdc` abriu a **edição** do catálogo a todos com um argumento explícito, o de que `updated_by` é a trilha de responsabilidade. A **exclusão** não deixa essa trilha: sobra só um `logger.info` (`catalog.ts:535-541`). Dá para apagar todas as edições do acervo em laço.

---

### [MEDIO] M-3. Exportar e depois importar a biblioteca torna públicos os registros privados

**Onde**
- `server/services/library-transfer.ts:104-131`: a exportação inclui todos os registros do usuário, privados também, e o formato não tem campo de visibilidade.
- `server/services/library-transfer.ts:440`: a importação grava `visibility: 'publico'` fixo.
- `app/components/log/JsonImportSection.vue`: a tela não diz nada sobre visibilidade.

**Entrada.** Um usuário com perfil público e registros privados baixa `/api/library/export` (o link fica em `app/pages/@[handle]/index.vue:47`) e depois envia o mesmo arquivo em `/api/library/import`.

**Efeito.** Cada registro que era privado reaparece duplicado como **público**, visível a qualquer membro e ao anônimo no feed, no perfil, na página da obra, nas estatísticas e na contagem da busca.

---

### [MEDIO] M-4. `POST /api/library/import` contorna os rate limits de obras e de registros

**Onde**
- `server/api/library/import.post.ts:8-13,32`: aceita até 1000 livros por requisição, sem limite por hora.
- `server/services/library-transfer.ts:215-459`: insere `works`, `authors`, `editions` e `reading_logs` diretamente. Não passa por `assertUnderRateLimit` (`catalog.ts:40-55`, 30 obras/h) nem por `checkRateLimit('logs:user:…', 60)` (`logs.ts:33-44`).

**Entrada.** Qualquer sessão manda `POST /api/library/import` com `[{title:"x1",author:"y1"}, …, {title:"x1000",author:"y1000"}]`, e repete.

**Efeito.** Mil obras novas no catálogo compartilhado e mil registros públicos por requisição, sem teto. É o vandalismo de catálogo que `docs/security.md` §8 e §12 dizem estar limitado. De quebra, cada livro abre uma transação com vários SELECT e INSERT, o que prende o Neon. O título aceito vai até 500 caracteres (`shared/schemas/export-import.ts:6`), acima do teto de 300 documentado em §7.

---

### [MEDIO] M-5. Anônimos inserem no `rate_limit` linhas sem limite de tamanho, que nada apaga

**Onde**
- `server/services/rate-limit.ts:5-11`: cada checagem faz INSERT … ON CONFLICT com a chave recebida.
- `rate-limit.ts:25-28` e `44-47`: as duas checagens rodam em `Promise.all`, então a linha por e-mail ou identificador **é gravada mesmo quando a de IP já estourou**.
- `auth.ts:284` e `auth.ts:410`: a chave vem de `body.email` ou `body.identificador` sem limite de tamanho.
- Nada no repositório apaga linhas de `rate_limit`. Só existe `DELETE` em `tests/integration/auth.test.ts:115`.

**Entrada.** `POST /api/auth/email-otp/send-verification-otp` com `{"email":"<2 KB aleatórios>"}`, repetido. Serve também `/api/auth/entrar` com `identificador` longo. Depois de 20 tentativas o IP recebe 429, mas cada requisição continua criando uma linha `otp:email:<2 KB>`.

**Efeito.** A tabela cresce sem limite a partir de tráfego anônimo, e as janelas de hora também se acumulam para sempre. Esgotar a cota de armazenamento do plano gratuito do Neon derruba todas as escritas da aplicação. Chaves acima do limite de tupla do índice único (`rate_limit_key_window_unique`, `server/db/migrations/0002_better_auth.sql:74`) fazem o Postgres falhar. Nesse ramo o erro não passa por `defineApiHandler` (`server/api/auth/[...all].ts`), vira erro não tratado do Nitro, e em dev a resposta traz stack e mensagem do banco. Em produção sai só "Server Error".

---

### [MEDIO] M-6. Uma falha de banco dentro do better-auth grava nos logs OTP, token de sessão, hash de senha e e-mail sem redação

**Onde**
- `server/services/auth.ts:72-175`: a configuração do better-auth não tem `logger` nem `onAPIError`, e `emailOTP` não define `storeOTP`.
- `better-auth/dist/plugins/email-otp/index.mjs:16`: o padrão é `storeOTP: "plain"`, então `verification.value` guarda o código em texto puro, no formato `"<otp>:0"`.
- `drizzle-orm/errors.js:10-13` e `drizzle-orm/pg-core/session.js:41`: todo erro de query sai embrulhado em `DrizzleQueryError`, e a mensagem é `Failed query: <sql>\nparams: <params>`.
- `better-auth/dist/api/index.mjs:205-214`: o `onError` do better-auth manda `e`, ou `e.message`, para o logger próprio dele, que escreve direto no console. Esse caminho não passa por `server/utils/logger.ts` nem pela redação de e-mail.

**Entrada.** Não existe entrada de atacante. Basta uma falha transitória do banco (timeout do pooler, cold start, conexão caída) durante `createVerificationValue` (emissão de OTP), `createSession` (qualquer login), `linkAccount` ou `updatePassword` (set, reset ou change de senha).

**Efeito.** O log da Vercel recebe o SQL com os parâmetros: o OTP em claro junto com o identificador `sign-in-otp-<email>`, o token de sessão, válido por 30 dias, ou o hash scrypt. Isso contradiz `docs/security.md` §11 ("never contain passwords, password hashes, OTP codes or session tokens"). Respondendo à pergunta 5.4 da especificação: **sim, existe caminho de log que registra e-mail, token de sessão e código OTP**. É este, e fica fora do logger do projeto. O logger do projeto (`server/utils/logger.ts`) tem outro caminho menor, que está em B-6.

---

### [BAIXO] B-1. `GET /api/logs/:id/blocks` sempre falha, porque `visibleLogs` é usado sem o join em `users`

**Onde.** `server/services/reading-blocks.ts:18-34`. A query é `FROM reading_logs LEFT JOIN editions` e aplica `visibleLogs(viewer)`, que referencia `users.profile_visibility` (`visibility.ts:16,18`). Nenhum `users` entra no FROM.

**Entrada.** `GET /api/logs/<uuid>/blocks`, anônimo ou com sessão.

**Efeito.** O Postgres rejeita a query por falta de FROM para `users`, e o `defineApiHandler` responde 500 genérico. O caminho **falha fechado**, então hoje não vaza nada. Nenhuma página chama essa rota, porque os blocos chegam por `getLogById`, e nenhum teste a cobre. O risco é o conserto: quem "arrumar" o 500 tirando o termo de perfil da condição passa a mostrar blocos de registros públicos de perfis privados. Não executei a query; a conclusão vem da leitura do SQL gerado pelo Drizzle.

---

### [BAIXO] B-2. `deleteWork` conta registros invisíveis e responde de forma diferente conforme eles existam

**Onde.** `server/services/catalog.ts:305-318`: `count(*) FROM reading_logs WHERE work_id = …`, sem `visibleLogs`.

**Entrada.** Quem criou a obra W vê em `/livro/W` que `log_count = 0` entre os registros visíveis a ele. Depois manda `DELETE /api/works/W`.

**Efeito.** A resposta `400 "Não é possível excluir um livro que já possui registros de leitura."` revela que existe registro privado, ou registro de perfil privado, sobre W. A sonda é destrutiva quando dá negativo (a obra é apagada) e só funciona em obra que o próprio atacante criou. Por isso o impacto é pequeno.

---

### [BAIXO] B-3. A regra do servidor diverge de um endpoint para outro: o handle só é barrado na troca de senha

**Onde**
- `auth.ts:371` (set-password) e `auth.ts:513` (reset) chamam `isForbiddenPassword(senha, { email })` sem `handle`.
- Só `auth.ts:586` (change-password) passa o `handle`.

**Entrada.** Um membro com handle `joaosilva` redefine a senha pelo código de e-mail com `password: "joaosilva"`.

**Efeito.** O servidor aceita, contra `docs/security.md` §4.1 ("the user's own handle"). A comparação completa entre cliente e servidor está na §3 deste relatório.

---

### [BAIXO] B-4. `set-password` não tem rate limit e calcula scrypt antes de recusar

**Onde**
- `auth.ts:346-396`: nenhuma chamada a `checkRateLimit`.
- better-auth `dist/api/routes/update-user.mjs:217`: calcula o hash **antes** de `:231` lançar `PASSWORD_ALREADY_SET`.

**Entrada.** Qualquer sessão válida, inclusive de membro ativo, repete `POST /api/auth/set-password {"newPassword":"<8 a 128 caracteres>"}`.

**Efeito.** Cada chamada custa um scrypt no servidor, sem teto. É desgaste de CPU e de tempo de função; não altera nenhuma conta.

---

### [BAIXO] B-5. Qualquer um tranca o login de um membro por uma hora

**Onde.** `rate-limit.ts:45`: um balde de 10 por identificador por hora, compartilhado entre todos os IPs e contado antes de verificar a senha (`auth.ts:415`).

**Entrada.** 10 × `POST /api/auth/entrar {"identificador":"<handle da vítima>","senha":"x"}`, e mais 10 com o e-mail dela.

**Efeito.** A própria vítima recebe 429 com a senha certa até a hora virar. Handle e e-mail são baldes separados, então por conta são 20 tentativas por hora, não 10. As duas coisas decorrem do desenho da §8, mas não estão escritas lá.

---

### [BAIXO] B-6. Anônimos forjam linhas de log pelo `context._rawError`

**Onde**
- `server/api/observability/client-errors.post.ts:37-41`: espalha `input.context` (`z.record(z.string(), z.unknown())`) dentro de `context`.
- `server/utils/logger.ts:238-244`: busca `mergedContext.context._rawError` e o passa **cru** a `console.error(formatted, rawErrorArg)`, sem sanitizar e sem redigir e-mail.

**Entrada.**
```
POST /api/observability/client-errors
{"message":"x","context":{"_rawError":"linha\n{\"level\":\"ERROR\",…}"}}
```
O limite é de 30 por IP por hora.

**Efeito.** O atacante escreve texto arbitrário, com quebras de linha, no log de produção, contornando a sanitização. É log forging, sem vazamento de dado de terceiros.

---

### [BAIXO] B-7. JSON `null` no corpo derruba as rotas de auth com erro não tratado

**Onde.** `auth.ts:270, 359, 402, 456, 499, 559`: `JSON.parse` aceita `null`, e a linha seguinte lê `body.email` (ou `.identificador`, `.newPassword`) de `null`.

**Entrada.** `POST /api/auth/entrar` com corpo `null`.

**Efeito.** Sai um TypeError não tratado, porque a rota de auth não usa `defineApiHandler`. Em produção o Nitro responde "Server Error" (`nitropack/dist/runtime/internal/error/prod.mjs:18,59`). Em dev a resposta traz stack e mensagem (`@nuxt/nitro-server/dist/runtime/handlers/error.mjs`). O comportamento é o mesmo para qualquer conta, então não serve de oráculo.

---

### [BAIXO] B-8. O token de sessão chega ao JavaScript no corpo da resposta

**Onde.** `auth.ts:441-443` devolve a resposta do better-auth sem alterar (`sign-in.mjs`: `{redirect, token, user}`). O mesmo vale para `sign-in/email-otp` (`auth.ts:329-332`, `routes.mjs:417-419`), `change-password` (`auth.ts:604-607`) e `get-session` (`auth.ts:615-617`).

**Efeito.** O cookie é httpOnly, mas o mesmo token fica legível por script no corpo JSON. Hoje não há vetor de XSS (ver §6), então o efeito é só enfraquecer uma camada de defesa.

---

### [BAIXO] B-9. Um cursor aceito pelo JS e recusado pelo Postgres vira 500

**Onde.** `server/services/feed.ts:37`: a validação é `new Date(t)`. Em `feed.ts:76` o valor vai como `${cursor.t}::timestamptz`.

**Entrada.** Com sessão, `GET /api/feed?cursor=<base64url de {"t":"1","id":"<uuid qualquer>"}>`.

**Efeito.** O JS aceita `"1"`, o cast no Postgres falha e a resposta é 500 genérica, com log em nível ERROR, onde o certo seria 400. O valor é parâmetro vinculado, então não há injeção.

---

### [BAIXO] B-10. `GET /api/search` escreve no banco, sem sessão e sem limite

**Onde.** `server/api/search/index.get.ts:21`: `recordSearchMiss` faz INSERT em `search_misses` a cada busca vazia.

**Entrada.** `GET /api/search?q=<termo aleatório de 2 a 100 caracteres>`, repetido, anônimo.

**Efeito.** Crescimento ilimitado de `search_misses`, contra "No GET mutates" do `CLAUDE.md`. É intencional (`search_misses` é a analítica do MVP), mas não tem freio.

---

### [BAIXO] B-11. O mapeamento de erros do Postgres em `defineApiHandler` nunca dispara

**Onde.** `server/utils/api.ts:30-37,124`: `isPostgresError` procura `code` no próprio erro, mas o drizzle 0.45.2 entrega sempre um `DrizzleQueryError` com o erro do Postgres em `cause`. Em `catalog.ts:32-36` e `invites.ts:22-26` o código já lê `cause.code`, o que confirma o embrulho.

**Efeito.** Violação de unicidade (23505), de FK (23503) e timeout (57014) que não forem tratados no serviço viram 500 genérico em vez de 409, 400 e 504. A resposta **continua sem vazar nada**. O log (`api.ts:176`) grava o SQL e os parâmetros, com e-mail redigido. Quem ler `docs/security.md` §11 acha que o mapeamento existe.

---

### Observação sem severidade: `sign-in/email-otp` repassa campos extras do cliente

`auth.ts:329` encaminha a requisição crua. Em `routes.mjs:407-414`, no primeiro login, `name` e `image` do corpo vão para `ba_user`. `image` não é validado como `https:`. Hoje nada em `app/` lê `ba_user.image` ou `name` (conferido por grep), então não tem efeito.

---

## 2. Os três achados já conhecidos

### 2.1 `getSafeRedirectUrl` e a barra invertida: **corrigido**

- O guard saiu de `entrar/index.vue` e virou `app/utils/redirect.ts` no commit `69846c3` (2026-09-21). Os chamadores são `app/pages/entrar/index.vue:136-137` e `app/pages/entrar/ativar.vue:315-316`, ambos com `router.push`.
- `redirect.ts:8` recusa `/` **e** `\` na segunda posição, e `redirect.ts:10-13` recusa caracteres de controle.
- Como o Vue Router trata cada caso (vue-router 5.3.1, `parseQuery`/`decode`, que faz `decodeURIComponent` no valor):
  - `next=/\evil.com`: o browser não normaliza `\` na query. O valor chega como `/\evil.com`, o guard recusa e o destino vira `/`.
  - `next=/%5Cevil.com`: `decode` transforma em `/\evil.com`, o guard recusa e o destino vira `/`.
  - `next=//evil.com`: o guard recusa e o destino vira `/`.
  - Chave repetida (`?next=a&next=b`): vira array, `typeof !== 'string'`, destino `/`.
- **O consumidor contém a falha mesmo sem o guard.** `router.push` com string sempre resolve como caminho interno, e `changeLocation` (`vue-router/dist/vue-router.js:120`) monta a URL como `location.protocol + '//' + location.host + base + to`. Um `//evil.com` que escapasse viraria `https://<host>//evil.com`, na mesma origem, e cairia na página 404.
- **O que tornaria explorável amanhã:** trocar o consumidor por `navigateTo(x, { external: true })`, `window.location` ou um `<a href>` com o valor.

### 2.2 Regra de senha duplicada: **existe e mudou de forma** (a linha também mudou)

`senhaSchema` agora está em `shared/schemas/auth.ts:53-59`. O servidor segue com checagem própria em `auth.ts:368-372`, `510-514` e `583-587`. A comparação caractere a caractere está na §3.

- O servidor exige **pelo menos tudo** o que o cliente exige, nos três fluxos. **Nenhuma senha passa no servidor e falha no cliente.**
- **Há senhas que passam no cliente e falham no servidor:** a parte local do e-mail em set-password e change-password, e o handle em change-password. O resultado é só um erro genérico, "Senha inválida ou muito fraca.".
- **A falha que importa é entre endpoints do próprio servidor:** o handle só é barrado na troca. Está em B-3.

### 2.3 `BookCover` aceitando `data:`: **corrigido**

- `app/components/book/BookCover.vue:166` usa `isHttpsCoverUrl` (`shared/schemas/work.ts:4-14`), que só aceita `protocol === 'https:'`. Um `cover_url` do banco que não seja `https:`, `data:` incluído, cai no placeholder (`BookCover.vue:169`).
- O único `data:` que chega ao `<img src>` é o SVG gerado pelo próprio componente (`BookCover.vue:106-153`). Título e autor entram nele por `escapeXml` (`:48-49`, `:114`, `:120`, `:145`).
- Mesmo um `data:image/svg+xml` hostil dentro de `<img src>` é renderizado como imagem estática: não executa script nem carrega recurso externo. O efeito máximo seria uma imagem enganosa.
- A escrita também está fechada: `coverUrlSchema` (`shared/schemas/work.ts:16-19`) é usado em obra, edição e importação (`shared/schemas/export-import.ts:21`).
- O CSP ainda permite `img-src … data:` (`nuxt.config.ts:30`). O placeholder precisa disso.

---

## 3. Senha: cliente contra servidor, caractere a caractere

| Aspecto | Cliente (`senhaSchema`, `resetPasswordSchema`) | Servidor (wrapper em `auth.ts`) | better-auth | Diverge? |
|---|---|---|---|---|
| Comprimento mínimo | `.min(8)`, unidades UTF-16 | `.length < 8` | `minPasswordLength` 8 (`update-user.mjs:207`, `routes.mjs` reset) | Não |
| Comprimento máximo | `.max(128)` | `.length > 128` | 128 | Não |
| Contagem | `String.length` (UTF-16). Um emoji conta 2: `"😀😀😀😀"` passa com 4 glifos | igual | igual | Não |
| `trim` na senha | não | não | não | Não |
| `trim`/`lower` na comparação com a lista negra | `isForbiddenPassword`: `toLowerCase().trim()` | mesma função | - | Não |
| Normalização Unicode (NFC/NFKC) | nenhuma | nenhuma | nenhuma | Não. Mesmo assim `"１２３４５６７８"` (dígitos largos) escapa da lista negra dos dois lados, e quem cadastrou a senha em NFD e digita em NFC não consegue entrar |
| Lista fixa (`12345678`, `123456789`, `password`, `senha123`, `meuslivros`) | sim | sim | - | Não |
| Parte local do e-mail | só no reset (`shared/schemas/auth.ts:86-95`) | set, reset e change (`:371`, `:513`, `:586`) | - | **Sim**: set e change passam no cliente e falham no servidor |
| Handle | não | só change (`:586`) | - | **Sim**: change passa no cliente e falha no servidor; set e reset aceitam o handle nos dois lados |
| Sign-in (`/entrar`) | `senha: min(1)` | sem limite de tamanho | `sign-in.mjs:252`: `z.string()`, sem máximo | O máximo de 128 não vale no login. O custo extra de uma senha enorme é um SHA-256 da chave antes do scrypt, e o rate limit é de 30 por IP. Desprezível |

Os campos extras que o cliente manda:
- **change-password:** o corpo é remontado no servidor com exatamente três campos (`auth.ts:597-601`), e `revokeOtherSessions` é fixo. **Nenhum campo extra sobrevive.**
- **set-password:** passa por `auth.api.setPassword({ body: { newPassword } })` (`auth.ts:379-383`). Nada sobrevive.
- **reset-password:** `bodyText` vai cru (`auth.ts:521-527`), mas o schema do better-auth tem só `email`, `otp` e `password` e o handler só usa esses três. Não há efeito.

---

## 4. `server/services/auth.ts`, ponto a ponto

1. **Headers inteiros, com `Cookie`, nas requisições internas de `/entrar` e `/change-password`.**
   - `sign-in/email` (`sign-in.mjs:305-359`) não lê sessão nenhuma. Cria outra com `createSession` e grava cookie novo. O cookie de sessão que já existia não influencia o resultado.
   - `change-password` usa `sensitiveSessionMiddleware` (`update-user.mjs:93`, `session.mjs:304-311`), que lê a sessão **autoritativa**, sem cache, a partir do **mesmo** cookie que `getSessionUserByHeaders` leu (`auth.ts:540`). Não tem como trocar a senha de uma conta usando a sessão de outra: o rate limit usa o `id` do cache, e a troca age sobre o dono do `session_token`, que é o mesmo cookie.
   - Uma sessão revogada, mas ainda no cache, passa pelo wrapper e cai no better-auth com 401, mapeado para 400 "Senha atual incorreta." (`auth.ts:609-612`). Falha fechada.
   - `deleteUserSessions` apaga **todas** as sessões, a atual inclusive, e cria outra (`update-user.mjs:180-188`). O efeito é o documentado.
   - Sobre os headers repassados: o `Content-Type` do cliente vai junto. Em `/entrar` e `/change-password` isso só produz 415, que o wrapper mapeia para 400 genérico. Em send-verification e forget-password, onde a resposta volta sem tratamento, isso é o A-1.
2. **`resolveIdentifier.found` nunca é lido** (`auth.ts:211-229`, único chamador em `:430`).
   - O que ele parece querer decidir é "a conta existe". Só que o fluxo não pode decidir nada com isso sem criar um oráculo de tempo. O caminho certo é exatamente o que acontece: tudo vai ao better-auth, que calcula o hash também quando a conta não existe (`sign-in.mjs:317-318`).
   - O efeito de o campo não decidir nada: o e-mail falso `inexistente-<handle>@invalido.local` passa no `z.email()` (a TLD `.local` é aceita) e pega o ramo do hash. O campo é morto e **inofensivo**.
   - Um detalhe: o ramo de e-mail não confere se há linha em `users`. Uma identidade com senha e sem perfil entra por e-mail (nunca por handle) e é tratada como anônima (`auth.ts:252-254`), o que é o comportamento documentado.
3. **Identificador malformado** (`ab`, `foo bar`, `"   "`): nenhum casa com `^[a-z0-9_]{3,20}$` (`auth.ts:213`), todos seguem pelo ramo de e-mail, `z.email()` falha em `sign-in.mjs:314` e a resposta sai **antes** de qualquer scrypt. A diferença é "parse do zod" contra "um scrypt", e não medi. É muito provável que passe de uma ordem de grandeza, o que descumpriria o critério da TASK-027 ao pé da letra. **Mas não é oráculo de conta:** nenhum identificador que corresponde a conta real cai nesse ramo, porque handles válidos vão pelo ramo de handle e o e-mail falso passa no `z.email()`. Fica o risco de alguém convidado com um e-mail que o zod do better-auth recuse: essa pessoa nunca consegue entrar (é defeito funcional, não vazamento).
4. **`hasPassword` não filtra `providerId`** (`auth.ts:192-209`). Neste projeto só o better-auth escreve em `account.password`, e só em conta `credential`: `setPassword`/`linkAccount` (`update-user.mjs:219-228`), `resetPasswordEmailOTP` (`routes.mjs` reset, `createAccount` com `providerId: "credential"`) e `changePassword`/`updatePassword`. O login por OTP cria só `ba_user`, sem `account`. Não há provedor social configurado (`auth.ts:72-175`). **A resposta não muda.**
5. **Campos extras em `change-password`:** nenhum sobrevive (§3).
6. **O código de um endereço redefine a senha de outro?** Não. `resetPasswordEmailOTP` monta o identificador como `forget-password-otp-${email}` a partir do **mesmo** `email` do corpo que depois usa em `findUserByEmail` (`routes.mjs` reset: `toOTPIdentifier("forget-password", email)`, seguido de `findUserByEmail(email)`). A comparação é `constantTimeEqual` (`otp-token.mjs`). Um `email` com espaço desalinha o wrapper, que faz trim na checagem de senha, do better-auth, que não faz trim, mas só produz falha (a verificação não acha o código). O código de login por OTP (`sign-in-otp-…`) e o de reset (`forget-password-otp-…`) têm identificadores diferentes e não se trocam.
7. **O cliente escolhe o `type` em send-verification-otp.**
   - O wrapper não restringe o `type`. `forget-password` ou `email-verification` para um convidado não ativado que já tenha `ba_user` emitem um código desse tipo. O de reset cria a conta `credential` com senha, o que equivale à ativação e exige acesso ao e-mail. Não é escalada.
   - O que o `type` inválido **produz** é o oráculo do A-1.

---

## 5. Toda leitura de `reading_logs` no repositório

Levantamento feito com `grep -rn "reading_logs" server/`. Nenhum arquivo foi dado como seguro por já ter sido lido antes.

| Arquivo:linha | Leitura | Autorização | Veredito |
|---|---|---|---|
| `stats.ts:72-85` | anos distintos | `and(user_id = alvo, finished_on NOT NULL, visibleLogs(viewer))` com `innerJoin(users)`. Perfil privado de outra pessoa dá 404 em `:59-68` | **Limpo** |
| `stats.ts:91-117` | registros usados em todas as agregações | mesmo `and(...)`. Livros, páginas, autores, países, idiomas, notas, formatos e anos saem só de `logRows` visíveis; as consultas de autor, gênero e edição usam `workIds` desses registros | **Limpo**. `?ano=` sem nenhum registro visível devolve zeros, sem distinguir o motivo |
| `feed.ts:79-117` | feed com cursor | `and(visibleLogs, cursor)` com `innerJoin(users)`. Limite de 1 a 30 no servidor. Rota com sessão obrigatória | **Limpo** |
| `members.ts:28-37` | contagem e última atividade por membro | `and(inArray(user_id, ids), visibleLogs)` com `innerJoin(users)`. Os ids são só de perfis públicos ou do próprio viewer (`:8-10`) | **Limpo** |
| `members.ts:39-97` | capas recentes (SQL cru) | `WHERE ${whereLogsCondition}`, a mesma condição, com `"users"` no FROM | **Limpo** |
| `profiles.ts:74-107` | registros do perfil | `and(user_id, visibleLogs)` com `innerJoin(users)`. Privado de outra pessoa dá 404 (`:63-72`) | **Limpo** |
| `works.ts:75-93` | registros da obra | `and(work_id, visibleLogs)` com `innerJoin(users)` | **Limpo** |
| `works.ts:95-102` | `count` e `avg` da obra | idem | **Limpo** |
| `logs.ts:117-176` | permalink | `and(id, visibleLogs)` com `innerJoin(users)`, 404 caso contrário | **Limpo** |
| `logs.ts:200-214` | blocos do registro | depois de o registro passar em `visibleLogs` | **Limpo** |
| `logs.ts:265-273`, `:345-349`, `:372-376` | update e delete | `user_id = sessão` **no where**, 404 | **Limpo** |
| `reading-blocks.ts:18-34` | registro antes de listar os blocos | `visibleLogs` **sem join em `users`** | **B-1** (falha fechada) |
| `reading-blocks.ts:90-93, 137-138, 190-204` | escrita de blocos | `user_id = sessão` no where | **Limpo** |
| `search.ts:106-113` | `log_count` da busca | ON do LEFT JOIN, detalhado abaixo | **Limpo** (cópia manual da regra) |
| `catalog.ts:305-308` | contagem para decidir a exclusão | **nenhuma** | **B-2** |
| `dashboard.ts:29-34, 51-56, 79-83` | painel do usuário | `user_id = sessão` (rota `dashboard/index.get.ts` com `requireSessionUser`) | **Sem vazamento.** Lê só do dono, fora do helper |
| `library-transfer.ts:127-131` | exportação | `user_id = sessão` | **Sem vazamento.** Só do dono, fora do helper |

Sobre `search.ts`:
- O `ON` é `rl.work_id = m.id AND ((viewer IS NOT NULL AND rl.user_id = viewer) OR (rl.visibility = 'publico' AND ru.profile_visibility = 'publico'))`. O `OR` está **entre parênteses dentro do `AND`**, então não anula o filtro de obra.
- `(reading_logs rl JOIN users ru …)` também está entre parênteses, então o inner join só descarta registros órfãos.
- A condição é equivalente a `visibleLogs`, e `COUNT(rl.id)` conta só o visível.
- **É uma segunda cópia da regra, escrita à mão.** Se `visibleLogs` mudar, a busca não acompanha.

---

## 6. Busca, SQL cru e superfície de entrada

**`search.ts`, caractere a caractere**
- `term`, `escaped`, cada `token`, o `viewer.id` e o `LIMIT` são interpolações do template `sql` do Drizzle, ou seja, **parâmetros vinculados** (`:52-53`, `:90`, `:111`, `:121`). Não há concatenação de string.
- `ESCAPE '\\'` no template JS vira `ESCAPE '\'` no SQL, porque o Drizzle usa as strings cooked. Aparece em `:62`, `:65` e `:70`.
- `escapeLikeWildcards` (`:19-21`) escapa `\` primeiro, depois `%` e `_`. A ordem está certa, e um `%` ASCII casa literalmente.
- O `EXISTS` (`:66-71`) usa o mesmo `(SELECT pattern FROM q)` vinculado.
- O ramo de tokens (`:80-91`) usa `ILIKE` sem `ESCAPE` com tokens em que a regex já tirou `%` e `_`, mas não `\`. Um `\` num token só muda o casamento da própria busca, sem injeção.
- Ressalva que não verifiquei: se o `unaccent.rules` do banco mapeia `％` ou `＿` (largura cheia) para `%` ou `_`, esses caracteres viram curinga depois do escape. O efeito fica restrito aos resultados de quem digitou.

**Zod em `server/api/**`**
- Todas as 33 rotas foram lidas.
- Corpo e query passam por Zod em todas, menos em `server/api/auth/[...all].ts`, onde a validação é manual com `typeof` (é o que produz a duplicação da §3).
- Parâmetros de rota: os ids são `z.string().uuid()`. O `slug` tem `z.string().trim().min(1).max(120)`. O `handle` de `users/[handle].get.ts` e `users/[handle]/stats.get.ts` não passa por Zod, mas só entra como parâmetro vinculado depois de `trim().toLowerCase()`.

**404 no lugar de 403**
- Perfil privado dá 404 (`profiles.ts:64-72`, `stats.ts:60-68`).
- Registro invisível dá 404 (`logs.ts:179-187`, `reading-blocks.ts:37-42`).
- Não-dono em update ou delete de registro e bloco dá 404.
- Não-admin em `/api/admin/**` dá 404 (`session.ts:33-43`).
- Não-autor em `deleteWork` dá 404.
- O único 403 do servidor é `origem_invalida` (`middleware/origin.ts:20,37`), que não fala de recurso.
- Divergência nesse eixo só no B-2.

**`v-html`**
- Zero ocorrências fora de `eslint.config.mjs:12` (`'vue/no-v-html': 'error'`).
- Não há `innerHTML`, `textContent` atribuído, `children:` em `useHead` nem JSON-LD.
- Nenhum `:href` recebe valor de usuário com esquema livre: todos são `/livro/<slug>`, `/entrada/<id>` e `/app/novo?...`.

**Resenhas**
- Entram como string até 10.000 caracteres (`shared/schemas/log.ts:26-28`), gravadas sem transformação.
- Saem por `{{ text }}` (`app/components/log/ReviewText.vue:2-4`), por trecho em texto (`buildReviewExcerpt`) e por `useSeoMeta` (`app/pages/entrada/[id].vue:356-368`), que escapa atributos.
- Nada as aceita nem as renderiza como HTML.

---

## 7. Segredos e superfície de deploy

- **`runtimeConfig`:** `nuxt.config.ts` não declara `runtimeConfig`, então não existe `runtimeConfig.public` e nada secreto passa por ele.
- **`.env` e `app/`:** `grep` por `process.env`, `useRuntimeConfig`, `import.meta.env` e `dotenv` em `app/` e `shared/` volta vazio. Os segredos são lidos só em `server/services/auth.ts:19-20` e `server/utils/email.ts:10,21`.
- **Resposta 500:**
  - Pelas 32 rotas que usam `defineApiHandler`, o 500 sai com texto fixo e `requestId` (`api.ts:176-188`, e `:168-172` no ramo do banco), **também em dev**. O handler não inclui stack nem `message` do erro em nenhum ramo.
  - O ramo `isError` para 5xx usaria `caught.statusMessage` (`api.ts:97`), mas nenhum `createError` do repositório define `statusMessage`.
  - A exceção é `server/api/auth/[...all].ts`, que não usa `defineApiHandler`. Erro de banco nas consultas do wrapper (`checkRateLimit`, `isEmailAllowed`, `hasPassword`, `resolveIdentifier`, `getSession`) ou o TypeError do B-7 vão para o handler do Nitro e do Nuxt. Em produção sai "Server Error" (`nitropack/.../error/prod.mjs:18,59`, `@nuxt/nitro-server/.../handlers/error.mjs`, que usa `error.unhandled`). **Em dev sai stack e mensagem.**
- **Logs com e-mail, token ou OTP:**
  - O `logger` do projeto redige e-mail por regex (`logger.ts` `EMAIL_REGEX`) e redige as chaves `password`, `token`, `otp`, `cookie` e `session`.
  - O envio de OTP registra só `redactEmail` (`auth.ts:150-168`).
  - **Registram, sim:** o better-auth na falha de banco (M-6, OTP em claro, token, hash, e-mail sem redação) e o `_rawError` forjado (B-6, sem redação).
  - Além disso, qualquer erro de query registrado pelo `defineApiHandler` grava o SQL e os parâmetros (B-11). O e-mail sai redigido quando aparece em forma literal, mas não quando vem codificado, como `%40`.

---

## 8. "O QUE JÁ FOI VERIFICADO", reconferido

`auth.ts` mudou depois de 2026-09-21 (`28feabc`, `efdfd96`, `56d7b6d`, `ab3d549`, `2534e7e`), assim como `rate-limit.ts` e `shared/schemas/auth.ts` (`2534e7e`). Reli os três arquivos inteiros:

- `sign-in/email` fora da allowlist: **confirmado**. A lista explícita está em `auth.ts:266-621` e termina em 404 (`:623-632`).
- Hash no caminho de usuário inexistente: **confirmado** na versão instalada, 1.7.5 (`sign-in.mjs:317-318` e `:324-325`).
- `revokeOtherSessions: true` imposto pelo servidor: **confirmado** (`auth.ts:597-601`).
- Limites de 10 por identificador, 30 por IP e 10 trocas por usuário, contados antes de resolver: **confirmado** (`rate-limit.ts:45-46,60`; `auth.ts:415` vem antes de `:430`). Acrescento B-5 e M-5.
- Resposta idêntica em ativação e reset: **confirmado para requisição bem-formada; refutado para requisição que o better-auth rejeita** (A-1).
- Nenhum `console.*` em `auth.ts`, `rate-limit.ts` ou `shared/schemas/auth.ts`: **confirmado**. O único `console.*` do servidor fica em `server/utils/logger.ts:244-251`. O logger interno do better-auth, porém, escreve direto (M-6).
- Deny-by-default terminando em 404: **confirmado**.

---

## 9. Limpo: lido e considerado correto

- `server/services/visibility.ts` inteiro.
- `stats.ts` inteiro, junto com `server/api/users/[handle]/stats.get.ts` e `shared/schemas/stats.ts`: toda agregação passa por `visibleLogs`.
- `feed.ts` com `api/feed/index.get.ts` e `api/feed/recentes.get.ts`, os dois com sessão obrigatória e limite fixado no servidor. O cursor é vinculado, e só tem a ressalva de B-9.
- `members.ts` e `api/members/index.get.ts`.
- `profiles.ts`, `works.ts`, `logs.ts` e as rotas de `logs/**`. A propriedade é checada no `where` das escritas.
- A escrita de blocos em `reading-blocks.ts`.
- `search.ts`: parâmetros vinculados, ESCAPE e visibilidade no ON.
- `invites.ts` e `api/admin/convites/*`: `requireAdmin` com `is_admin` dentro da query e 404 para quem não é admin. Nenhuma rota escreve `is_admin`: `me.patch.ts` e `users/index.post.ts` escolhem os campos explicitamente.
- `users.ts`, em que `createUser` confere a allowlist.
- `server/middleware/origin.ts` e `server/middleware/01.request-context.ts` (o `requestId` é validado por regex).
- `server/utils/api.ts`, que não vaza em nenhum ambiente.
- `app/utils/redirect.ts` e seus dois chamadores.
- `app/components/book/BookCover.vue` e `shared/schemas/work.ts` (`isHttpsCoverUrl`, `coverUrlSchema`).
- `app/plugins/observability.client.ts`: a URL enviada não carrega e-mail, porque nenhuma página põe e-mail na query.
- `nuxt.config.ts`: sem `runtimeConfig` e com CSP igual ao `docs/security.md` §2 mais as fontes do Google.
- `v-html` segue zero, e `ReviewText.vue` renderiza por interpolação.

---

## 10. Não consegui verificar

- **O tempo real** de identificador malformado contra senha errada (§4.3): exige medir contra o servidor.
- **Se a Vercel sobrescreve `x-forwarded-for`.** `server/utils/client-ip.ts:15` confia no primeiro valor, e se ele puder ser forjado, todos os limites por IP caem.
- **A mensagem exata** que o Postgres devolve para a query de B-1, e para o cast de B-9. A conclusão vem da leitura do SQL gerado.
- **Se `unaccent.rules`** mapeia `％` ou `＿` para `%` ou `_` (§6).
- **O formato real do log do better-auth** numa falha de banco (M-6). Seria preciso provocar a falha.
- **Os atributos do cookie** (`HttpOnly`, `Secure`, `SameSite=Lax`) na resposta de produção. Pela leitura são os padrões do better-auth com `useSecureCookies: true` (`auth.ts:103`).
- **O comportamento do 415 do better-auth por trás do adaptador da Vercel.** A-1 depende só da camada better-call, mas não executei.
