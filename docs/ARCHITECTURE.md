# Arquitetura e decisões

## Unidade distribuível

`skills/qa-browser-jev` é autocontida. Um instalador pode copiar somente essa pasta para qualquer destino. Scripts resolvem templates pela localização de `import.meta.url`, não pela raiz do projeto. O root agrega documentação, exemplo e CI de mantenedores.

`PROJECT_DIR` é explícito. Configuração por projeto é JSON puro; não há hooks executáveis. Os helpers não iniciam o app, não escolhem porta e não leem todos os arquivos do projeto. O supervisor descobre instruções e planeja a execução.

## Limites de responsabilidade

O helper Jev recebe um snapshot normalizado e candidatos escolhidos pelo supervisor. Valida forma, origem, frescor, limites e dados óbvios de segredo; envia avaliação pelo Gateway e normaliza o resultado. Não executa a proposta. O supervisor revalida o alvo e interage usando agent-browser.

Há também um caminho experimental de [navegação delimitada](../skills/qa-browser-jev/references/navigation.md): `navigation.mjs` orquestra o próprio agent-browser, associa refs reais às capacidades previamente revistas e executa até três ações por trecho. Um candidato único dispensa Jev; alternativas elegíveis usam `decide` antes da ação. O supervisor não precisa reconstruir cada payload, mas deve inspecionar cada checkpoint e manter os verificadores independentes.

O helper Jev continua sem controlar o navegador. O código executa somente comandos tipados e limitados; não há outro cliente CDP, shell gerado por modelo, recuperação automática de falhas ou aprovação autônoma. O caminho novo exige uma run existente, configuração congelada, hash do contrato aprovado e sessão exclusiva. Resultados ambíguos param a execução; o relatório final do produto não é alterado pelo runner.

Os contadores distinguem navegação de avaliação posterior das evidências. O comparador A/B analisa registros de medições fornecidos pelo host e recusa contextos diferentes; não gera benchmarks nem demonstra benefício do Jev sem execuções reais.

## Identidade e portabilidade

Configuração tem hash registrado por run. Fonte/artefato tem `sourceDigest`; `revision` pode ser SHA, tag ou release; `buildId` precisa corresponder ao serviço observado. Não existe dependência obrigatória de Git. Os relatórios permanecem separados por projeto e run.

## Segurança não cosmética

A recusa de produção existe no validador. O orçamento configurado realmente limita tentativas da ponte. A origem do input precisa pertencer às origens do projeto. A escrita de run evita sobrescrita e recusa diretórios simbólicos na árvore de artefatos. Falha ou ausência de ferramenta não é convertida em sucesso.

Ainda há limites: input revisado é uma declaração do supervisor, não proteção contra todo ataque; allowlist do browser é separada; dados locais podem vazar por ferramentas externas; hashes não provam veracidade. O relatório deve declarar essas fronteiras.
