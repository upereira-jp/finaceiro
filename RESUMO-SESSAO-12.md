# RESUMO-SESSAO-12 — 29/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Verificar o que entrou no ar em 28/07 e o que a revisão de UX de hoje mudou — e percorrer a tela que a fila manda usar amanhã |
| **Método** | Medição, nos dois sentidos. O defeito achado foi **reproduzido no código anterior** antes de ser corrigido, e as duas fotos são da mesma condição de falha |
| **Resultado** | Produção conferida ponta a ponta · 1 defeito silencioso corrigido na tela de Contratos · 5 verificações novas (443 → 448) · **2 questões novas, uma vermelha** |
| **Commits** | `47e6eb0`, `9d40f15` — empurrados para `main` e **no ar** |

> # ESTADO ATUAL — 29/07/2026, tarde
>
> | | |
> |---|---|
> | **No ar** | `https://financeiro.blackhaus.io` — HTTP/2, TLS válido, as 8 rotas por caminho respondendo 200 |
> | **Produção vs. `main`** | o bundle servido é `index-4nVmkQDw.js`, **byte a byte o que `main` constrói**. A revisão de UX de hoje já está no ar |
> | **Catálogo contra produção** | **8 de 8 verdes** — CAT-1 a CAT-8, executados hoje |
> | **Suíte** | **448 verificações**, 22 suítes, `EXIT=0` |
> | **Correção desta sessão** | **no ar.** `index-DzZYJ0Ak.js`, mesmo hash do build local — reprodutível, não inferido |
> | **O que segura a primeira fatura** | os 39 contratos — e agora com uma pergunta na frente deles |
>
> **A fila, atualizada:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | **`Q-ORIGINADOR-01`** — os 39 contratos levam originador? | 🔴 **novo** | Vinicius + operação |
> | `contrato_ativo` — 39 de 39 | 🔴 | Vinicius + operação |
> | `Q-FATCHEIA-01` — o que é "fatura cheia" | 🔴 | Vinicius |
> | `Q-WEBHOOK-01` — autenticação do webhook Sicoob | 🔴 | Vinicius |
> | `Q-SICOOB-01` — certificado A1 | 🔴 | Vinicius (externo) |
> | `ADR-0005` — onde mora o segredo | proposta | Vinicius |
> | `Q-PRONTIDAO-COMIS-01` — o `?` que esconde 39 contratos | 🟡 **novo** | Vinicius |
> | `Q-AGENDA-01` — nenhum processo periódico existe | 🟡 | Vinicius |

---

## 1. O que produção respondeu

A revisão de UX de hoje trocou `#clientes` por `/clientes`, e isso move a responsabilidade para uma camada que ninguém tinha exercitado em produção: **o `nginx` e o `servirEstatico` precisam devolver o `index.html` para caminho sem extensão.** Se falhasse, recarregar a página ou abrir um link salvo daria 404 — e a navegação por barra continuaria funcionando, o que faria o defeito passar despercebido em qualquer teste feito clicando.

Medido, uma por uma:

```
/                          200  text/html      /prontidao                 200  text/html
/clientes                  200  text/html      /caminho-que-nao-existe    200  text/html
/usinas                    200  text/html      /assets/index-4nVmkQDw.js  200  text/javascript
/unidades                  200  text/html      /api/publico/config        200  application/json
/contratos                 200  text/html      /api/clientes              401  application/json
/donos /carteira /tarifas  200  text/html
```

A última linha é a que mais importa: a API continua **recusando sem Bearer**, e o `_` do caminho desconhecido cai na SPA sem abrir buraco no `/api`.

**Produção está em `main`.** O bundle servido é `index-4nVmkQDw.js`, e reconstruir `main` do zero produziu esse mesmo hash — não é inferência por data de commit.

**Catálogo contra produção, hoje:** CAT-1 a CAT-8, `catalogo: 8 invariantes, nenhuma falha`. As regras 1, 2, 3 e 11 seguem valendo no banco real, não só no de teste.

---

## 2. O defeito: a tela que diz "não há contratos" quando o que houve foi uma falha

O `web/src/dados.ts` abre com um aviso escrito por quem o construiu:

> *"A ARMADILHA QUE ELES FECHAM: um `catch` vazio deixa a tela mostrando lista vazia quando a chamada falhou. Vazio é um estado legítimo do sistema (não há contratos, de fato), então uma falha silenciosa vira 'não há nada' — indistinguível do certo."*

O exemplo do comentário é **contrato**. E a única tela do sistema que comete a armadilha era, exatamente, a de contratos:

```ts
try { return [u.id, await api.get(`/unidades-consumidoras/${u.id}/contrato-vigente`)] }
catch { return [u.id, null] }        // <- 404, 500, 401 e queda de rede: tudo vira "sem contrato"
```

Varredura de todo o `web/`: **um** ponto, e é este.

### Medido antes de corrigir

Mock com as 39 UCs de produção, uma delas contratada, e a rota devolvendo **500 para justamente a UC contratada** — a falha de uma requisição entre 39. Rodado contra o código de `main`, o mesmo que está no ar:

| | `main` (antes) | com a correção |
|---|---|---|
| UCs oferecidas como livres | **39** — inclusive a que já tem contrato | **0** |
| Linhas na tabela | **0** | 0 |
| Frase na tela | ***"Nenhum contrato — e é isso que impede a primeira fatura."*** | "Não foi possível ler os contratos — o aviso acima diz por quê. Esta lista não está vazia: ela é desconhecida." |
| Aviso de erro | **nenhum** | "Falha ao ler o contrato vigente." |

A linha do meio é o estrago. A tela não ficava só vazia: ela **afirmava o diagnóstico que trava o projeto inteiro** — e oferecia a UC já contratada para receber um segundo contrato, que a R14 recusaria com 409 depois de tudo preenchido.

O `<Aviso>` de `vigentes.erro` **já existia** na tela desde que ela foi escrita. Nunca recebeu nada, porque o `catch` consumia o erro antes.

Caminho normal conferido depois da correção: 38 livres, 1 contrato na tabela, nenhum aviso. Igual a antes.

### O que mudou

- só **404** vira `null` — é a resposta legítima da rota para "esta UC não tem contrato vigente". Qualquer outro erro sobe e o `useDados` o põe na tela;
- enquanto `vigentes` não respondeu, ou falhou, **não há lista de livres**. Antes, `!vigentes.dado?.[u.id]` dava `true` nesses dois estados e a tela oferecia todas as UCs, inclusive as contratadas;
- o texto do vazio distingue os **três** estados. "Nenhum contrato" durante a carga é a mesma mentira que o `catch` contava.

---

## 3. O teto de simultaneidade, e a medição que derrubou a minha explicação

As 39 UCs disparavam 39 requisições ao mesmo tempo, e cada uma prende uma conexão do pool **transacional**, que tem `max` 8 e `maxWait` de 5.000 ms. Pus um teto de 6 em `emLotes`.

**A primeira medição não confirmou nada** — o pico foi 6 com e sem o teto. O motivo é que o mock local é HTTP/1.1, e **o browser já limita a 6 conexões por origem**. O teto que eu media era do browser, não meu.

Produção responde em **`h2`** — conferido por ALPN. Em HTTP/2 os 39 pedidos viajam multiplexados numa conexão só e o limite do browser não existe. **O único ambiente que reproduziria o problema é o de produção**, que é onde ele não pode ser reproduzido de propósito.

Daí o teto ficar em JavaScript, onde o protocolo não o desfaz — e daí os testes `L2`/`L2b` prenderem o número nos dois sentidos: que ele é respeitado, e que é *atingido*, porque um `emLotes` que rodasse em série passaria no primeiro e deixaria a tela lenta sem ninguém notar.

`web/tests/lotes.ts`, 5 verificações. É a primeira suíte do `web/` — roda em `npm test` e o `tsc --noEmit` da SPA agora inclui `tests/`.

---

## 4. As duas questões novas, e as duas saíram de percorrer a tela

**`Q-ORIGINADOR-01` 🔴** — produção tem **zero originadores**, e o contrato **não tem caminho de edição**: `originador_id` e o tier congelado (R20-b) só se escrevem no `rascunhar`. Quem digitar os 39 hoje grava nulo nos 39, e `src/repos/split.ts:164` só monta item de comissão quando os dois existem — então o split roda, fecha e **não paga comissão, sem erro e sem log**. Corrigir depois é `encerrar` + `renovar`, que abre linha nova, zera `faturas_cheias_pagas` e registra na trilha uma renovação que não houve. **É a pergunta que vem antes dos 39 contratos, não depois.**

