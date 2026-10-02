# Comentários e trechos no feed

Pedido: membros comentam resenhas e trechos lidos, trechos entram no feed, e campos mantêm somente a borda fina. Usuário aprovou: comentar exige login; autor do comentário e autor do registro podem remover comentários daquele post.

- Comentários são texto simples, de 1 a 2.000 caracteres após trim, em ordem cronológica. Sem respostas encadeadas, edição, reações ou notificações nesta entrega.
- Uma conversa pertence à resenha de um registro ou a um trecho específico. Resenha e cada trecho mantêm conversas separadas. Excluir o registro/trecho exclui os respectivos comentários por FK.
- Leitura e escrita respeitam visibleLogs(viewer); registros privados e perfis privados permanecem protegidos com 404. O feed existente permanece protegido pelo mesmo predicado.
- Trechos aparecem como eventos separados no feed geral e recente, inclusive sem anotação. Mostrar páginas, anotação quando existir, autor, livro e data de publicação; link aponta ao trecho na página do registro.
- Paginação continua estável por timestamp de criação e UUID; intervalos editados não criam eventos novos; cache invalida nas mutações de trechos existentes.
- Conversas ficam acessíveis no feed e no detalhe, com carregamento sob demanda no feed; ações têm estados de envio, erro e vazio, e impedem envio duplicado.
- Inputs, selects e textareas mantêm borda de 1px com mudança de cor no foco; retirar outline/box-shadow que criem uma segunda borda grossa. Botões e links mantêm foco visível.
- Sem dependências novas. Nuxt/Vue/Drizzle/PostgreSQL existentes. UI pt-BR; conteúdo escapado; migração aditiva e gerada pelo drizzle-kit. Preservar as duas correções de rolagem já presentes.

Validação: contratos de schema, autorização e exclusão de comentários, isolamento de conversas, união/paginação/visibilidade de eventos, interações do componente; lint, tipos, build e suíte existente. Integração em PostgreSQL dedicado a testes.
