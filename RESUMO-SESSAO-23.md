# RESUMO-SESSAO-23 — 06/08/2026

| Campo | Valor |
|---|---|
| **Foco** | **Mitigar tudo que dá antes do portal da Sicoob.** O pedido foi esse, e o critério de "dá" ficou: não depende de ninguém de fora, e não é decisão com dono |
| **Método** | Percorrer as próximas ações da `RETOMADA-2026-08-06` uma a uma e separar em três pilhas — *o que eu resolvo*, *o que é insumo humano*, *o que espera a Sicoob*. A primeira pilha era maior do que a retomada supunha, e a razão está na §3 |
| **Resultado** | **1607 → 1618 verificações** · `EXIT=0` · catálogo **9/9 contra produção** · **0 migrations** · **nada escrito em produção** |
| **Não feito, e de propósito** | `src/sicoob/http.ts` · a decisão do nome do DICT · a `Q-FATCHEIA-01` · a competência · os cinco insumos humanos |
| **Publicado** | ✅ **`34d028c` no ar às 21:39 de 06/08**, a pedido do dono. Bundle `index-DN-7K2b1.js`, `sha256` do servido idêntico ao compilado; o aviso da tarifa conferido **dentro** do bundle servido; guarda de arranque com 37 tabelas; catálogo 9/9; dados intactos. **Zero migrations** — 25 = 25 |

> **Nenhuma decisão de projeto foi tomada nesta sessão.** Onde apareceu escolha, ela virou pergunta com dono ou entrada no `QUESTOES.md` — regra 10. As três entregas abaixo são *deixar de esconder*, *deixar executável* e *deixar provado*.

---

## 1. A aba Documento deixou de ser suposição

A `RETOMADA` §0 nomeava exatamente uma coisa como não provada: *"a aba Documento aberta, com a chave listada pelo apelido e o seletor **Chave usada ao compor o lote** preenchido. `401` prova que a rota existe e recusa credencial — não que ela funciona."*

E ela tinha razão em desconfiar: **foi assim que a aba Documento passou quebrada por um deploy inteiro em 30/07**.

**O que ficou medido, em três camadas:**

| Camada | Como | Resultado |
|---|---|---|
| **o dado** | `psql` contra produção | `chave_pix` com apelido `G3 GESTAO ENERGIA SOLAR`, tipo `cnpj`, chave `66714022000121`; `identidade_de_cobranca.chave_pix_padrao_id` apontando para ela; **15** `campo_do_documento`; `layout_do_documento` com **0** linhas, que é o caso normal |
| **o bundle** | `curl` do que produção **serve**, `sha256` contra `web/dist` | `index-ifeZbjC7.js`, **byte-idêntico**. E contém `chaves-pix`, `Chave usada ao compor o lote` e `cobranca/identidade` |
| **a tela** | o bundle servido, renderizado em Chromium com o payload de produção | monta inteira, **sem erro em painel nenhum**, e o seletor sai com `G3 GESTAO ENERGIA SOLAR — 66714022000121` |

*(O bundle citado é o que estava no ar **quando a medição foi feita**. Depois da publicação das 21:39 produção serve o `index-DN-7K2b1.js`, e a aba foi renderizada de novo sobre ele, com o mesmo resultado — §4 da `RETOMADA-2026-08-06`.)*

**O que isso NÃO cobre, e a distinção é a mesma que o `401` ensinou.** A camada HTTP do processo no ar não foi exercida com credencial válida — medido: `/api/cobranca/chaves-pix` responde **401** e `/api/rota-que-nao-existe` responde **404**, o que prova roteamento e não funcionamento. O código no VPS tem a rota (conferido no arquivo do servidor). **O login do dono continua sendo o único teste que fecha os dois lados** — o que mudou é que o modo de falha de 30/07, *a tela quebrar ao montar*, passou a estar medido em vez de suposto.

---

## 2. A `Q-TARIFA-CONC-01` perdeu o silêncio — e continua sem decisão

