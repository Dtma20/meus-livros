---
name: project-code-review
description: Use when reviewing a pull request, local diff or task delivery in this repository, running a pre-review before opening a PR, or drafting review comments against the project's conventions and acceptance criteria.
---

# Code review de projeto

Adaptada da `marelli-code-review`: investigar além dos hunks, reproduzir candidatos e classificar antes do parecer. O método é reutilizável; as regras do repositório ficam em [references/meus-livros.md](references/meus-livros.md). Leia essa referência neste projeto. Ao portar a skill, substitua a referência e este link pelas fontes do destino.

## Contexto e fontes

Resolva a raiz do repositório revisado. Caminhos de código e documentação na referência são relativos a essa raiz; o link acima é relativo à skill. Siga instruções locais e do usuário. Identifique as fontes de arquitetura, segurança, frontend, testes e processo que se aplicam ao diff.

Leia integralmente a tarefa e os documentos selecionados pela referência, incluindo tabelas, exceções e critérios de aceite. Buscas localizam fontes e símbolos, mas não substituem a leitura da regra. Cite identificadores existentes; sem catálogo numerado, cite arquivo e seção. Se documento e código divergirem, registre a divergência, verifique a tarefa e a decisão vigente; não invente uma regra para resolver a lacuna.

Não herde idioma, Jira, papéis de aprovação, limites de tamanho ou formato de PR de outro projeto. Fontes ausentes são limitações declaradas, não documentos a inventar.

## Investigação

1. **Delimite.** Para PR: título, corpo, commits, base/head, diff, checks e tarefa vinculada. Para diff local: staged/unstaged, arquivos novos, base de comparação e tarefa disponível. Confira `git status --porcelain -uall`. Sem PR, Jira ou CI, prossiga com as fontes locais; registre o que não pôde verificar.
2. **Leia o caminho completo.** Examine os módulos alterados, dependências e consumidores: validação, autorização, consulta, resposta, estado e UI. Compare com a base. Investigue correção e segurança, limpeza de recursos/estado e adequação da solução ao escopo. Uma suíte verde ou relato do autor não substitui essa análise.
3. **Perturbe as transições relevantes.** Ao comparar com snapshot, edite e volte ao valor inicial. Em novo `await`, investigue rejeição e promessa que nunca resolve. Em `catch` que só registra, confira a recuperação visível. Ao trocar identidade de uma entidade montada, confira seleção, rascunhos e operações pendentes. Feche prompts por botão/Escape e execute a ação seguinte. Aplique também as lentes locais da referência.
4. **Confirme cada candidato.** Use o menor probe capaz de demonstrar o cenário, em workspace temporário ou worktree separado quando precisar escrever arquivos. Registre comando, resultado e comportamento esperado/observado; compare com a base quando necessário. Probes ficam fora do diff entregue. Uma prova estática determinística serve quando demonstra todo o caminho; não equivale a teste executado. Se faltar ambiente, mantenha a suspeita com impacto e lacuna explícitos, sem afirmar reprodução ou aprovação completa.

## Severidade antes do parecer

Preencha este registro para cada candidato, mesmo que a saída final seja curta:

```text
localização: arquivo e linhas verificadas
regra: fonte/seção ou identificador; nenhuma após leitura; indisponível se ausente
cenário e impacto: condição concreta → resultado incorreto/risco
origem: introduzido | correção incompleta prometida | preexistente exposto
evidência: reproduzido (comando/resultado) | prova estática | não confirmado (motivo)
classificação: blocker | tech-debt | question | nit
motivo de rebaixamento: necessário se houver impacto/regra obrigatória e não for blocker
```

Na ausência de taxonomia local, use:

| Tag | Critério |
|---|---|
| `blocker:` | Defeito introduzido, correção prometida incompleta ou violação explícita de regra obrigatória, sustentado por reprodução ou prova determinística. |
| `tech-debt:` | Problema preexistente apenas exposto, fora da correção prometida; indique acompanhamento existente ou sugerido. |
| `question:` | Depende de decisão de produto ou evidência ainda ausente; explicite o que falta e o impacto potencial. |
| `nit:` | Melhoria opcional sem impacto nem violação obrigatória. |

Raridade, tamanho do diff, senioridade e checks verdes não rebaixam impacto comprovado. Uma correção incompleta não vira dívida preexistente se tarefa, PR, commit ou comentário promete corrigir o cenário. Preferência de estilo não vira blocker; lacunas de processo seguem a política local. Se houver escala P0–P3 exigida pelo formato de saída, preserve-a e explique o bloqueio no texto, sem inventar equivalência entre urgência e tag.

## Entrega

Use o idioma e formato locais. Apresente os achados por impacto, com localização, cenário, evidência e correção mínima; depois o parecer explícito, checks executados e limitações. Diferencie “nenhum achado confirmado no escopo” de “verificação completa”. Discuta, refine ou descarte candidatos diante de novas evidências do usuário.

Review produz diagnóstico e rascunhos. Alterar código, publicar comentários, aprovar ou integrar exige autorização compatível com a ação; aproveite autorização já dada. Para publicar review autorizado, confira novamente head e reviews existentes. Payloads de PR usam `commit_id`, caminho, linha e lado verificados; diff local não recebe coordenadas fictícias de PR.
