# Identidade visual — papel sobre grafite

Direção aprovada em 2026-10-11. O Meus Livros é o diário de leitura do clube Nerdolas: registrar livros, escrever resenhas, organizar a estante e compartilhar leituras.

## Linguagem

- Território: livro, página, vinco, marcador, estante, diário e troca entre leitores.
- Grafite `#14181c` permanece como fundo para integrar as cenas existentes.
- Papel marfim `#eee7d8`, cinza quente `#b5afa3`, bege de dobra `#d2c7b3` e âmbar `#e9ad4f` formam a paleta. Neutros dos painéis seguem o grafite, sem dominante azul.
- Lora para títulos e textos de resenha; Inter para navegação, formulários e metadados.
- Superfícies foscas, bordas finas, sombras curtas de contato e raios de 3/6/10 px.
- Assinatura: um vinco ou marcador discreto em painéis, navegação ativa, registros, estatísticas e estados vazios. Não recortar controles nem cobrir conteúdo.
- Origamis decorativos não participam da árvore de acessibilidade. Ícones funcionais preservam seus rótulos.
- Textura limitada aos títulos grandes já presentes na landing. Formulários e textos longos usam cores sólidas.
- Capas reais mantêm suas cores. Capas ausentes recebem papel dobrado na mesma paleta.
- Movimento de baixa amplitude; respeitar `prefers-reduced-motion` e `forced-colors`.

## Aplicação e validação

1. Centralizar cores, bordas, superfícies e sombras em `app/assets/css/tokens.css`.
2. Harmonizar formulários, navegação, livros, diário, atividade, mapa e estatísticas.
3. Aplicar detalhes de papel aos painéis de autenticação e cadastro, às seções e aos estados vazios.
4. Validar contraste de textos/controles, testes existentes, lint, typecheck, build e navegador em desktop/celular.

Manter APIs, conteúdo e fluxos existentes. Não adicionar dependências nem animações automáticas novas. Preservar o trabalho em andamento nas cenas e na landing.