O que a questão achou em 06/08 não é um dado que falta: é uma **ordem que nenhum documento diz**. Entre compor e emitir existe um terceiro ato, `npm run tarifas`, e **nem a `PENDENCIAS-2026-08-05` nem o "caminho mais curto" da `RESUMO-SESSAO-21` §7 o tinham**.

O modo de falha é o pior formato possível:

- `valor_total_centavos` é coluna **gerada** — `consumo + tarifas_concessionaria + juros_multa`;
- a segunda parcela tem **default 0**, e `comporLote` usa zero quando ninguém informa;
- então o lote **compõe e emite sem erro nenhum**, cobrando só o crédito. Não há exceção, não há log, não há linha vermelha. Há uma fatura menor, que o cliente paga.

E `lancarTarifasPorUC` **só aceita rascunho**: depois de emitida, corrigir é **cancelar e recompor**, com motivo na trilha.

**O que foi feito é contar, e a distinção importa mais que o código.** `conferirTarifas` (`web/src/cobranca-regras.ts`, puro) devolve `rascunhos`, `comTarifa`, `semTarifa` e as **UCs nomeadas**. A tela de Faturas mostra um aviso persistente e repete a contagem **dentro do `confirm()`** — porque o aviso fica acima da tabela e some quando alguém rola, e o `confirm()` é o último lugar antes do ato. O `npm run faturar -- --valendo` imprime o mesmo ao fim do lote.

**Nada trava, e isso é a regra 10 aplicada e não esquecida.** Zero pode ser o valor certo da competência — é a pergunta (a) da questão, que tem dono e não é a tela. A verificação **`B10f` prende exatamente isso**: com duas faturas sem tarifa, `podeEmitirFatura('rascunho')` continua `true`. O precedente é o `prontidao.ts`: *conta e NÃO decide*.

A invariante do módulo é a soma — `comTarifa + semTarifa === rascunhos`, sempre (`B10b`) —, pela mesma razão do `lote-de-documentos.ts`: contagem que perde item em silêncio é pior que contagem nenhuma, porque parece completa.

---

## 3. O quarto caso da `Q-PECA-NAO-PLUGADA-01`, e este estava no caminho crítico

A `RETOMADA` §2 dizia, sobre o nome do recebedor divergir do DICT: *"Alinhar custa um comando e a hora é agora, enquanto nenhuma fatura foi emitida."*

**O comando não existia.**

- `PUT /cobranca/chaves-pix/:id` existe desde a migration 25 e tinha **zero chamadores**;
- a aba Documento **só cadastra** — não há formulário de edição;
- reexecutar o cadastro não resolve: `chave_pix_chave_unica` recusa a mesma chave;
- ou seja, a única saída seria `UPDATE` à mão, **por fora do contexto de tenant e da conferência de chave**.

É a quarta ocorrência do padrão que a `Q-PECA-NAO-PLUGADA-01` registrou em 30/07 — e **a primeira achada pela varredura que a própria entrada prescreveu**: procurar o chamador de uma peça citada como pronta. As três primeiras apareceram por acidente.

**Plugado em `npm run identidade -- --editar`**, reusando o aparato que já estava lá: `--ensaio` com rollback, a conferência de chave, o "digitado → gravado", e o BR Code regerado **pela mesma função que a fatura chama**. Ele imprime o diff campo a campo.

**Três coisas que o `--editar` preserva, e cada uma por um modo de falha:**

| | Por quê |
|---|---|
| `titular_nome`, `titular_documento`, `observacao` | `editarChavePix` reescreve a **linha inteira**, e `texto(undefined)` é `NULL`. Não devolvê-los **apaga os três**, sem erro — o mesmo defeito que a `SPEC-002` R25 corrigiu no conector em 03/08. A verificação `W1l` afirma o sentido perigoso de propósito, para que mudá-lo não passe em silêncio |
| `ativa` | editar não é reativar |
| **quem é a chave padrão** | editar corrige uma linha; escolher destino é outro ato. Juntá-los mudaria o destino do próximo lote sem ninguém pedir — que é o acoplamento que a aba Documento já separa em dois botões |

