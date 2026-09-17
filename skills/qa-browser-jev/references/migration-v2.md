# Migração para a versão independente 2.0

A v2 separa configuração e evidências da instalação. Não há documentação de produto, catálogo obrigatório de skills, caminho fixo de app ou integração obrigatória de harness.

Mudanças incompatíveis:

- Contrato/resultado usam `schemaVersion: 2` e `configSha256`.
- Identidade: `revision`, `sourceDigest`, `buildId`; não exige `gitSha` e `dirtyDiffSha256`.
- Ambientes são `local`, `test`, `preview`, `staging`.
- Ponte `jev.mjs` exige `--project`; o ledger é derivado da configuração e run, não de `--ledger` arbitrário.
- A configuração precisa de jornadas revisadas. `run-init` deixa todos os casos `not_executed`.

Não converta relatórios antigos automaticamente em evidência v2 aprovada. Preserve arquivos antigos e faça nova execução. Atualização da skill não deve reescrever configuração, run ou fixtures do consumidor.

O payload textual da ponte continua em `schemaVersion: 1`; ele é um contrato separado de `qa.config.json`, contrato da run e resultado (schema 2). Não altere o número do pedido Jev para 2.
