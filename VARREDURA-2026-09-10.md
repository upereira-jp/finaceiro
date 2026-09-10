# VARREDURA COMPLETA — o que falta para lançar a operação

| Campo | Valor |
|---|---|
| **Para quem** | O dono, para decidir o que vai para a operação e o que ainda espera |
| **Data** | 10/09/2026 (madrugada e manhã) |
| **O pedido** | *"varredura completa no sistema em busca de possíveis erros ou furos para que possa lançar para o operacional"* |
| **Método** | Medição, não leitura de anotação: as **124 rotas** cruzadas contra o que a interface chama, as **39 tabelas** cruzadas contra quem as lê, o **journal dos quatro serviços** dos últimos seis dias, o **log do nginx**, e o **banco de produção** lido por dentro do próprio código |
| **Suíte** | **2.873** verificações locais (eram 2.792) · CI verde nos cinco jobs (run `34435585020`) |

> ## A frase de uma linha
>
> **O sistema está construído e nunca emitiu uma fatura — e a varredura achou
> sete atos de rotina que só existiam por fora da interface, sendo que um deles
> deixava o boleto vivo no banco depois de a fatura ser cancelada. Os sete foram
> fechados hoje; o que sobra para lançar não é código, é a conta da
> distribuidora e o dono da usina.**

---

## 1. O retrato medido da produção

Lido em 10/09/2026, pelo próprio código, sem escrever nada:

| O quê | Quanto |
|---|--:|
| Clientes | 101 |
| Unidades consumidoras | 51 (29 faturáveis) |
| Contratos ativos | 28 |
| Usinas | 4 |
| **Donos de usina cadastrados** | **0** |
| Originadores | 2 |
| **Faturas emitidas, desde sempre** | **0** |
| Boletos | 0 |
| Pagamentos recebidos | 0 |
| Linhas de auditoria gravadas | 21.317 |

**A leitura que importa:** o caminho do dinheiro está inteiro montado e nunca foi
percorrido uma vez. Tudo que este documento chama de furo foi achado por
inspeção, e não por alguém tropeçar — o que é a hora certa de achar.

---

## 2. O que foi consertado hoje, e o que cada um custava

### 🔴 2.1 · Cancelar a fatura deixava o boleto VIVO no banco

**O pior achado do dia, e ele é dinheiro.** `POST /faturas/:id/boleto/baixar` —
a rota que cancela o título no Sicoob — existia desde sempre e **nenhuma tela a
chamava**. Junto disso, cancelar a fatura nunca olhou para o boleto.

O par produzia dinheiro sem título: a fatura virava `cancelada` aqui e o cliente
continuava com uma linha digitável válida na mão. Pago depois disso, o dinheiro
entraria na conta e a baixa seria **recusada** — porque fatura cancelada não
aceita liquidação. O pagamento existiria no extrato e não existiria aqui.

**Agora:** o servidor recusa cancelar a fatura enquanto o título estiver
registrado, dizendo qual é o botão que resolve; e o botão **«Cancelar o boleto no
banco»** passou a existir, com motivo obrigatório. A ordem certa — baixar no
banco, depois cancelar — é exercitada inteira por três verificações que rodam
contra um banco de verdade.

### 🔴 2.2 · A fila retentava um caso para sempre, em silêncio

A fila de envio aceitava fatura `vencida`; quem escreve o boleto recusa tudo que
não seja `emitida`. A fila pegava a linha a cada 5 minutos, a recusa subia
**antes de tocar qualquer coluna**, e nada era gravado — nem o erro, nem a
contagem, nem o próximo horário. Sem escrita não há recuo: a mesma linha voltava
na rodada seguinte, para sempre.

**Agora:** a fila só aceita o que o escritor aceita, e o caso não some por isso —
ele vira linha na lista nova, com o nível «parado».

### 🟠 2.3 · Não havia lista de quem ficou sem boleto

O erro aparecia **por fatura**, dentro de um painel que abre numa linha de
tabela. Com 29 unidades, saber que 4 estão retentando exigia abrir 29 painéis. E
a fila, por decisão registrada, **nunca desiste sozinha**.

Ao medir para escrever a lista apareceu o caso que a frase não via: **a fatura
emitida em que ninguém pediu o boleto.** Emitir e pedir o boleto são atos
separados de propósito, e a fila só retenta boleto que já foi pedido uma vez —
essa fatura não está em erro, não está atrasada e **não está em fila nenhuma**.

