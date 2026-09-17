# Execução operacional

## Antes de executar

Descubra a diretório do projeto, `SKILL_DIR`, diretório privado da run e URL a partir da configuração real. Os comandos abaixo são exemplos de sintaxe documentada em 17/09/2026; confira o help da instalação. Não mudar o gerenciador de pacotes do aplicativo nem instalar dependências da ponte no frontend.

O diretório da run é derivado da configuração: `PROJECT_DIR/<artifacts.directory>/runs/<runId>/`. Não armazene dados do consumidor na instalação da skill. Somente um controlador dirige cada sessão.

## Captura e interação

Exemplo de referência, substituindo URL/refs com valores realmente observados:

```sh
agent-browser --session qa-run-desktop open http://localhost:3000
agent-browser --session qa-run-desktop set viewport 1440 900
agent-browser --session qa-run-desktop snapshot --json
agent-browser --session qa-run-desktop screenshot antes.png
agent-browser --session qa-run-desktop snapshot -i
agent-browser --session qa-run-desktop click @e7
agent-browser --session qa-run-desktop snapshot --json
agent-browser --session qa-run-desktop screenshot depois.png
```

A opção de sessão deve acompanhar todas as chamadas. A sessão mobile usa outro nome e 390×844. A sessão do ator B é outra sessão; nunca reutilize contexto de autenticação entre atores. Use `open` para preparação da rota; para validar a navegação, percorra os links reais e não abra diretamente o destino.

Consulte comandos de logs, rede, trace, vídeo, foco, teclado e diffs na skill da versão instalada. Instale capacidades adicionais somente com autorização. Não use `networkidle` indiscriminadamente em telas com conexões persistentes. Espere o estado observável específico, com timeout; registre espera excedida.

`agent-browser` captura a imagem; o agente com visão precisa abrir essa imagem usando a capacidade real do seu host. CLI e screenshot, sozinhos, não tornam Jev visual.

## Onde Jev entra

Use quando há uma escolha semântica estreita. Não peça ao Jev “teste todo o app”. O supervisor monta os candidatos a partir dos elementos observados e mantém valores de fixture localmente. O helper não gera valores de campo; o mesmo agente de programação fornece texto sintético ou usa fixture aprovada. Não é necessária segunda API de texto para esta skill.

O JSON de `snapshot --json` documentado possui `data.snapshot` e `data.refs`. A ponte espera refs normalizadas como `@e7` com `{role,name}`; faça essa transformação explicitamente e rejeite schemas desconhecidos. Não interprete prosa livre como refs. Os detalhes da observação podem variar conforme versão; confirme na ferramenta.

A origem do pedido deve ser exata e previamente aprovada, por exemplo `http://localhost:3000`. Query e fragmento são retirados do payload externo, mas o supervisor conserva a URL completa em evidência privada e verifica mudanças de rota localmente. Remova identificadores pessoais também dos segmentos do path; somente atores sintéticos.

Fluxo de uma microjornada:

1. Snapshot e imagem de baseline; supervisor lê a tela e fixa o objetivo.
2. Observe, normalize e produza candidatos de baixo risco.
3. Chame a ponte e examine `status`, `observationId`, `observationHash`, candidato e alertas.
4. Imediatamente antes da interação, confirme que o alvo observado ainda representa o mesmo controle. Refs podem sobreviver a updates na versão atual, mas não assuma validade após navegação/substituição. Uma comparação de texto não é lock atômico do DOM.
5. Execute um clique/preenchimento/tecla; observe o efeito. Em transições de risco, não usar seleção autônoma: supervisor e verificador explícitos.
6. A cada checkpoint: capture e abra a imagem; faça a leitura/assert independente.

Não há execução automática de comandos na ponte: a defesa contra estado obsoleto e a semântica do risco são responsabilidades do protocolo de execução. Para ação irreversível, “baixo risco” escrito em JSON não a torna segura.

## Exemplo: filtro persistente

**Critério:** o filtro de categoria permanece ao sair do Catálogo, abrir Ajuda e retornar.

**Preparação:** usuário sintético com duas categorias; carregar catálogo pelo caminho normal; escolher Categoria A; registrar a lista esperada.

**Passos contratados:** clicar em Ajuda; aguardar estado pronto; voltar por Catálogo; não tocar no filtro.

**Verificações:** controle ainda exibe A; conjunto de itens corresponde à fixture; ator e estado da lista continuam corretos; ausência de recarga global quando esse requisito estiver no contrato. Capturas antes/depois e observação de rede para a transição.

**Falha:** se voltar sem filtro, registrar `failed`. Ações para reaplicá-lo invalidam o caminho; não transformar em passe. Diagnóstico e tentativa alternativa são um caso separado.

## Exploração e regressão não são iguais

Na exploração, o agente pode procurar caminhos alternativos e formular hipóteses. Na regressão, o roteiro e a condição de sucesso são fixos. Bugs descobertos na exploração viram casos determinísticos ou casos supervisionados com oráculos claros. Registre a cobertura explorada; não declare cobertura de tela inteira só porque ela foi visitada.

## Handoff independente

Entregue ao revisor somente contrato, identidade de build, passos executados, saídas brutas minimizadas, imagens e candidatos a defeito. O revisor deve inspecionar evidências antes de aceitar o resumo do executor. Controle da sessão, quando transferido, é sequencial; revisor visual também pode ler imagens sem tocar no browser.
