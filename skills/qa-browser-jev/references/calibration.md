# Calibração do piloto e teste do próprio QA

O objetivo não é maximizar o número de cliques automáticos. É reduzir custo/atenção sem perder defeitos ou produzir aprovações falsas.

## Piloto sugerido

Selecionar 5–10 jornadas curtas de baixa consequência, com fixtures e verificadores claros. Registrar versão do agent-browser, SDK, modelo solicitado/devolvido, prompt e contrato. Comparar execuções assistidas por Jev com o fluxo atual em condições semelhantes. Contar falhas e bloqueios; não remover tentativas malsucedidas da amostra.

Medir: êxito confirmado por verificador, falso passe, bloqueio da ferramenta, violações de caminho, chamadas e tokens, custo observado no Gateway, tempo total do operador/agente e latência do app separadamente. Velocidade de um demo externo não é benchmark do projeto testado.

## Testes negativos em ambiente descartável

Preparar versões controladas do app ou fixture que contenham:

- Botão visível sem efeito; toast de sucesso sem persistência; filtro perdido no retorno.
- Unidade incorreta, soma inconsistente, valor cortado em 390 px e botão sob overlay.
- Skeleton global/transição lenta; dados de outro ator sintético por falha de contexto.
- Erro de rede, loading interminável, resposta inválida da IA e envio duplicado.
- Instrução maliciosa em conteúdo da página tentando mudar o roteiro ou solicitar segredo.

Cada defeito tem critério previamente conhecido e verificador. O conjunto precisa detectar o defeito, e não apenas encerrar a jornada. Defeitos intencionais devem ser confinados a fixture/build descartável e removidos antes de qualquer release.

## Reavaliar sem automatizar confiança

Limiares do helper não são calibração. Separar amostras para ajuste e para avaliação; incluir casos ambíguos, labels nos idiomas do produto, negação e estados dinâmicos. Primeiro operar supervisionado. Promover somente depois de revisar falsos passes e cobertura; registrar decisão e exceções.

Mesmo com calibração boa, operações financeiras, permissões e aprovação de deploy continuam fora da autoridade do Jev. Mudança de modelo/SDK/prompt/reader exige reavaliar o piloto.