**Agora:** a aba de emissão tem «O que ainda não chegou ao banco», com o motivo
de cada uma, o que o banco respondeu e o botão que pede o boleto. E Pendências
ganhou a faixa que **conta** («4 faturas sem boleto, a mais antiga há 9 dias»),
para ninguém precisar abrir aquela tela para descobrir que precisa abri-la.

### 🟠 2.4 · Uma unidade estava travada há SEIS DIAS

O journal mediu: a leitura do outro sistema recusava a mesma linha **a cada 15
minutos desde 04/09 às 18h — 519 vezes**. É o caso de contrato de rateio que
muda de unidade no CRM, e a saída existia só como comando de terminal.

Pior: a tela de Pendências mostrava a recusa sob a frase *"a correção é feita no
outro, que é o dono do dado"* — verdade para divergência, **falso para esta
recusa**: lá o CRM já está certo, e o que está velho é o vínculo daqui.

**Agora:** a linha da unidade tem o painel «Vínculo com o outro sistema», que
confere as quatro guardas e oferece soltar o vínculo velho quando é seguro. E a
frase de Pendências separa recusa de divergência.

⚠️ **E a medição contra a produção mudou o texto da tela.** Exercitado o caminho
novo contra o banco real, o caso travado **não é** troca entre duas unidades
nossas: o CRM diz que o contrato passou a servir `000091762801211` e que nenhum
contrato serve `000000100076075` — **o número da unidade foi corrigido lá**. A
tela passou a dizer isso, em vez de mandar esperar por um contrato que já existe.
Ver o §4.1: é decisão sua.

### 🟡 2.5 · Cadastrar usina não tinha tela

A leitura do outro sistema **não cria usina** — está escrito no código: ela
mantém fresca a que já existe aqui. Uma usina nova, portanto, faz **todas as
unidades dela** serem recusadas, uma a uma, a cada quinze minutos, com a
mensagem «cadastre a usina e o próximo ciclo espelha o resto». O único caminho
era o terminal.

**Agora:** formulário na aba Usinas — código da geradora, distribuidora, apelido
e potência.

### 🟡 2.6 · Encerrar e suspender contrato não tinham tela

Cliente que sai, contrato assinado errado e troca do tipo de quem trouxe o
cliente **exigem encerrar**. A própria tela mandava fazer isso por escrito
(*"trocar depois exige encerrar e refazer o contrato"*) e não oferecia o caminho.
Sem ele, a unidade seguiria sendo faturada todo mês.

**Agora:** cada contrato vigente tem «Suspender», «Reativar» e «Encerrar», com a
diferença explicada onde ela importa: suspender mantém a unidade ocupada,
encerrar libera para um contrato novo.

### 🟡 2.7 · A tarifa da distribuidora não tinha onde ser digitada

A aba de emissão **avisa** que há rascunhos sem a tarifa da distribuidora e diz
que assim eles sairiam cobrando só o crédito injetado. O conserto era um comando
em lote. E o modo de falha é o pior: `valor_total_centavos` é coluna gerada, a
parcela ausente vale zero, e **a fatura sai menor sem erro, sem log e sem
recusa**.

**Agora:** campo na própria fatura, enquanto ela é rascunho. No caminho oficial
(a conta lida na aba Fatura unificada) o valor continua vindo da conta, e
ninguém digita nada.

### 🛡️ 2.8 · A varredura virou regra

`web/tests/rotas-com-tela.ts` exige que **toda rota de escrita** tenha caminho de
tela ou uma **exceção com motivo escrito**. As 15 exceções de hoje estão
nomeadas uma a uma (webhook do banco, ciclo de vida que é do outro sistema,
classificação opcional que nenhum relatório lê…), e a suíte recusa motivo curto
demais — pegou quatro «mesmo motivo do de cima» na primeira execução.

**Varredura manual acontece uma vez. Esta suíte acontece a cada push.**

---

## 3. 🔴 O que impede a PRIMEIRA fatura — e nada disso é código

Medido pela prontidão do próprio sistema, competência por competência:

