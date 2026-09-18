---
name: qa-browser-jev
description: "Valide visual e fluxos de aplicações web usando agent-browser como executor, Jev via Vercel AI Gateway como auxiliar textual e revisão independente. Use para QA de features, navegação, persistência, responsividade, formulários e regressões. Gera plano, evidências e relatório; não aprova por DONE do agente nem corrige o produto automaticamente."
license: MIT
metadata:
  version: "2.1.0"
  language: "pt-BR"
---

# QA Browser + Jev

## Identifique os dois diretórios

`SKILL_DIR` é a pasta deste arquivo; `PROJECT_DIR` é a aplicação que será testada. Nunca suponha que são a mesma pasta. Todos os scripts e referências estão dentro de `SKILL_DIR`; configuração e evidências pertencem ao projeto. Instalação global não significa configuração global compartilhada.

Esta skill é um protocolo executado por um agente, com helpers locais. **Não é um agente autônomo que testa um site ao rodar um único comando.** Não requer código desta ferramenta no frontend, backend ou infraestrutura do app.

O protocolo é agnóstico de modelo e segue Agent Skills. Codex, Claude, Gemini, Grok, DeepSeek ou outro modelo podem supervisioná-lo quando o host consegue carregar a skill, executar shell e inspecionar imagens. Um chat sem essas capacidades não executa o protocolo; sem visão, casos visuais ficam `blocked`.

## Papéis e limites

| Componente | Papel |
| --- | --- |
| Supervisor com visão | Planejar o teste, interpretar requisitos, inspecionar imagens e diagnosticar. |
| Jev | Sugerir uma escolha textual delimitada ou avaliar suficiência de evidência textual. Não vê screenshots e não concede aprovação. |
| agent-browser | Único controlador do browser; executar interações reais e coletar evidências. |
| Verificadores e revisor | Conferir efeitos, dados, persistência, layout e cobertura independentemente do executor. |

Não use outro controlador na mesma sessão. Não transforme saída de modelo em shell, JavaScript ou seletores inventados. Não trate uma declaração de confiança como prova.

## 1. Descoberta proporcional

Leia somente instruções aplicáveis e existentes no projeto (`AGENTS.md`, instruções do agente, documentos indicados em `contextFiles`). A ausência desses arquivos é normal; não invente um catálogo obrigatório. Requisito, tarefa ou briefing do usuário define o esperado, não o comportamento potencialmente defeituoso da tela.

Leia [workflow](references/workflow.md) e [segurança](references/security.md). Para visual, leia [rubrica visual](references/visual.md). Os demais detalhes estão em [configuração](references/configuration.md), [Gateway](references/gateway.md), [CI e evidências](references/ci.md) e [calibração](references/calibration.md).

Localize o `agent-browser` instalado e consulte `--version`, `--help` e a skill correspondente. Quando suportado, use `agent-browser skills get core --full` e `agent-browser skills get dogfood`; em outras versões, carregue o `SKILL.md` oficial instalado. Não suponha flags ou semântica sem confirmar. `$agent-browser` é uma forma de invocação de alguns agentes, não uma exigência do protocolo.

Confirme acesso a screenshots **como imagens**. Sem visão, marque os casos visuais `blocked`; salvar PNG ou ler texto da página não conta como inspeção. Sem subagentes, produza evidências para revisão humana independente; não invente outro reviewer ID.

## 2. Configuração do consumidor

Carregue `PROJECT_DIR/qa.config.json` com `scripts/qa.mjs config --project PROJECT_DIR`. Sem configuração, descubra a URL nas instruções reais e, com autorização para criar arquivo, use:

```text
node SKILL_DIR/scripts/qa.mjs init --project PROJECT_DIR --url URL_REAL --environment local
```

Os caminhos em maiúsculas são placeholders: substitua pelos reais e faça quoting apropriado ao shell. A configuração não executa comandos de setup. O agente deve revisar separadamente qualquer comando para iniciar o app.

