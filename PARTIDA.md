# Partida — o que falta para a primeira fatura sair

Medido em **21/08/2026**, com o sistema no ar e o conector sincronizando sozinho.

O software está rodando. O que impede faturar **não é código**: são seis cadastros
vazios, e nenhum deles é derivável de nada que o sistema já tenha. Este arquivo é
a ordem em que preenchê-los, porque fechar um destrava o próximo.

> A mesma lista, sempre atual e com os números do mês, está na aba **Pendências** e
> dentro da **Ajuda** (o botão salva-vidas no alto da tela). Este arquivo existe
> para quem precisa planejar antes de abrir o sistema.

> **O processo inteiro, e não só a fila:** `PLANO-ciclo-do-cliente-2026-08-21.md`
> mapeia as **12 fases** do cliente — de receber a conta da distribuidora até repartir
> o dinheiro —, com o que foi medido em cada uma. Os seis cadastros abaixo são a
> **onda 1** dele, e valem igual seja qual for a decisão da `Q-CICLO-01`.

---

## 0. O bloqueio que trava todos os outros

**Não há ninguém cadastrado como “quem trouxe o cliente” (originador). Zero.**

Enquanto isso valer, **nenhum contrato pode ser criado** — o campo é obrigatório e
não é editável depois. E sem contrato ativo não existe fatura: a triagem recusa
por “sem contrato vigente”, que é a primeira da ordem.

Não há tela para esse cadastro. O caminho é um arquivo JSON:

```bash
cd /opt/financeiro/app && export PATH=/opt/financeiro/node/bin:$PATH
npm run --silent originadores -- --modelo > originadores.json
# preencha o arquivo, depois:
npm run originadores -- --ensaio  --auth-user <uuid> --arquivo originadores.json
npm run originadores -- --valendo --auth-user <uuid> --arquivo originadores.json
```

Cada pessoa precisa de **nome**, **documento** (CPF ou CNPJ reais — dígito errado
aborta o lote inteiro, de propósito) e **tipo**, que é decisão comercial e define
quanto ela recebe:

`vendedor_g3` · `terceirizado` · `parceiro_indicador` · `parceiro_captador` · `parceiro_captador_senior`

### ✅ 21/08/2026 — quem são e de que tipo, decidido

Medido no CRM pelo eixo canônico (o crédito congelado no ganho), restringindo às
**29 unidades que o financeiro fatura**: são **dois nomes**, não uma lista aberta.

| Originador | UCs faturáveis | Tipo | 1ª fatura | 2ª fatura |
|---|--:|---|--:|--:|
| **Renata** | 26 | `vendedor_g3` | 25% | 25% |
| **Out Sales** | 3 | `vendedor_g3` | 25% | 25% |

**O tipo foi decidido pelo dono em 21/08:** *"Renata e Out Sales são tipo
próprio"* — ou seja, equipe da casa, e não terceirizado nem parceiro. As dez
regras de comissão já estão cadastradas e vigentes; nenhuma precisa ser criada.

Kallina Tandara tem 4 créditos e **nenhum** com rateio ativado — fica fora por
ora, e entra quando (e se) alguma daquelas UCs for ativada.

### O que sobrou, e é **demanda de sequência** (decisão do dono, 21/08)

Não bloqueia a leitura da conta nem a geração de cobrança; bloqueia só o contrato.

1. **O CPF de Renata** e a natureza (`pf`).
2. **O documento de "Out Sales"** — e aqui há uma pergunta antes do número:
   *Out Sales é uma equipe, e equipe não tem CPF.* Ou existe um CNPJ por trás
   (natureza `pj`), ou existe uma pessoa que responde por esses 3 contratos.
   **Sem resolver isso, os 3 contratos do Out Sales não nascem** — os 26 da
   Renata nascem.
3. **Fica em aberto no fiscal, e não no cadastro:** Renata concentra 26 das 29 e
   é sócia. *Comissão a sócia é despesa dedutível ou distribuição de lucro?* é
   pergunta ao contador, já registrada, ainda sem resposta.

---

## 1. Confirmar o CPF/CNPJ dos clientes — faltam 11 de 29

18 já foram confirmados em 21/08. Dos 11 que faltam:

- **10 não têm anexo nenhum** no CRM — alguém precisa pedir o documento ao cliente;
- **1 é o G3-0092 (Perpétua)**, que tem anexos, mas todos citam uma UC diferente
  da que está no card. É preciso decidir qual UC é a correta antes.

