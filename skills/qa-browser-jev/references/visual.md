# QA visual, interação e acessibilidade

## O que é verificação visual

É a inspeção da aplicação renderizada no estado testado. Não substituir por leitura do código, árvore acessível, screenshot apenas salva, opinião do Jev ou imagem conceitual. O revisor recebe e abre a imagem real. Se o host não disponibiliza visão, marque o gate visual bloqueado e mantenha os demais resultados.

## Matriz de captura proporcional ao risco

Padrão para alterações de UI: 1440×900 e 390×844. Acrescente 360×800, 768×1024, 1280×800, landscape e tamanhos imediatamente antes/depois de breakpoints alterados quando pertinentes. Cada viewport tem dados, tema, idioma e estado conhecidos. Não invente que viewport mobile simulado cobriu Safari iOS, teclado virtual, notch ou hardware real.

Capture abertura, estado estável, interação material, modal/menu/drawer, vazio, loading e erro relevantes. Valide entrada em página por navegação interna e deep-link/recarregamento quando aplicável. Screenshots de viewport mostram o que o usuário vê; full-page é complemento para cortes e espaçamento, não substituto. Para foco, hover, popover e transições, capture o estado exato.

## Rubrica

| Área | Conferir e registrar |
| --- | --- |
| Hierarquia | Qual é o assunto principal? O usuário entende a informação principal, os alertas e a próxima ação? Cards disputam a mesma atenção? |
| Consistência | Tokens, margens, radius, bordas, tipografia, iconografia, estados de botão e densidade seguem o sistema aprovado? |
| Legibilidade | Contraste medido quando alegado; tamanhos coerentes; números extensos, negativos, decimais, moedas, labels, truncamento e tooltips. |
| Geometria | Sobreposição, desalinhamento, cortes, overflow horizontal, espaços vazios acidentais, sticky/fixed que escondem conteúdo. |
| Navegação | Aba selecionada, contexto do usuário, voltar, breadcrumb, cabeçalho, menu mobile e foco correspondente à ação. |
| Dados e privacidade | Unidades e moedas (quando aplicável) consistentes; zero diferente de não disponível; valor desatualizado identificado; sinal de variação não depende só de cor; ocultar valores não deixa vazamentos em tooltips. |
| Responsividade | Ordem de leitura e ação preservada; tabelas/card adaptados; controles tocáveis; teclado virtual não cobre envio quando testável. |
| Estados | Skeleton proporcional; ausência de flashes desnecessários; estado vazio explica o próximo passo; erro é recuperável sem apagar trabalho válido. |
| Interação | Clique/teclado funcionam no estado capturado; loading impede duplicação; cancelar/fechar preserva ou descarta conforme contrato. |
| Conteúdo | Idioma/locale definidos pelo projeto; terminologia consistente; mensagens específicas; ausência de placeholders e texto de desenvolvimento. |
| Acessibilidade básica | Tab/Shift+Tab, foco visível, ordem lógica, Enter/Space, Escape, labels, mensagens de erro associadas, foco ao abrir/fechar diálogo, zoom 200% e preferência de movimento reduzido quando pertinente. |

## Defeito versus recomendação

Um número cortado, um botão encoberto e foco preso são defeitos observáveis. “Preferiria menos cards” é recomendação de design, salvo violação de requisito explícito. Não deixe uma média estética esconder falha de navegação, dados ou acesso. Sugestões não ampliam automaticamente o escopo de correção.

Para cada checkpoint registre: imagem, viewport, estado, revisor, achado, evidência/crop de apoio e consequência ao usuário. Um exemplo de revisão boa: “Em 390 px, o título longo do item ultrapassa o card e encobre o botão Detalhes; imagem VIS-03.” Evite “tela boa, nota 9”.

## Baseline e diffs

Use baseline aprovada vinculada a commit/artefato e estado. Fixe viewport, device scale, fonte carregada, tema, locale, dados e relógio de teste quando necessário. Máscaras de conteúdo dinâmico devem ser documentadas; não mascare um valor cuja correção esteja sob teste. Não desative animações se o objetivo for medir a transição real.

Diff de screenshot detecta mudança, não qualidade. Diferença intencional deve ter aprovação; diferença pequena pode ser um erro importante de dado ou controle. Ferramentas de snapshot/diff complementam a avaliação. Revise manualmente as regiões alteradas e as áreas vizinhas; não atualize baseline automaticamente.

## Medição e limites

Métrica visual ou auditoria automática de acessibilidade não equivale a conformidade completa. Não afirmar WCAG AA, compatibilidade cross-browser ou usabilidade com leitor de tela sem testes correspondentes. Declare exatamente a cobertura.

Em performance visual, mantenha a imagem do início/fim e eventos observáveis. Não esconda uma regressão de flicker por um `wait` arbitrário antes da captura. Para estados transitórios importantes, use vídeo/trace suportado, inspeção das frames relevantes ou amostragem com timestamps. Ausência de captura no momento da transição significa cobertura não executada, não ausência de flash.