O inicializador não sobrescreve arquivos. Revise as jornadas geradas, atores, origem, viewports e precondições. Aceita `local`, `test`, `preview` e `staging`; não produção. `local` exige loopback. Uma etiqueta de ambiente não comprova a identidade do serviço.

Rode `scripts/doctor.mjs --project PROJECT_DIR`. Para o modo híbrido, instale a dependência **apenas em SKILL_DIR**, conforme a referência do Gateway. A chave deve existir no ambiente do processo ou no arquivo privado do instalador; nunca pedir ao usuário para colá-la no chat. Faça smoke textual sintético antes da jornada; não o conte como QA do produto.

## 3. Contrato antes da execução

Modos de trabalho: `verify` para critérios definidos; `explore` para descoberta delimitada; `audit` para revisar a superfície acordada. Não prometa cobertura universal. `jev.mode=off` é uma escolha explícita de diagnóstico sem Jev, nunca modo híbrido aprovado por engano.

Registre identidade do que será testado (`revision`, `sourceDigest`, `buildId`), configuração, ambiente e critérios. Git é opcional: um digest de artefato ou manifesto de release verificável pode identificar uma implantação. Sem identidade confiável, continue a exploração útil, mas bloqueie a aprovação específica de build. Não fabrique SHA nem derive identidade somente da URL.

Use `scripts/qa.mjs run-init --project PROJECT_DIR --run-id QA-001 --subject-file IDENTIDADE.json`. Revise/congele o contrato e seu hash antes dos testes. Os casos gerados são rascunhos `not_executed`, não cobertura automática.

Para cada jornada: caminho feliz, voltar/cancelar, validação, loading, vazio, erro, recuperação legítima e persistência quando aplicáveis. Inclua autenticação/autorização somente com contas sintéticas autorizadas. Adicione casos de dados, acessibilidade e desempenho conforme risco.

O padrão de viewport é 1440×900 e 390×844, configurável. Não exige suporte mobile de toda aplicação; exclusões justificadas devem ser definidas antes de executar. Considere breakpoints, zoom, idiomas e teclado de acordo com o produto.

## 4. Baseline e navegação

Crie sessão isolada por ator e viewport. Inspecione screenshot inicial e obtenha snapshot com referências reais. Não conecte Chrome pessoal. Quando necessário, prepare autenticação por mecanismo compatível e aprovado **antes** da jornada; isso não prova o login. Confirme compatibilidade entre contenção por domínio e sessão/estado: não desative proteção silenciosamente.

Capture erros de console/rede desde o início. Um ambiente com CDN bloqueada pela própria contenção pode representar falha de setup, não bug do produto. Registre isso sem remover restrições para conseguir um passe.

Para passos já definidos, use agent-browser diretamente. Jev só entra quando há uma escolha útil ou ambiguidade textual.

## 5. Jev durante a navegação, não apenas no relatório

Leia [navegação delimitada e comparação](references/navigation.md). O caminho novo é experimental e opt-in: o supervisor revisa as capacidades e a imagem inicial uma vez por trecho; o código monta candidatos a partir dos refs reais e pode executar até três ações pelo **mesmo agent-browser**, sem pedir ao supervisor que reconstrua o JSON a cada clique.

1. Use `scripts/navigation.mjs open` com uma run existente, case de fluxo e hash do contrato aprovado. A ferramenta cria uma sessão isolada e captura o checkpoint inicial. Confira a identidade do ambiente e faça a preparação de autenticação/fixtures explicitamente fora da jornada; não use perfil pessoal.
2. Abra a screenshot como imagem. Depois de eventual preparação, use `capture` e inspecione a captura nova. Preencha `templates/navigation-plan.json` com o checkpoint revisado, alternativas de navegação de baixo risco e pós-condições derivadas do requisito. Não invente aceitação visual ou mudanças de escopo.
3. Execute `scripts/navigation.mjs run PLANO.json --project PROJECT_DIR`. Um candidato único segue diretamente, sem gastar Jev. Havendo alternativas elegíveis, Jev decide em `decide`; o código reobserva a página e executa somente a ação tipada. Conteúdo da página não concede novas capacidades.
4. `CHECKPOINT` significa voltar à inspeção visual e aos verificadores, **não passe de QA**. `FAILED`, `BLOCKED` ou `ESCALATE` preservam o primeiro problema. Não execute outro controlador enquanto o trecho estiver ativo. Nunca repita entrada após timeout de resultado desconhecido; não crie outra run para esconder a falha.
5. Um novo trecho exige checkpoint recém-inspecionado. Ações sensíveis, controle sem representação confiável e operações fora da lista voltam ao supervisor, sem enfraquecer a política. Finalize com `close` e revisão independente.

