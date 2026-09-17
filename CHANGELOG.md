# Changelog

## 2.1.0 — 2026-09-17 — instalador público e compatibilidade entre agentes

- CLI/TUI instalável por `npx`, com instalação via ecossistema Agent Skills.
- Configuração protegida de `AI_GATEWAY_API_KEY` fora da skill e do projeto consumidor.
- Pacote npm preparado com `bin`, whitelist de arquivos e metadados públicos.
- README open source em inglês, com instalação pelo GitHub, arquitetura, segurança e limites.
- Compatibilidade documentada por capacidade do host, sem acoplar o supervisor a um modelo específico.

## 2.0.0 — 2026-09-17 — distribuição independente preparada

- Pasta da skill autocontida, separada de projeto consumidor e CI.
- Configuração JSON validada com URL, ambiente, viewports, jornadas, autenticação e limites.
- Inicializador sem sobrescrita, preparação de run, identidade sem Git obrigatório e hashes por configuração.
- Helper Jev ligado à configuração e ao ledger do consumidor.
- Documentação de instalação, contribuição, segurança, arquitetura, publicação e migração.
- Aplicação local demonstrativa e testes de portabilidade/limites.
- Sem publicação externa e sem validação real de Gateway/browser neste ambiente.
