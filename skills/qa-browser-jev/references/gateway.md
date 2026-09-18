# Jev via Vercel AI Gateway

O adaptador usa `experimental_evaluate` do AI SDK `ai@7.0.105` e `typesafe-ai/jev`. Não usa chat completions. [Contrato oficial](https://vercel.com/docs/ai-gateway/modalities/evaluation).

Instale as dependências somente na pasta da skill instalada, não no aplicativo consumidor:

```text
npm ci --omit=dev --ignore-scripts --workspaces=false
node scripts/doctor.mjs
```

A chave vem de `AI_GATEWAY_API_KEY` ou do arquivo privado configurado pelo instalador. Gravador e leitor compartilham a resolução do caminho; veja [migração e credenciais](audit-hardening.md). Nunca coloque a chave no chat, CLI, configuração do app ou frontend.

## Conectividade explícita, separada do QA

```text
node SKILL_DIR/scripts/example-request.mjs --project PROJECT_DIR > REQUEST_PRIVATE.json
node SKILL_DIR/scripts/jev.mjs REQUEST_PRIVATE.json --project PROJECT_DIR --smoke --dry-run
# Gere novamente a observação antes do request pago.
node SKILL_DIR/scripts/example-request.mjs --project PROJECT_DIR > REQUEST_PRIVATE.json
node SKILL_DIR/scripts/jev.mjs REQUEST_PRIVATE.json --project PROJECT_DIR --smoke
```

Somente a última linha faz uma chamada paga. O diagnóstico usa uma tentativa por ID em `artifacts.directory/connectivity/ID`, separado de runs do produto. Para repetir, selecione deliberadamente outro ID de diagnóstico. `ADVISORY` e `approvesQa=false` não comprovam cobertura. O dry-run não imprime payload; ele carrega os segredos conhecidos para impedir que dados reconhecíveis vazem nos diagnósticos.

## Avaliação de um caso real

```text
node SKILL_DIR/scripts/jev.mjs REQUEST_PRIVATE.json --project PROJECT_DIR --approved-contract-sha256 HOST_APPROVED_SHA
```

`runId` deve existir e `scenarioId` deve ser um case incluído no contrato. O digest vem da aprovação do host, não de um contrato alterado. Configuração, origens, ambiente, orçamento e snapshot congelados devem concordar antes da chamada. O ledger `RUN_DIR/jev.jsonl` compartilha orçamento/lock com a navegação e registra contexto, tentativa, resultado ou erro. Pendência de resultado não autoriza replay.

`PROPOSED` é sugestão; `CHECKPOINT` pede verificação; `ESCALATE` devolve ao supervisor; `ADVISORY` é textual; `BLOCKED` não é passe. Uma chamada falha não vira aprovação e um teste de conectividade não substitui um resultado observado no app.

Mantidos timeout, `maxRetries: 0`, `zeroDataRetention: true` e `disallowPromptTraining: true`. Se não houver rota compatível, mantenha bloqueado; não retire filtros automaticamente. Esses parâmetros são pedidos de política, não certificação de privacidade. A detecção de segredos é limitada, não DLP. Use dados sintéticos e controle também os arquivos locais.

Limiares de proposta (0,90 de probabilidade e 0,20 de margem) não medem precisão real. O teto de chamadas não garante teto financeiro. Custo e tempo precisam ser medidos. Não invente versão imutável do modelo quando o Gateway não a expõe. Uma alteração do contrato retornado deve bloquear até ser verificada, nunca ser aceita por um alias arbitrário.
