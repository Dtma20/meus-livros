# Runbook — restaurar o banco a partir de um backup

Para ser seguido sob estresse. Leia o aviso, depois execute os passos na ordem.

---

> ## ⚠️ NUNCA restaure direto em produção
>
> Um restore sobrescreve o que estiver lá. Se o banco de produção ainda
> responde, **restaurar nele apaga o que sobrou** — inclusive o que você ainda
> poderia ter salvado.
>
> A ordem certa é sempre:
>
> 1. Criar uma branch nova no Neon.
> 2. Restaurar **na branch**.
> 3. Conferir as contagens.
> 4. Só então decidir se promove a branch ou copia dados de volta.
>
> Se você está lendo isto com pressa: crie a branch. Leva 20 segundos e é
> reversível. Restaurar em produção não é.

---

## O que o backup contém

Dump completo de todas as 16 tabelas do schema `public`, incluindo as do
better-auth. Isso significa que ele carrega **dado sensível**:

| Tabela | O que tem de sensível |
|---|---|
| `account` | Hashes de senha — quebráveis offline |
| `session` | Tokens de sessão vivos — quem tem, está logado |
| `verification` | Códigos OTP pendentes |
| `users`, `ba_user`, `allowed_emails` | E-mail de todo mundo |
| `reading_logs` | Resenhas marcadas como `privado` |

Por isso o artefato é **criptografado**. O repositório `Dtma20/meus-livros` é
público e artefatos de workflow herdam a visibilidade do repositório: um dump
em texto claro aqui seria baixável por qualquer pessoa que abra a aba Actions.

A criptografia é assimétrica de propósito. O workflow tem só a chave **pública**
— ele consegue escrever um backup e nunca consegue ler nenhum. Não existe chave
de descriptografia guardada no GitHub para vazar.

**A consequência é séria e você precisa aceitá-la: se você perder a chave
privada, todos os backups viram lixo.** Guarde-a fora desta máquina.

---

## Configuração inicial

Feita uma vez. Sem ela o workflow falha de propósito, em vez de enviar um dump
em claro.

### 1. Gerar o par de chaves

Numa máquina sua, não em CI:

```bash
gpg --batch --passphrase '' --quick-generate-key 'Backup Meus Livros <backup@meus-livros.local>' default default never
```

### 2. Exportar a chave pública para o repositório

```bash
gpg --armor --export 'backup@meus-livros.local' > .github/backup-key.pub.asc
```

Essa chave é pública. Pode e deve ser commitada.

### 3. Exportar a chave privada e guardá-la fora daqui

```bash
gpg --armor --export-secret-keys 'backup@meus-livros.local' > backup-key.SECRET.asc
```

Coloque esse arquivo num gerenciador de senhas ou num pendrive. **Não commite,
não coloque no Drive da conta que também tem acesso ao GitHub, não deixe na
pasta do projeto.** Depois de guardado, apague o arquivo local:

```bash
shred -u backup-key.SECRET.asc
```

### 4. Configurar o segredo do banco

Em `Settings → Secrets and variables → Actions`, criar `DATABASE_URL_DIRECT`
com a string de conexão **direta** do Neon — a que não passa pelo pooler. O
`pg_dump` precisa de estado de sessão que o pooler de transações não preserva.

### 5. Rodar uma vez na mão

`Actions → Backup do banco → Run workflow`. Confirme que o artefato foi
produzido e tem mais de 10 KB.

---

## Restaurar

### Passo 1 — Baixar o backup

`Actions → Backup do banco →` a execução desejada `→ Artifacts`.

Baixe e descompacte o `.zip`. Dentro há um `dump-AAAA-MM-DD.sql.gz.gpg`.

### Passo 2 — Descriptografar

Com a chave privada importada na máquina:

```bash
gpg --output dump.sql.gz --decrypt dump-AAAA-MM-DD.sql.gz.gpg
```

Se sua chave estiver num arquivo e ainda não importada:

```bash
gpg --import backup-key.SECRET.asc
```

Confira que o gzip está íntegro antes de continuar:

```bash
gzip -t dump.sql.gz && echo "gzip OK"
```

### Passo 3 — Criar uma branch no Neon

