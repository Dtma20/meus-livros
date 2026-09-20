## REGRAS DE EXECUÇÃO — leia primeiro, valem para toda a sessão

Você roda em modo não-interativo (`agy -p` ou `opencode run`). A sessão encerra assim que você fica ocioso, e todo processo em background morre junto.

**Você não executa verificação. O revisor executa.** Isso não é desconfiança: é a única forma de você não se perder esperando comando lento.

- **Proibido**: `npm run build`, `nuxt build`, `npm run dev`, `npm run typecheck`, `npm run test`, `npx vitest` sobre a suíte inteira, qualquer teste de integração, qualquer coisa que toque rede ou banco.
- **Permitido**: comandos que retornam em segundos — `cat`, `ls`, `grep`, `git status`, `git log`, `git diff`, e no máximo **um** arquivo de teste unitário puro, sem rede e sem banco.
- Execute tudo em primeiro plano. Nunca em background.
- Nunca termine um turno dizendo que está "aguardando" algo. Se está aguardando, você não terminou.

Quatro execuções inteiras já foram perdidas em laço de "vou aguardar o build/os testes terminarem". O trabalho escrito sobrevive; o turno não.

## REGRAS DE GIT

- Trabalhe somente dentro deste worktree. Nada de `git checkout`, `git switch`, `git merge`, `git rebase`, `git push`. Não toque em `develop` nem em `main`.
- Ao terminar, deixe **exatamente um commit** nesta branch, mensagem conventional em inglês.
- Nada fora do escopo da task entra no commit.
- `git status --porcelain -uall` deve terminar vazio, exceto `REPORT.md`.

## REGRAS DO RELATÓRIO

O revisor re-executa lint, typecheck, testes e build por conta própria. Log colado não é prova e só queima contexto.

Escreva o relatório completo em `REPORT.md` na raiz do worktree. **Não** inclua esse arquivo no commit.

Na saída padrão, imprima **somente** este bloco:

```
ARQUIVOS: <um por linha, prefixado por + novo, - removido, ~ alterado>
DEPS ADICIONADAS: <nome@versão + justificativa em uma linha, ou "nenhuma">
CRITERIOS: <um por linha: FEITO | NAO FEITO | INCERTO — motivo em uma linha>
DECISOES: <escolhas que um revisor questionaria, uma linha cada>
RISCOS: <o que você suspeita que pode estar errado no seu próprio trabalho>
FORA DE ESCOPO NOTADO: <o que você viu e deixou quieto>
PROXIMO PASSO: <se ficou incompleto, o que fazer em seguida, em ordem>
```

- `CRITERIOS` fala do que você **implementou**, não do que você testou — você não testa. `INCERTO` é resposta legítima e preferível a otimismo.
- Se algo não foi feito, diga `NAO FEITO`. Bloco verde com item faltando é pior que bloco vermelho.
- Toda dependência nova entra em `DEPS ADICIONADAS`. Omitir é o mesmo que esconder.
- Você pode ser interrompido a qualquer momento. Mantenha `REPORT.md` e `PROXIMO PASSO` atualizados conforme avança, não só no fim.
- Nunca imprima, ecoe ou cole o conteúdo de `.env` nem trechos de connection string.

## REGRAS DE ESCOPO — o revisor reprova por isso

- Implemente o que a task pede. Nada além.
- **Não invente API antes de existir chamador.** Um componente tem um nome por prop, não três. Não aceite ao mesmo tempo um objeto e as props planas equivalentes. Não use `useAttrs()` para aceitar variantes snake_case de props.
- **Nenhuma dependência fantasma.** Se você importa um pacote, ele está no `package.json`. "Já está na árvore transitiva" não vale — isso já foi reprovado duas vezes.
- Antes de adicionar qualquer dependência, responda no relatório: o MVP exige isto? qual a alternativa mais simples? essa decisão pode ser adiada?
- Melhoria fora de escopo vai no relatório, não no diff.
- Não conserte o que a task não mandou consertar. Achou erro fora do escopo, registre em `FORA DE ESCOPO NOTADO`.