| Camada | JUN/2026 | JUL/2026 | AGO/2026 | Efeito |
|---|:--:|:--:|:--:|---|
| Documento do cliente | ✅ 0/29 | ✅ | ✅ | bloqueia fatura |
| Contrato ativo | 1/29 | 1/29 | 1/29 | bloqueia fatura |
| Rateio | ✅ | ✅ | ✅ | bloqueia fatura |
| Geração da competência | 1/3 | ✅ **0/3** | 3/3 | bloqueia fatura |
| **Conta lida da competência** | **29/29** | **29/29** | **29/29** | **bloqueia fatura** |
| Endereço do pagador | 10/28 | 10/28 | 10/28 | bloqueia boleto |
| Dono da usina | 4/4 | 4/4 | 4/4 | bloqueia repasse |
| Emissor, repasse, comissão, banco | ✅ | ✅ | ✅ | — |

**JULHO/2026 é a competência mais perto de fechar, e falta uma coisa só: ler as
29 contas da distribuidora.** A geração de julho já está lançada.

Feito isso, o mês sai assim: **28 faturas** (1 contrato ainda pendente), das
quais **18 emitem boleto** e **10 esperam endereço**.

| # | O que falta | De quem |
|:--:|---|---|
| **1** | **As 29 contas da distribuidora de julho**, lidas na aba Fatura unificada | operação |
| **2** | Os **10 endereços** do pagador | operação |
| **3** | O **1 contrato** que falta ativar (o do tipo «Out Sales») | dono |

---

## 4. 🟠 O que quebra DEPOIS — no primeiro pagamento e no cadastro

### 4.1 · A unidade travada precisa de uma decisão sua

O caso do §2.4, com os nomes: a unidade **`000000100076075`** (CARLA GONZAGA —
PANIFICADORA PLAZZA) foi renumerada no CRM para **`000091762801211`**, mesmo
cliente, mesmo contrato (G3-0229). Aqui ela tem **0 faturas e 0 contratos** — ou
seja, **não há histórico a perder**, e é por isso que a decisão é barata agora e
cara depois.

As duas saídas, e as duas são operacionais:

- **corrigir no CRM** o que estiver errado lá, se o número novo é que está errado;
- **aceitar o número novo**: como esta unidade não tem contrato nem fatura, o
  caminho limpo é encerrar o que houver e deixar a leitura automática criar a
  unidade nova — ela já está tentando fazer isso a cada 15 minutos.

⚠️ Enquanto isso não for decidido, **a recusa continua** e essa unidade não entra
em faturamento nenhum.

### 4.2 · `dono_usina` está VAZIA, e 70% do dinheiro não tem destinatário

4 usinas, 4 sem dono, 0 donos cadastrados. **Não impede faturar nem emitir
boleto** — trava a divisão do dinheiro na **primeira fatura paga**. A tela de
baixa já avisa que isso vai acontecer, com todas as letras, mas o dinheiro fica
parado sem destino até alguém cadastrar.

### 4.3 · 29 apontamentos por rodada, e 27 são a mesma pessoa

A leitura do outro sistema acusa, a cada 15 minutos:

> *o contrato desta unidade está com o originador **"Renata Ferreira Estevam"** e
> o crédito congelado do CRM nomeia vendedor **"Renata"**.*

**27 das 29 divergências são isso** — o mesmo nome, escrito curto de um lado e
completo do outro. A comparação é por nome porque não existe chave forte para o
vendedor, e o código diz isso por escrito.

Não impede nada. **O custo é de atenção:** as duas divergências que restam (as do
«Out Sales») estão enterradas no meio de 27 alarmes falsos, e um painel que
aponta 29 coisas todo dia é um painel que se aprende a não abrir.

Três saídas, e a escolha é sua: **(a)** escrever o nome completo no CRM; **(b)**
usar aqui o mesmo nome curto do CRM; **(c)** criar um campo de «também chamado
de» no cadastro do originador — isso é código, e pequeno.

---

## 5. 🟡 Furos que sobram — com dono e severidade