O helper original `scripts/jev.mjs` continua disponível para avaliação textual pontual. Não use `assess` apenas para concordar com um assert que já reprovou. Separe no relatório: conectividade da API, decisões durante navegação, ações escolhidas pelo Jev, avaliações de evidências, descobertas independentes e limitações. Concordar com uma reprovação não comprova que Jev evitou uma aprovação incorreta.

Não prometa redução de tempo/custo antes de medir. Compare runs pareadas com e sem Jev, mantendo fixture, escopo, visão e verificadores iguais. `scripts/navigation-compare.mjs` confere comparabilidade dos registros; não cria resultados de benchmark. `loopMs` não é tempo total de QA nem latência do aplicativo.

Sem suporte às capacidades necessárias, mantenha o percurso manual com agent-browser e registre o componente novo como bloqueado, sem fingir execução híbrida. Não remova filtros de privacidade ou simule respostas para aprovar.

## 6. Não esconda falhas

Se um filtro deveria persistir, não o reaplique depois de voltar. Se o botão falhou, não finalize pela API. Não recarregue a página para esconder travamento. Registre a primeira falha e separe explorações alternativas.

Use interação real do componente. Não execute scripts para atribuir valores, disparar handlers, remover overlays ou alterar storage durante a jornada. Leitura autorizada para verificar e setup de fixtures antes do caso são operações separadas. Operações sensíveis exigem confirmação e ambiente sintético; Jev não fornece autorização.

Toast, HTTP 200, `DONE` e opinião do executor não comprovam persistência. Verifique resultado por observação independente: após recarga, assert, backend autorizado, contagem de registros ou cálculo sobre fixture. Proteção no cliente não prova autorização no servidor.

## 7. Visual de verdade

Inspecione as imagens e aplique a rubrica: hierarquia, legibilidade, cortes, sobreposição, alinhamento, estados, foco, navegação, overlays, rolagem e responsividade. Referência aprovada só pode ser comparada em condições equivalentes de viewport, tema, dados e estado. Sem baseline, avalie usabilidade, não fidelidade pixel a pixel.

Uma screenshot final não demonstra ausência de flash ou loading intermediário. Use observação temporal compatível quando a transição estiver no requisito. Meça resposta do app separadamente da latência de modelos e comandos. Não certifique acessibilidade completa sem as verificações adequadas.

## 8. Relatório, revisão e encerramento

Guarde evidências em `artifacts.directory/runs/RUN_ID`, nunca dentro da instalação global da skill. Registre passos, esperado, observado, gravidade justificada, ambiente, build e evidência. Capture metadados com `scripts/evidence.mjs`; o script não afirma que alguém inspecionou a imagem.

Todos os critérios obrigatórios exigem resultado: `passed`, `failed`, `blocked`, `not_executed`. Não apague casos ou reduza denominador depois da falha. P0, P1 na superfície afetada e violação de critério obrigatório impedem aprovação. Sugestão estética não é automaticamente defeito.

Exija revisão independente para aprovar. Se não houver revisor disponível, entregue a execução com revisão pendente. Não corrija o app sem pedido explícito; após correção autorizada, inicie novo reteste e preserve evidência anterior.

Confira identidade atual novamente e rode o gate conforme [CI e evidências](references/ci.md). Ele verifica integridade/completude declarada; não prova a veracidade da narrativa nem permite deploy. Informe cobertura, falhas, bloqueios, limitações e caminhos das evidências.

**Conclusão permitida:** aprovado para este escopo e build, com as limitações registradas. Nunca “sem bugs”.