**E `editarChavePix` não tinha teste nenhum** (regra 8). Ganhou quatro: `W1j`–`W1m`.

**A decisão de alinhar o nome continua sendo do dono.** O que mudou é que ela virou executável, com ensaio.

**O que continua NÃO plugado, e fica registrado:** a aba Documento segue sem formulário de edição. Corrigir uma digitação pela tela é impossível; o caminho é o script.

---

## 4. Erros meus desta sessão

| O erro | Como apareceu | O que ficou |
|---|---|---|
| **O instrumento de medida mentia sobre produção.** Montei o harness devolvendo `[]` para `/cobranca/campos` — produção tem **15 linhas**. A tela renderizou *"Você ainda não configurou nada"*, e eu ia usar essa foto como prova de que a aba está certa | contar as linhas no banco em vez de supor que estavam vazias, como `layout_do_documento` estava | Os 15 campos entraram no harness na ordem gravada. **É a mesma classe da sessão 15 — o defeito dentro do próprio instrumento de medida —, e aqui ele produziria uma prova que afirma algo falso sobre produção** |
| **A primeira foto carregava um erro vermelho que o produto não tem.** *"Falha ao ler o layout: /api/cobranca/layout"* — rota que eu não tinha previsto no harness | o log do harness, que imprime rota não prevista | O harness passou a **falhar alto** em rota desconhecida, e o payload de layout foi gerado **importando o módulo real** em vez de copiado à mão |
| **Matei o servidor pelo padrão errado e fotografei um servidor velho** | a foto veio `ERR_CONNECTION_REFUSED` | Barato. Registrado porque a versão intermediária — servidor velho **respondendo** payload velho — teria produzido uma foto plausível e errada, e essa eu não teria percebido |

---

## 5. O que eu decidi NÃO fazer

1. **`src/sicoob/http.ts`.** As três razões da `RESUMO-SESSAO-21` §5 não mudaram, e a credencial de sandbox está a um cadastro de distância. Escrever agora é escrever duas vezes;
2. **Alinhar o nome do DICT.** É escolha do dono sobre o que o pagador vê. Fiz o comando existir; não usei o comando;
3. **Travar a emissão sem tarifa da concessionária.** Seria a tela inventando regra de negócio sobre uma pergunta que tem dono. Contei;
4. **Formulário de edição de chave na aba Documento.** É tela nova com testes próprios, e o caminho do script cobre a necessidade de hoje. Fica registrado como não plugado em vez de meio-feito;
5. **O deploy — até o dono pedir.** Toca a SPA, e publicar é ato dele. Pedido e feito no mesmo dia, às 21:39; a conferência está na `RETOMADA-2026-08-06` §4.

---

## 6. Para quem abrir a próxima sessão

**A próxima ação continua sendo o portal — e agora tem folha.** `SICOOB-portal-2026-08-06.md`: cinco passos, **lacunas para preencher enquanto navega**, e uma tabela de *se vier X, então Y*. A pedido do dono ela ficou **enxuta e imperativa** — o *porquê* de cada item continua na §1 da `RETOMADA-2026-08-06`, e quem vai ao portal leva a folha, não a §1.

**E uma coisa que a folha diz e que vale repetir:** o portal **não move a primeira fatura**. São duas cadeias. O que segura o faturamento são sete linhas de planilha e decisão — nenhuma delas depende da Sicoob, porque o meio de pagamento de hoje é o Pix estático, que já está no ar com a chave cadastrada.

**O deploy já foi feito** — 21:39 de 06/08, sem migration, conferido na `RETOMADA-2026-08-06` §4. O aviso da tarifa já existe para quem opera.

**E o que continua humano:** os cinco insumos, a `Q-FATCHEIA-01` e a competência. Nenhum deles andou hoje, e nenhum andava por código.
