# Contribuir

Comece com `npm test` na raiz. A suíte não precisa de API nem de browser. Não introduza dependências do produto de um consumidor, caminhos absolutos ou credenciais em fixtures.

Mudanças em schema/CLI exigem testes e nota de migração. Instalação por cópia e instalação global precisam funcionar sem arquivos do root do repo. A configuração do consumidor não deve ser alterada por atualizações.

Para alterar prompts/thresholds do Jev: mantenha candidato observado, contenção, escalada e ausência de aprovação automática. Faça uma avaliação com casos negativos e reporte erros, não apenas exemplos que passaram. Chamada real requer credencial e consentimento de custo, nunca em PR não confiável.

Defeitos de produto encontrados pelo QA não autorizam a skill a corrigi-los. Não reduza revisões ou evidências para fazer uma demo parecer melhor.

Antes do PR: teste offline, verifique links internos, documentação de instalação, ausência de dados privados e logs sensíveis. Para bugs, use versão da skill, versão do Node/browser, configuração sanitizada, passos e resultado esperado/observado. Nunca anexe token ou screenshot de cliente real.
