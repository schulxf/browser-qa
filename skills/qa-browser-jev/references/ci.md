# Evidências, revisão e CI independente

## Dois pipelines diferentes

O workflow incluído **testa a própria skill**, offline, sem chaves: scripts, contratos, limites e portabilidade. Ele não dirige o navegador da aplicação de um consumidor.

Um pipeline do consumidor precisa do app servido, browser isolado, agente supervisor com visão, chave de acesso por política e fixtures. O modo de invocar esse agente varia por host e não é implementado por este repositório. Não rotule `npm test` como E2E do produto.

Não exige GitHub Actions, Azure, Vercel hosting, containers, pnpm ou harness proprietário. O resultado JSON pode ser consumido por qualquer orquestrador. Integração com um harness é opcional: publique o caminho do relatório e status como evidência, sem se autoaprovar.

## Pacote por run

```text
PROJECT_DIR/.qa-browser-jev/runs/QA-001/
  config.snapshot.json
  contract.json
  result.json
  subject.initial.json
  subject-current.json        # coletado novamente, não copiado
  report.md
  jev.jsonl
  artifacts/
    nav-desktop.png
    nav-desktop.snapshot.txt
    nav-desktop.assertion.json
    nav-desktop.visual-review.md
```

Para que o gate encontre as evidências, seus paths no JSON são relativos à **pasta da run** (por exemplo `artifacts/nav-desktop.png`), não relativos a `artifacts/`.

```text
node SKILL_DIR/scripts/evidence.mjs RUN_DIR artifacts/nav-desktop.png screenshot
node SKILL_DIR/scripts/qa-gate.mjs RUN_DIR/contract.json RUN_DIR/result.json RUN_DIR RUN_DIR/subject-current.json
```

O primeiro comando emite hash e tipo do arquivo existente. Não cria prova nem faz avaliação da imagem. O segundo verifica integridade/completude declarada. Exit `0`: PASSED, `1`: FAILED, `2`: BLOCKED/entrada inválida. `approvesDeployment=false` sempre.

Todo caso incluído no contrato é obrigatório. Exclusões devem estar registradas antes de começar. Quaisquer mudanças do contrato requerem nova aprovação e atualização do hash, antes da execução. Depois de observar falha, não apague casos para aprovar.

## O que o gate verifica — e o que não verifica

Verifica esquema, contrato/configuração vinculados, identidade declarada do build, casos completos, status, hashes dos arquivos, paths sem escape, evidência de imagem, assertions declaradas, revisor diferente do executor, flag de inspeção visual, consumo Jev declarado quando obrigatório e defeitos bloqueantes.

**Não é assinatura criptográfica de um avaliador nem detector de narrativa inventada.** Um agente que fabricar JSON pode mentir. O isolamento do revisor e a confiança nos verificadores são responsabilidades do host. Hash correto só comprova que os bytes referenciados são os mesmos; não comprova que esses bytes são verdadeiros. Compare a identidade do runtime com serviço/manifesto confiável e guarde prova dessa comparação em um caso próprio.

Resultados de testes unitários usam fixtures simuladas; não são pacotes de QA real. `simulated=true` no relatório bloqueia um passe real, mas `false` sozinho não prova execução.

## Segurança em CI

Não entregue secrets a código de PR não confiável. Não use evento privilegiado para fazer checkout e executar código do contribuinte. Execute diagnósticos offline no PR; um smoke pago requer execução confiável e aprovação explícita. Não faça upload automático de HAR, screenshots autenticadas ou respostas completas em repositórios públicos. Redija um relatório sanitizado, conservando evidência original em armazenamento restrito com retenção definida.

Não substitua testes determinísticos, gates de segurança, cobertura existente ou aprovação de release por Jev. Não use um resultado semanticamente positivo para sobrepor assert negativo.
