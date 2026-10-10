# Landing reestruturada: ilustrações de origami que acompanham o texto

Status: implementado em 2026-10-10, com mudanças em relação a esta proposta. O vídeo único da `feat/landing-origami` foi descartado.

**O que foi entregue (difere do §3):** depois de comparar as duas versões, o owner escolheu **loop de fundo**, e não scroll-scrub. Cada capítulo tem altura natural, com copy e cena lado a lado no desktop, e no celular a cena vem acima do texto (no hero, abaixo).
- Cada cena é um vídeo mudo em vai-e-volta a 48 fps, em velocidade 2× (cerca de 5,6 s). Toca quando 25% dela está visível e pausa fora da tela.
- Não há botão de pausa, por decisão do owner. Com `prefers-reduced-motion`, ficam só os posters. Isso é uma exceção consciente à WCAG 2.2.2, que pede pausa para movimento automático com mais de 5 s. Se a página um dia tiver público além do grupo, reavaliar.
- O fundo de cada vídeo foi ajustado para `#14181c` e travado nessa cor antes de codificar.
- As cenas 4, 5 e 8 foram salvas por edição, sem regerar. A 4 usa o vídeo original. A 5 virou dissolves entre estados assentados, com o fundo trocado. A 8 virou um dissolve do livro entrando no vão, a partir da imagem, com o preenchimento feito no Codex.
- Os títulos da landing usam `.paper-text`, uma textura de papel via `background-clip: text`, com contraste de 7:1 ou mais e fallback para forced-colors.

## 1. Por que o vídeo único não funcionou

Era um bloco de 260 svh sem texto. A câmera passeava, mas nada do que aparecia explicava o que a página dizia, e a pessoa rolava "através" de um filme sem saber por quê. A scroll-world funciona porque **cada cena é casada com a copy da seção**: o texto fica fixo enquanto a câmera está dentro da cena, e a cena mostra literalmente o que o texto descreve.

## 2. O que trazemos da scroll-world, e o que não

| Da skill | Aqui |
|---|---|
| Uma cena por seção, com a copy da seção fixa enquanto a cena anda | **Sim.** É o casamento que faltava |
| Um "style preamble" idêntico em todos os prompts, para parecer um mundo só | **Sim** (§5) |
| Scroll como scrubber: nada se mexe se ninguém rola, e a cena anda para trás ao rolar para cima | **Sim** |
| Câmera "locked-iso", o modo mais calmo e barato | **Sim:** câmera parada, só os objetos se mexem |
| Conectores entre cenas com a regra de seam (último quadro = primeiro do próximo) | **Não.** Com câmera parada e crossfade curto entre seções, cada vídeo é independente e você pode gerar e regerar um sem quebrar os outros |
| Página inteira `position: fixed` com a copy por cima do vídeo | **Não.** O texto nunca fica sobre a ilustração (§3) |
| Cadeia 9:16 para o celular | **Não.** No celular a ilustração fica dentro da seção, em 3:2 (§3) |

## 3. Layout

**Desktop (≥ 900 px): coluna de texto à esquerda e palco fixo à direita.**

```
┌──────────────────────────┬──────────────────────────────┐
│ Hero: título, Entrar     │                              │
│                          │   PALCO (sticky, 100svh)     │
│ Um livro, uma página.    │   mostra a cena da seção     │
│ [registro Dom Casmurro]  │   que está no centro da tela │
│                          │   e anda conforme o scroll   │
│ Leitura em andamento     │                              │
│ Estante e diário         │   troca de cena =            │
│ Mapa e estatísticas      │   crossfade de 250 ms        │
│ Atividade do grupo       │                              │
│ Seus dados               │                              │
│ Qual foi o último livro? │                              │
└──────────────────────────┴──────────────────────────────┘
```

- Colunas `minmax(0,5fr) minmax(0,7fr)`. Sem texto sobre a imagem, sem barra vazia.
- Cada bloco de texto vira um "capítulo" com `min-height: 80svh`, para que a cena dele tenha espaço de scroll. O progresso do capítulo pelo centro da viewport (0 a 1) leva o vídeo do primeiro ao último quadro.
- No load, o hero já mostra a cena 1 parada ao lado do título. A coluna direita deixa de ficar vazia.

**Celular (< 900 px): a ilustração vem dentro de cada seção, acima do título, em 3:2.** Ela anda com o progresso da própria seção passando pela tela. Nada fica preso e não sobra faixa vazia.

**Reduced motion e SSR:** mostra só a imagem parada de cada cena, sem vídeo. A troca entre cenas no desktop vira um crossfade.

**Peso:** cada vídeo de 5 s com câmera parada sai com cerca de 0,3 a 0,6 MB (960 px, `-g 8`). Cada um só baixa quando o capítulo chega a 1,5 viewport de distância. As imagens paradas ficam em WebP de cerca de 40 KB.

