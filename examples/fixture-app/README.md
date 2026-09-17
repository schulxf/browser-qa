# Aplicação sintética de demonstração

Na raiz do repositório, `npm run demo` ou `node examples/fixture-app/server.mjs`. O servidor escuta apenas em `127.0.0.1:4173`; `PORT` pode alterar a porta. Não instala dependências, não requer credenciais e não acessa serviços externos. Pare com Ctrl+C.

Rotas deliberadas:

| Rota | Comportamento para o piloto |
| --- | --- |
| `/` | Filtro preservado ao abrir Ajuda, retornar e recarregar. Layout responsivo. |
| `/broken-state` | Defeito proposital: retornar ao catálogo perde o filtro. O agente não deve reaplicá-lo para aprovar. |
| `/broken-layout` | Defeito proposital: cards forçam overflow horizontal em telas estreitas. Exige inspeção visual. |
| `/__qa/build` | Identidade verificável do artefato sintético. |

`qa.config.json` é o exemplo do cenário correto. Para as variantes, use cópia separada da configuração/projeto ou atualize a URL antes de uma nova run. Não altere a configuração no meio de uma run. Cada variante usa chave de armazenamento diferente; cada execução ainda deve usar contexto isolado.

A sequência é: selecionar Categoria A, verificar Caderno/Mochila, abrir Ajuda, voltar, verificar sem reaplicar e recarregar. Nos checkpoints abra screenshots desktop/mobile. O teste deve reprovar a variante com perda de estado e identificar o overflow da variante visual, não “corrigir” a página.

Este repositório verifica o servidor local e sua identidade por smoke HTTP separado. Isso não prova que o supervisor/Jev detectou os bugs em um navegador: o E2E real exige as ferramentas e deve ser registrado pelo mantenedor.

Nenhuma captura de evidência desta demo foi fabricada no pacote. O exemplo é intencionalmente pequeno; não mede confiabilidade geral ou velocidade de Jev.
