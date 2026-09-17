# Configuração por projeto

A skill é compartilhável; `qa.config.json` é específico da aplicação. Não armazene configuração do consumidor na pasta de instalação global. `SKILL_DIR` é resolvido a partir de `SKILL.md`; `PROJECT_DIR` precisa ser explícito nos helpers. Nenhum script depende do diretório corrente para descobrir o app.

## Campos de `qa.config.json` (schema 2)

| Campo | Função |
| --- | --- |
| `name` | Identifica o projeto nos relatórios. |
| `target.baseUrl` | URL real sem credencial, query ou fragmento. Não há porta/framework obrigatório. |
| `target.environment` | `local`, `test`, `preview` ou `staging`; produção é recusada. |
| `target.allowedOrigins` | Origens HTTP(S) exatas revisadas. Não é uma configuração automática do browser. |
| `contextFiles` | Documentos opcionais, relativos à raiz do app. Não são executados. |
| `browser.command` | Executável instalado ou caminho revisado; não uma linha de shell. |
| `browser.viewports` | IDs e dimensões por projeto. |
| `jev.mode` | `required` (padrão híbrido) ou `off` (diagnóstico explicitamente sem Jev). |
| `jev.maxCalls`, `timeoutMs` | Orçamento por ledger/run e timeout por request; falhas também consomem tentativas. |
| `artifacts.directory` | Pasta relativa e privada; adicionar ao ignore do app. |
| `auth` | Instruções sem segredos para sessão anônima ou preparada. |
| `journeys` | Critérios, caminho obrigatório, recuperação proibida, ator, viewports e verificador. |

O validador recusa chaves desconhecidas, paths com traversal, IDs repetidos, viewports inválidos e campos de credenciais. A detecção de texto sensível é limitada: revisão humana e dados sintéticos continuam obrigatórios. As checagens não são sandbox contra um operador local malicioso.

## Começar

```text
node SKILL_DIR/scripts/qa.mjs init --project PROJECT_DIR --url http://127.0.0.1:4173 --environment local
node SKILL_DIR/scripts/qa.mjs config --project PROJECT_DIR
```

A URL acima é exemplo, não default a ser adivinhado. Em Windows e macOS/Linux, use aspas nos caminhos com espaços. `init` cria apenas a configuração, com exclusividade; não edita dependências, lockfiles, `AGENTS.md` ou `.gitignore` do app. Revise os marcadores `REVISAR:` e adicione `.qa-browser-jev/` ao ignore antes de coletar evidências.

O arquivo [de exemplo](../templates/qa.config.example.json) está completo para uma aplicação fictícia; personalize o conteúdo. Não contém uma conta verdadeira.

## Identidade sem exigir Git

```json
{
  "revision": "release-demo-001",
  "sourceDigest": "sha256 real de 64 caracteres do artefato ou manifesto",
  "buildId": "identificador do build observado no runtime"
}
```

As strings explicativas acima não passam no validador. Colete os valores reais. Com Git, inclua alterações locais e arquivos não versionados relevantes no fingerprint; só `git diff` não cobre tudo. Sem Git, use o hash do bundle/artefato implantado ou manifesto confiável. O runtime precisa ter evidência que corresponda a essa identidade. Não torne um hash arbitrário em prova.

`run-init` cria contratos e resultados vazios; não coleta automaticamente a identidade nem executa testes. A cópia `subject.initial.json` registra o começo. Ao final, colete `subject-current.json` novamente; copiar o arquivo inicial não prova ausência de alteração.

## Atualizações

Atualizar a instalação não deve alterar `qa.config.json`, fixtures ou evidências dos consumidores. v2 não aceita contratos v1 silenciosamente; confira [migração](migration-v2.md). Configuração muda antes da run ou em uma nova run, nunca no meio para enfraquecer critérios.
