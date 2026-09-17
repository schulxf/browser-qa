# Instruções para contribuir neste repositório

Este é o repositório da skill, não o app sob teste. A skill distribuída fica em `skills/qa-browser-jev`; toda dependência necessária em runtime deve permanecer nesse subdiretório. Exemplos e docs do root são opcionais para consumidores.

Não faça chamadas pagas, instale dependências, abra browser ou publique releases sem autorização apropriada. O baseline verificável é `npm test`, offline. Não confunda esse baseline com um teste E2E do produto.

Não introduza convenções de um cliente, dados reais ou links de repositórios privados. Não altere o app consumidor nem sua configuração ao atualizar a skill. Mantenha limites: Jev não vê imagens, não controla shell e não aprova QA; agent-browser é o único controlador; revisor independente aprova cobertura.
