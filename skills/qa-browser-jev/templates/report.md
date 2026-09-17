# Relatório de QA — <run-id>

**Estado:** BLOQUEADO / REPROVADO / APROVADO PARA O ESCOPO IDENTIFICADO

**Task / contrato:** <identidade + hash>

**Ambiente / URL minimizada:** <local/test/preview/staging>

**Código / mudanças locais / build servido:** <revisão/release + digest + evidência do runtime>

**Executor / revisor independente:** <identidades reais>

**Ferramentas:** <agent-browser versão + skill hash; SDK; Jev solicitado/devolvido; prompt versão>

## Resultado

<Resumo do que foi efetivamente verificado, bloqueios e consequência para a entrega. Não escrever “sem bugs”.>

## Cobertura contratada e executada

| Caso | Critério | Ator / viewport | Estado | Evidências | Verificador |
| --- | --- | --- | --- | --- | --- |
| <ID> | <critério aprovado> | <ator / tamanho> | <passed/failed/blocked/not_executed> | <caminhos e hashes> | <assert/revisor> |

**Obrigatórios:** <n>. **Aprovados:** <n>. **Falharam:** <n>. **Bloqueados:** <n>. **Não executados:** <n>.
Itens bloqueados e não executados não desaparecem do denominador. Captura salva, mas não inspecionada, não conta como visual aprovado.

## Revisão visual

| Captura | Estado / viewport | Inspecionada por | Achados e consequência | Baseline ou critério |
| --- | --- | --- | --- | --- |
| <arquivo> | <estado/tamanho> | <revisor com visão> | <observação específica> | <referência> |

## Defeitos

### <BUG-ID> — <título observável>

**Gravidade e motivo:** <P0/P1/P2/P3; superfície alterada; bloqueia critério?>

**Precondições:** <fixture/ator/viewport/estado>

**Reprodução:** <passos exatos, inclusive a primeira falha>

**Esperado:** <critério e origem>

**Observado:** <o que realmente aconteceu>

**Evidência:** <screenshot/trace/log/assert + hash>

**Hipótese:** <se houver, rotulada; não confundir com causa comprovada>

**Recuperação tentada:** <não houve / houve; não transforma a jornada em passe>

**Reteste:** <novo build/run e caso original; não apenas tela final>

## Desempenho e saúde

<Timings do app e método separados do tempo do agente/Jev; cache frio/quente, tamanho da amostra, console/rede, requests falhos e causa de contenção quando aplicável.>

## Uso do Jev

<Chamadas reais, tentativas, tokens observados, modelo retornado, latência, escaladas e falhas. Limiar de probabilidade não é acurácia medida. Dry-run não é uso real.>

## Limitações e exclusões

<Falta de dispositivo físico, leitor de tela, fixtures, imagens, identidade remota ou capacidade de ferramenta. Distinguir exclusão pré-aprovada de teste não executado.>

## Parecer independente

<Revisor confirma quais artefatos inspecionou, requisitos conferidos e veredito. Aprovação limitada ao build/escopo/ambiente. Não autoriza deploy.>