| # | O quê | Severidade | De quem |
|:--:|---|---|---|
| 1 | **Não há backup declarado do banco.** Nenhum `pg_dump`, nenhuma rotina no repositório. O banco é gerenciado (Supabase) e provavelmente tem cópia automática — **provavelmente não é uma frase aceitável para o caixa da empresa**: confirme no painel qual é a política e há quanto tempo | 🔴 alta | dono |
| 2 | **O site não manda cabeçalho de segurança nenhum** — medido: sem HSTS, sem proteção contra a página ser embutida em outro site, sem bloqueio de adivinhação de tipo. São quatro linhas no nginx, e o comando pronto está no §8 | 🟠 média | dono aplica |
| 3 | **A trilha de auditoria não tem leitor.** 21.317 linhas gravadas, nenhuma tela mostra «quem mudou o quê». Hoje só se lê por dentro do banco | 🟡 baixa | implementador |
| 4 | **Nada envia a cobrança ao cliente.** Não há e-mail nem WhatsApp: a folha é impressa e enviada à mão, uma a uma. É desenho, e não defeito — mas com 29 clientes é o maior trabalho manual que sobra no mês | 🟠 média | dono decide |
| 5 | **O alerta espera alguém abrir a tela.** Os três canais de aviso são de *puxar*; o que *empurra* é e-mail, e depende de contratar serviço | 🟠 média | dono decide |
| 6 | **Compor pela Carteira ainda é oferecido**, e é o caminho legado: ele cria rascunho sem a tarifa da distribuidora e **tranca a unidade no caminho oficial**. O campo novo (§2.7) tapa o buraco; a pergunta de fundo é se o botão devia continuar ali | 🟡 baixa | dono decide |
| 7 | **Pagamentos de contas a pagar não são listados** — só o total pago de cada conta. «Quais pagamentos foram feitos e quando» não tem tela | 🟡 baixa | implementador |
| 8 | **`categoria` e `centro de custo` existem no banco e nenhuma tela os preenche.** Nenhum relatório depende deles hoje | ⚪ nenhuma | — |

---

## 6. O que a varredura NÃO achou, e vale dizer

Porque «não achei nada» só significa alguma coisa quando se diz onde se olhou:

- **nenhum segredo em código** — nem chave, nem senha, nem token literal;
- **nenhum erro no journal do serviço em 7 dias**, e nenhum 5xx recente no log do
  nginx (o único 502 é antigo, e o mesmo caminho responde 200 hoje);
- **dinheiro é inteiro em centavos em todo caminho medido** — nenhuma conta de
  valor passando por decimal quebrado;
- **as quatro rodadas automáticas estão ligadas e em dia** — a fila de 5 em 5
  minutos, a conferência diária, o ciclo de 15 minutos e a saúde da cobrança;
- **os cinco trabalhos do CI passam**, incluindo os que só rodam lá (isolamento
  entre empresas, políticas do banco, vazamento de pool).

---

## 7. O que continua exigindo alguém técnico — e não tem como não exigir

Repetido do plano de 09/09 porque continua exato:

1. **O Sicoob muda o contrato da API sem avisar** — três vezes em seis semanas;
2. **Falha de segurança em dependência** — não avisa e não espera;
3. **Coluna nova é migration**, e migration é código (aplicá-la já é botão);
4. **O certificado A1 vence em 17/08/2027**, com processo que muda todo ano.

A recomendação de negócio continua a mesma: **um contrato de manutenção pequeno,
reativo**, em vez de procurar alguém às pressas no dia em que a emissão parar.

---

## 8. A ordem que eu recomendo

| Ordem | O quê | Por quê |
|:--:|---|---|
| **1** | **Ler as 29 contas de julho** | É a única coisa entre hoje e a primeira fatura |
| **2** | **Confirmar a política de backup do banco** | É a única da lista que, se estiver errada, não tem conserto depois |
| **3** | **Cadastrar os 4 donos de usina** | Trava o repasse no primeiro pagamento, e o primeiro pagamento vem dias depois da primeira fatura |
| **4** | **Os 10 endereços** e **o contrato «Out Sales»** | Levam o mês de 18 para 29 boletos |
| **5** | **Decidir a unidade renumerada** (§4.1) | Enquanto não decidir, ela fica fora de todo faturamento |
| **6** | **Aplicar os cabeçalhos do nginx** | Comando abaixo, uma vez, e some da lista |
| **7** | **Decidir sobre os 27 alarmes falsos** (§4.3) | Não urge, e cada dia treina mais a ignorar o painel |

### O comando do item 6, pronto

Dentro do `server { }` de `/etc/nginx/sites-available/zz-financeiro.blackhaus.io`:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

Depois: `nginx -t && systemctl reload nginx`.

---

**Fontes desta varredura:** as 124 rotas de `src/http/rotas.ts` cruzadas com
`web/src` · as 39 tabelas de `prisma/schema.prisma` cruzadas com quem as lê ·
`journalctl` dos quatro serviços (6 dias) · `/var/log/nginx/access.log` · o banco
de produção lido pelo próprio código, sem escrever · `QUESTOES.md` e
`PENDENCIAS.md`.
