# Jev via Vercel AI Gateway

## Adaptador isolado

O exemplo oficial atual da Vercel usa `experimental_evaluate` do pacote `ai` e o modelo `typesafe-ai/jev`. Este adaptador mantém `ai@7.0.105`, conforme o pacote-base; a instalação desse pin e uma chamada real ainda precisam ser verificadas pelo mantenedor. Não é configuração de `chat/completions` e não é modelo de chat do agent-browser. Fontes: [modelo](https://vercel.com/ai-gateway/models/jev) e [implementação oficial](https://github.com/vercel/ai/blob/main/packages/ai/src/evaluate/evaluate.ts).

```js
import { experimental_evaluate as evaluate } from 'ai';
const result = await evaluate({
  model: 'typesafe-ai/jev',
  state: { text: 'Estado sintético revisado.' },
  questions: {
    next: { type: 'choice', instructions: 'Escolha uma opção permitida.',
      criteria: { CHECKPOINT: 'Verificar de modo independente.', ESCALATE: 'Pedir investigação.' } }
  },
  maxRetries: 0,
  abortSignal: AbortSignal.timeout(8000),
  providerOptions: { gateway: { zeroDataRetention: true, disallowPromptTraining: true } }
});
```

Os filtros acima são pedidos de política, não certificação de privacidade. Se não houver rota compatível, a chamada deve permanecer bloqueada. Não retire filtros automaticamente. A implementação só utiliza dados sintéticos; logs locais e o processo supervisor também precisam de proteção.

## Instalar sem modificar dependências do produto

Dentro da **pasta real da skill instalada**, não do projeto alvo:

```sh
npm ci --omit=dev --ignore-scripts --workspaces=false
npm test
```

O lockfile versionado foi resolvido e testado com `ai@7.0.105`; o instalador usa `npm ci` dentro da cópia instalada da skill. O root do repo só tem scripts offline; não instale `ai` no frontend da aplicação. Atualizações do SDK exigem revisão explícita do lockfile, smoke e testes antes de publicar.

Exporte `AI_GATEWAY_API_KEY` no processo do supervisor ou use o instalador `browser-qa configure`. Os helpers procuram o arquivo privado criado pelo instalador em `%APPDATA%\browser-qa\credentials.env` no Windows ou `${XDG_CONFIG_HOME:-~/.config}/browser-qa/credentials.env` em macOS/Linux. `BROWSER_QA_ENV_FILE` aponta outro caminho revisado; a variável do processo sempre tem precedência. Em POSIX, o arquivo precisa negar acesso a grupo e outros. O valor não deve aparecer no chat, em screenshots ou em argumentos da CLI. Não use prefixos públicos do framework.

## Smoke pago explícito

Com projeto configurado, chave presente e diretório privado preparado:

```text
node SKILL_DIR/scripts/example-request.mjs --project PROJECT_DIR > PEDIDO_PRIVADO.json
node SKILL_DIR/scripts/jev.mjs PEDIDO_PRIVADO.json --project PROJECT_DIR --dry-run

# Gere de novo porque a validade da observação é curta.
node SKILL_DIR/scripts/example-request.mjs --project PROJECT_DIR > PEDIDO_PRIVADO.json
node SKILL_DIR/scripts/jev.mjs PEDIDO_PRIVADO.json --project PROJECT_DIR
```

Somente a última linha faz request pago. Esperado para a fixture: `ADVISORY`, `answers.evidence.choice=supported`, `approvesQa=false`. Resultado diferente requer investigação. A fixture não abriu browser, não comprova qualidade de QA e usa `runId=QA-CONNECTIVITY`. Para a run do app, gere pedidos com o `runId` real e dados observados.

O CLI obtém ambiente, orçamento e origens de `qa.config.json`. Ledger automático em `artifacts.directory/runs/RUN_ID/jev.jsonl`; entradas não podem misturar configuração ou run. Lock evita chamadas simultâneas. Queda do processo pode deixar lock; remover somente depois de confirmar que não existe processo dono.

## Semântica das saídas

`PROPOSED` é sugestão validada, ainda sujeita a conferência antes da ação. `CHECKPOINT` solicita verificação. `ESCALATE` devolve ao supervisor. `ADVISORY` é avaliação apenas textual. `BLOCKED` corresponde a entrada/dependência/serviço indisponível (exit 2). `DRY_RUN_ONLY` nunca conta como request real.

Os helpers não controlam browser. Não precisam de outra API de texto: fixtures/preenchimentos são fornecidos localmente pelo supervisor. Dois pedidos (`next`, `pageState`) compartilham o estado textual. O modo `assess` só julga o material entregue, não lê o backend.

Limiares de proposta: probabilidade >=0,90 e margem >=0,20; são heurísticas não calibradas. Não representam precisão garantida. Token/custo/tempo devem ser medidos; limites por chamadas não garantem teto de fatura. Configure teto também na conta do Gateway.

O ID do Gateway pode não expor versão imutável do modelo. Registre ID pedido, retornado quando disponível, versão do SDK, hash do prompt e data. Não invente revisão fixa. Mudanças exigem smoke e calibração, não atualização cega.