**`Q-PRONTIDAO-COMIS-01` 🟡** — e a prontidão não avisaria. A camada `regra_de_comissao` conta `DISTINCT originador_tipo_no_fechamento` **filtrando `IS NOT NULL` nos dois lados**: com 39 contratos sem originador, `tiers_em_uso` fica em 0, `situar(0, 0, derivada)` devolve `nao_medido` e a tela mostra `?`. É o **mesmo `?` de hoje** — que hoje significa universo vazio e que o `RESUMO-SESSAO-11` §7 defendeu como honesto. Ali é honesto; aqui esconderia 39 contratos que nunca pagariam comissão.

Nenhuma das duas foi decidida. Regra 10.

---

## 5. O estado dos dados em produção, medido hoje

```
cliente ................. 84      contrato ................. 0
unidade_consumidora ..... 39        contrato ativo ......... 0
  com data_vencimento ... 0       dono_usina ............... 0
  com usina ............. 39      regra_repasse ............ 0
usina ................... 4       originador ............... 0   <- Q-ORIGINADOR-01
regra_comissao .......... 10      fatura / boleto / liquidacao . 0
tarifa .................. 1       conector_cobranca ........ 0
usina_geracao ........... 8       auditoria ............ 389
                                  usuario .................. 2
```

Nada se moveu desde 28/07: a digitação não começou. A fila do `RESUMO-SESSAO-11` continua exata — com um item novo na frente dela.

---

## 6. O que NÃO foi feito, e por quê

| O quê | Por quê |
|---|---|
| **Nenhuma questão decidida** | Regra 10. As duas novas têm dono nomeado |
| **`Q-PRONTIDAO-COMIS-01` não corrigida** | Qual dos dois comportamentos é o certo depende da `Q-ORIGINADOR-01`. Escolher agora seria o default "porque parecia razoável" |
| **`Q-AGENDA-01` não construída** | A fila de emissão e a consulta ativa só falam com a Sicoob, e o adaptador real depende do `ADR-0005` e do A1. Seria máquina que só roda contra o adaptador falso |
| **Nada mexido no CRM** | Regra 4 |
| **Nenhuma migration, rota ou regra de negócio tocada** | O escopo foi `web/` e documento. O banco não mudou |

---

## 7. O deploy, e o que foi medido em volta dele

Dois commits, `47e6eb0` (a correção) e `9d40f15` (o registro e as questões), empurrados para `main` e aplicados pelo ciclo documentado no `RESUMO-SESSAO-11` §12:

```bash
cd /opt/financeiro/app
sudo -u financeiro git pull --ff-only
sudo -u financeiro env PATH=/opt/financeiro/node/bin:$PATH npm run web:build
systemctl restart financeiro
```

`npm ci` não foi preciso — nenhuma dependência mudou; só `scripts` do `package.json`.

**O build do servidor deu o mesmo hash do build local — `index-DzZYJ0Ak.js`.** Não é conferência por data de commit: é a mesma saída, byte a byte, dos dois lados.

Medido depois do restart, e o que interessa é o que **não** mudou:

```
financeiro     active, ouvindo em 127.0.0.1:3000        (nao 0.0.0.0 - RESUMO-SESSAO-11 §2)
role           app_financeiro_login, sem BYPASSRLS, sem SUPERUSER
bundle servido index-DzZYJ0Ak.js                        (o corrigido)
rotas          /clientes /contratos /carteira /desconhecido  200
API            /api/clientes sem Bearer                 401
CRM            9 processos PM2 online, app.blackhaus.io 200
servidor :80   404                                       (o `zz-` continua carregando depois do CRM)
```

As três últimas linhas são a regra 4 conferida na prática: o financeiro subiu, desceu e subiu de novo sem que o CRM notasse.

**A nota do `RESUMO-SESSAO-11` continua valendo:** o `git pull` do servidor não valida nada — o backend roda TypeScript sem build. `npm test` é **antes** de commitar.