**Antes de ligar para o cliente, procure pelo nome na aba Clientes:** uma pessoa
com duas unidades tem duas linhas, e o documento pode já estar na outra.

→ aba **Clientes**, filtro «Ainda não vale para o contrato».

## 2. Criar os contratos — 29 de 29

Depende do item 0 (originador) e do item 1 (documento confirmado) para cada cliente.

→ aba **Contratos**, formulário no topo. Ele já cria ativando.

## 3. Dia de vencimento — ~~29 de 29~~ **deixou de bloquear em 21/08**

Continua não existindo dia padrão, e continua não indo existir: o sistema prefere
recusar a cobrança a escolher uma data por você.

**O que mudou é que agora existe uma fonte que não é invenção do sistema.** Com o
caminho da fatura unificada, o vencimento vem impresso na conta da distribuidora
— é a data que o cliente já tem no papel, no ciclo de leitura dele. O dia
cadastrado aqui virou a **segunda** fonte, para as unidades cuja conta não traga a
data.

Preencher continua valendo a pena; deixou de ser bloqueio.

→ aba **Unidades consumidoras**, filtro «Sem vencimento».

## 4. Dono de cada usina — 4 de 4  ⬅️ **agora é o único que falta para repartir**

**Não há nenhum dono cadastrado**, e as 4 usinas estão sem vínculo. Não impede
cobrar; impede repartir o dinheiro quando ele entrar.

Com o percentual fechado em 21/08 (item 5), **este é o último cadastro entre o
dinheiro entrar e ele poder ser dividido** — as outras duas camadas que a
repartição exige (quem trouxe o cliente e a regra de comissão dele) só passam a
ser medidas quando existir contrato.

Cadastre a pessoa em **Donos de usina** (exige chave Pix ou conta completa —
conferido no cadastro, porque no pagamento já é tarde) e depois escolha-a na
linha da usina, em **Usinas**.

## 5. ~~Percentual de repasse — 4 de 4~~ ✅ **FEITO em 21/08/2026**

**A regra, dita pelo dono:** *"além dos valores destinados à Equatorial, que são
as tarifas mínimas, a divisão ocorre da seguinte maneira: 70% vai para o dono da
usina e 30% fica na G3 para pagar as contas"* — e *"os 70% valem desde
01/01/2026"*.

Gravado nas **4 de 4** usinas, com ensaio antes e conferência depois: a função
oficial que a repartição consulta devolve **70,00%** para a competência de junho.
A camada saiu de `pendente 4/4` para **`ok 0/4`**.

**Os 30% não são um campo, e isso é o desenho.** Eles são o que sobra depois de
todos os destinos, apurado por subtração — é assim que a soma fecha no centavo.
Guardar os dois números seria guardar a mesma informação duas vezes, e bastaria
alguém salvar 70 e 25 para o dinheiro deixar de fechar sem erro em lugar nenhum.
A tela **mostra** o complemento; só o primeiro viaja para o banco.

**Nas duas primeiras cobranças cheias de cada contrato sobram 5%, não 30%** — a
comissão de quem trouxe o cliente sai da mesma parte. É de propósito, e a tela diz.

→ aba **Usinas**, seção «Percentual de repasse, por vigência». Renegociar é abrir
uma vigência nova, que fecha a anterior — não há «editar», porque renegociar hoje
não muda o que já foi cobrado.

## 6. Conexão com o banco — 1 de 1

Sem ela a cobrança existe e pode ser paga por **Pix**, e um boleto emitido no site
do banco pode ser importado na aba Emissão e cobrança. O que falta é o sistema
emitir o boleto sozinho.

→ aba **Conector Sicoob**. O certificado e a senha **não** são digitados ali.

---

## O que já está rodando sozinho

| | |
|---|---|
| API e telas | `financeiro.service`, porta 3000 |
| Sincronia com o CRM | `financeiro-ciclo.timer`, **a cada 15 minutos** |
| Central de ajuda | em toda tela, lendo a prontidão ao vivo |

```bash
systemctl list-timers financeiro-ciclo.timer   # quando roda a próxima sincronia
journalctl -u financeiro-ciclo -n 40           # o relatório da última
systemctl list-units --failed                  # sincronia que falhou aparece aqui
```