**Aproveitado da branch atual:** `app/utils/scrollScrub.ts` com o teste, o logo e o favicon de origami. Descartados: `LandingReadersScroll.vue` e os `readers-*.mp4`.

## 4. As cenas

Todas usam a câmera parada. O primeiro quadro é a imagem gerada no GPT, e o último é o "estado concluído", que fica parado no fim.

| # | Seção / copy | Imagem (primeiro quadro) | Animação (o que o vídeo faz) | Último quadro |
|---|---|---|---|---|
| 1 | Hero: "Terminou o livro? Conte pro grupo." | Leitor de origami sentado de pernas cruzadas, o livro âmbar acabou de ser fechado no colo e um tsuru de papel branco está pousado na capa | O leitor levanta a cabeça; o tsuru abre as asas, decola e voa em arco até o canto superior direito | Leitor olhando para cima, tsuru pequeno no alto, ainda dentro do quadro |
| 2 | "Um livro, uma página." (nota, data, resenha, visibilidade) | Livro âmbar aberto, deitado; acima dele flutua um cartão de papel branco com cinco estrelas de papel dobradas, ainda planas | As estrelas se dobram em 3D uma a uma; quatro ficam âmbar e a quinta continua branca; o cartão inclina de leve para a câmera | Cartão com 4 estrelas âmbar e 1 branca |
| 3 | Leitura em andamento | Leitor de bruços, apoiado nos cotovelos, livro âmbar aberto no chão com uma fita marcadora âmbar | Ele vira duas páginas com o dedo e a fita avança junto | Livro mais adiante, fita na nova página |
| 4 | Estante e diário | Estante de papel dobrado, metade cheia de livros de origami brancos e âmbar, com vãos vazios | Livros deslizam um a um para os vãos, da esquerda para a direita | Estante completa |
| 5 | Mapa e estatísticas | Mapa-múndi de papel dobrado em sanfona, deitado, todo branco | Alguns países se erguem e ficam âmbar; ao lado, uma pilha de livros cresce de 1 para 4 | Mapa com países âmbar e a pilha de 4 |
| 6 | Atividade do grupo | Os três leitores (do estilo aprovado) sentados em roda, cada um com um livro | Um tsuru passa de um para o outro; um deles estende o livro para o vizinho | Tsuru pousado no meio da roda |
| 7 | Seus dados | Caixa masu de origami aberta, com livros pequenos em volta | Os livros entram na caixa, a tampa dobra e fecha, e uma fita âmbar dá a volta | Caixa fechada com a fita |
| 8 | "Qual foi o último livro que você terminou?" + Entrar | Estante de papel cheia, com um único vão vazio e uma luz âmbar suave | Uma mão de origami entra pela lateral e encaixa um livro âmbar no vão | Estante completa, a mão já saiu |

## 5. Style preamble (igual em todas as imagens)

> Origami paper diorama illustration. Everything is folded from matte paper with crisp creases and visible facets: off-white and pale warm-grey paper for figures and objects, amber/orange paper (#f59e0b family) only for books and small accents. Faceless figures with smooth faceted heads, same proportions and paper style as the attached reference. Soft single key light from the upper left, gentle contact shadows only. Perfectly flat solid #14181c background edge to edge: no floor texture, no horizon line, no vignette, no gradient. Calm editorial illustration, high detail. Subject centered with headroom; nothing important near the left or right edge. No text, letters, numbers or logos. Wide 3:2 landscape.

## 6. Prompt de vídeo (Gemini/Veo, por cena)

Anexe a imagem da cena como **imagem inicial** e cole:

```
Image-to-video, the attached image is the first frame.
Locked-off camera: the camera does not move, pan, tilt, zoom or cut.
<ANIMAÇÃO da tabela §4>.
Motion is slow and gentle; everything not mentioned stays perfectly still.
End on <ÚLTIMO QUADRO da tabela §4> and hold completely still for the final second.
Keep the exact paper material, lighting, colors and the flat #14181c background of the first frame.
No text, no letters, no new objects except those described, no people entering.
16:9, 5 to 8 seconds, no audio, no music.
```

Me mande cada `.mp4` assim que sair. Eu audito quadro a quadro (cortes, deformação de mãos, deriva de câmera e de cor do fundo) e devolvo a cena para regerar se precisar.

## 7. Ordem de execução

1. As imagens das 8 cenas (Codex) chegam para você aprovar ou pedir ajuste. ← agora
2. Você gera os vídeos no Gemini com o prompt do §6.
3. Eu audito e codifico (960/640, `-g 8`, sem áudio, cor do fundo puxada para `#14181c`).
4. Implementação por um Haiku, num worktree novo a partir de `develop`, com prompt e critérios de aceite. Eu audito: gates, navegador no desktop e em 375 px, reduced motion.
5. Commit com o seu ok.