No console do Neon: `Branches → Create branch`. Nome sugerido:
`restore-AAAA-MM-DD`.

Copie a connection string **direta** dessa branch. Confira olhando: ela contém
o nome da branch. **Se contiver `main` ou o nome da sua branch de produção,
pare.** Você está prestes a restaurar em produção.

### Passo 4 — Restaurar na branch

```bash
gunzip -c dump.sql.gz | psql "<CONNECTION_STRING_DA_BRANCH_DE_RESTORE>"
```

Erros de `role does not exist` podem aparecer e são esperados — o dump é
gerado com `--no-owner --no-privileges` justamente para que não importem.

### Passo 5 — Conferir

Rode na branch restaurada:

```sql
SELECT
  (SELECT count(*) FROM works)        AS works,
  (SELECT count(*) FROM reading_logs) AS reading_logs,
  (SELECT count(*) FROM users)        AS users,
  (SELECT count(*) FROM editions)     AS editions,
  (SELECT count(*) FROM authors)      AS authors;
```

Compare com o que se esperava do dia do dump. **Um restore que você não
conferiu não é um restore — é um arquivo que você espera que funcione.**

### Passo 6 — Decidir

Só agora. Promover a branch no Neon, ou copiar seletivamente as linhas
perdidas de volta para produção. Com o dado já conferido na branch, essa
decisão deixa de ser urgente.

---

## Riscos conhecidos

### 1. O GitHub desativa workflows agendados após 60 dias sem commits

Vale para repositórios públicos, e este é público. Se o projeto ficar dois
meses parado, **os backups param em silêncio** — nenhum e-mail, nenhum aviso.

Defesa: uma vez por mês, abra a aba Actions e confirme que a execução mais
recente é dos últimos dias. Baixe uma cópia para fora do GitHub na mesma visita.

### 2. Artefatos expiram em 90 dias

Backup que mora só na mesma plataforma que a fonte não é backup de verdade. Se
a conta do GitHub for perdida ou suspensa, some tudo junto.

Defesa: a cópia manual mensal do item anterior. Baixe o `.gpg` e guarde-o em
outro lugar — ele já está criptografado, então qualquer armazenamento serve.

### 3. A chave privada é ponto único de falha

Perdeu a chave, perdeu todos os backups. Não há recuperação. Guarde uma segunda
cópia em lugar distinto do primeiro.

---

## Decisão registrada sobre exposição do artefato

TASK-022 exige registrar essa decisão.

- **Visibilidade do repositório:** `Dtma20/meus-livros` é **público**, verificado
  em 2026-09-22 via `gh repo view --json visibility`.
- **Risco:** artefatos herdam a visibilidade do repositório. Um dump em claro
  seria baixável por qualquer um com acesso à aba Actions, expondo hashes de
  senha, tokens de sessão ativos, OTPs pendentes, e-mails e resenhas privadas.
- **Decisão:** em vez de mover o workflow para um repositório privado — o que
  TASK-022 sugeria e que partiria o projeto em dois — o dump é criptografado com
  GPG assimétrico antes de virar artefato. O workflow só tem a chave pública.
- **Por que esta opção:** continua valendo se o repositório mudar de
  visibilidade no futuro, não exige um segundo repositório, e não coloca
  nenhuma chave de leitura nos segredos do GitHub.
- **O que ela custa:** a chave privada vira ponto único de falha. Ver risco 3.

---

## Status desta task

Implementado: workflow, criptografia, runbook.

**Pendente, e TASK-022 não considera a task pronta sem isto:** um restore de
verdade, executado uma vez, seguindo este documento verbatim, com as contagens
conferidas. Até que isso aconteça, o backup é uma hipótese.

Pendências que dependem de acesso que o CI não tem:

- [ ] Gerar o par de chaves e commitar `.github/backup-key.pub.asc`
- [ ] Configurar o segredo `DATABASE_URL_DIRECT`
- [ ] Rodar o workflow uma vez pelo `workflow_dispatch`
- [ ] Fazer o restore numa branch do Neon e conferir as contagens
- [ ] Testar que uma connection string quebrada **falha** o workflow em vez de
      enviar artefato vazio
