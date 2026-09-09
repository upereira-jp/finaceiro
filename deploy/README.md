# `deploy/` — o que roda nesta máquina, versionado

Até 21/08/2026 as unidades do systemd viviam **só** em `/etc/systemd/system/`, sem
rastro no repositório. Quem clonasse o projeto não tinha como saber que existiam,
e quem reinstalasse a máquina teria de reconstruí-las de memória.

Estes arquivos são a fonte; `/etc` é a cópia.

## As unidades

| Arquivo | O que é |
|---|---|
| `financeiro-ciclo.service` | roda **uma** passada do conector com o CRM |
| `financeiro-ciclo.timer` | dispara o serviço acima a cada 15 minutos |
| `financeiro-agenda-fila.service` | roda **uma** passada da fila de emissão de boleto (retentativa) |
| `financeiro-agenda-fila.timer` | dispara a fila a cada **5 minutos**, em `:02/5` |
| `financeiro-agenda-consulta.service` | roda **uma** consulta ativa da situação dos boletos |
| `financeiro-agenda-consulta.timer` | dispara a consulta **uma vez por dia**, 06:17 UTC |
| `financeiro-saude-cobranca.service` | confere se o caminho do dinheiro está de pé — o A1 **e** o aviso de pagamento. **Não escreve nada**, e é a única que **fica vermelha** |
| `financeiro-saude-cobranca.timer` | dispara a conferência **uma vez por dia**, 06:37 UTC |

As três da agenda entraram em **28/08/2026**. O motor delas existe desde 30/07
(`Q-AGENDA-01`) e até essa data **nada o chamava** — o `PRD` §3 deixou a escolha
do host em aberto, e pela regra 10 quem implementa não escolhe por quem decide. O
dono escolheu: o host é este systemd.

O `financeiro.service` (API + SPA, porta 3000) ainda não foi trazido para cá — ele
está no ar desde 28/07 e mexer nele é outro assunto. O texto dele está em
`systemctl cat financeiro.service`.

## Instalar ou atualizar

⚠️ **Caminho ABSOLUTO, e não `deploy/…`.** A sessão do terminal abre em
`/opt/financeiro`, e o repositório é `/opt/financeiro/**app**` — de lá o glob
`deploy/financeiro-*` não casa com nada e o `install` falha. Foi exatamente o que
aconteceu em 09/09/2026: o `disable` e o `rm` da unidade velha (que usam nome de
unit, não caminho) **passaram**, o `install` **não**, e a máquina ficou sem
conferência diária nenhuma — o pior estado intermediário possível.

```bash
sudo install -m 644 /opt/financeiro/app/deploy/financeiro-*.service \
                    /opt/financeiro/app/deploy/financeiro-*.timer \
                    /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now financeiro-ciclo.timer
sudo systemctl enable --now financeiro-agenda-fila.timer
sudo systemctl enable --now financeiro-agenda-consulta.timer
sudo systemctl enable --now financeiro-saude-cobranca.timer
```

**Ao atualizar a partir de 09/09/2026**, a `financeiro-agenda-certificado` foi
**substituída** pela `financeiro-saude-cobranca` — não é renomeação cosmética, é
outra unidade: aquela lia metade do problema e saía sempre 0, esta lê as duas
metades e **fica vermelha**. O `install` acima não apaga a antiga, então:

**Instale a nova ANTES de apagar a velha.** Na outra ordem, um `install` que falhe
deixa a máquina sem nenhuma das duas — e o sintoma é silêncio, que é o que estas
unidades existem para acabar.

```bash
sudo systemctl disable --now financeiro-agenda-certificado.timer
sudo rm -f /etc/systemd/system/financeiro-agenda-certificado.{service,timer}
sudo systemctl daemon-reload
sudo systemctl start financeiro-saude-cobranca.service   # a primeira leitura, agora
systemctl status financeiro-saude-cobranca.service
```

**A conferência que prova que deu certo**, e ela é uma linha — `list-timers` não
mente sobre unit que não existe:

```bash
systemctl list-timers 'financeiro*' --all | grep saude   # tem de aparecer
```

Sem o `disable`, as duas rodam: a velha continua caindo no journal às 06:07 sem
avisar ninguém, e quem ler o journal vai achar que é a nova.

## Conferir

```bash
systemctl list-timers 'financeiro*'              # quando roda a próxima de cada uma
journalctl -u financeiro-ciclo -n 40             # o relatório da última
journalctl -u financeiro-agenda-fila -n 40       # idem, a fila de emissão
systemctl list-units --failed                    # o que falhou aparece aqui
journalctl -u financeiro-saude-cobranca -n 40    # por que o caminho do dinheiro está vermelho
```

**A `financeiro-saude-cobranca` é a única unidade daqui que fica vermelha de
propósito**, e é o canal de alarme dos dois avisos da agenda — o A1 e o aviso de
pagamento. Ela não carrega dinheiro: a fila continua emitindo e a consulta
continua baixando com ela em `failed`. E ela **se apaga sozinha** — `failed` de
um `oneshot` dura até a próxima execução passar, então o dia em que o A1 for
renovado ou o webhook recadastrado a lista fica limpa sem ninguém digitar
`reset-failed`.

## O código de saída 3, e por que ele não é `|| true`

As duas que escrevem (`fila` e `consulta`) e a `saude-cobranca` declaram
`SuccessExitStatus=3`, e **3 quer dizer uma coisa só**: *nenhum conector de
cobrança ativo neste tenant*.
Enquanto o Sicoob não tiver aplicativo no portal, `client_id` e os três números da
cooperativa, `conector_cobranca.ativo` é `false` e a rodada recusa **antes** de
criar linha em `agenda_execucao` ou tocar em boleto.

Isso não é falha, e tratá-lo como falha teria custo: `list-units --failed` é a
única superfície de alarme desta máquina, e vermelho permanente é alarme
desligado. Um código próprio — e não um `|| true` no `ExecStart` — mantém o **1**
significando exatamente o que sempre significou, e a rodada continua imprimindo o
motivo no journal.

Quando o conector for ativado, as duas passam a trabalhar **sem tocar em unit nem
em timer**.

A `saude-cobranca` acrescenta **4** e **5** ao vocabulário, e esses dois **ficam
vermelhos**: 4 é *precisa de ação humana* (A1 vencido, vencendo ou sem data; o
banco desligou o aviso, ou nunca houve aviso) e 5 é *não deu para perguntar*. Os
dois estão fora do `SuccessExitStatus` de propósito — são exatamente o que se
quer ver na lista de falhas. A fronteira entre eles é a mesma que separa
`inativado` de `nao_verificavel`: **"está quebrado" não é "ninguém sabe"**.

## Desligar

```bash
sudo systemctl disable --now financeiro-ciclo.timer
sudo systemctl disable --now financeiro-agenda-fila.timer
sudo systemctl disable --now financeiro-agenda-consulta.timer
sudo systemctl disable --now financeiro-saude-cobranca.timer
```

O espelho para de se atualizar sozinho na hora, e **nada mais quebra** — as telas
seguem mostrando o último estado sincronizado. O sintoma é silencioso, e é
exatamente por isso que ele vale um aviso aqui: o número envelhece sem ninguém
notar, e a Central de Ajuda passa a responder com confiança um estado que já mudou.

## Por que 5 minutos na fila, e diária na consulta

**Fila: 5 minutos.** O número não é gosto — é a `base` da política de retentativa
(`Q-AGENDA-02`: 300 s). O intervalo do timer é a *granularidade* do retry, então um
timer de 15 minutos triplicaria calado uma base que já tinha dono e decisão. Em
`:02/5` e não em `:00/5` para não disputar o pool (teto 8) com o ciclo do CRM, que
roda em `:00`, `:15`, `:30` e `:45`.

**Consulta ativa: diária.** A palavra é do `PRD` §6, não escolha desta unidade. Às
06:17 UTC — madrugada em Goiás, antes de alguém abrir tela. Enquanto o `ADR-0006`
não for construído, **ela é a única porta automática de baixa**: o webhook existe
como rota e a Sicoob não consegue chamá-lo.

**Saúde do caminho do dinheiro: diária, 06:37 UTC**, vinte minutos **depois** da
consulta. A ordem é o inverso da que a `certificado` usava, e o motivo é que o
papel inverteu: aquela vinha antes para a *causa* aparecer no journal antes do
*sintoma*; esta afirma sobre o estado em que o dia terminou, e afirmação feita
antes do trabalho seria sobre ontem.

## Por que 15 minutos no ciclo do CRM

O ciclo lê 117 linhas em ~10 segundos (medido em 21/08). Faturamento não precisa
de frescor de segundos — precisa de não envelhecer um dia inteiro sem ninguém
notar. Para mudar, edite `OnCalendar` no `.timer` e reinstale.

## Por que há um uuid de pessoa dentro do `.service`

Não é credencial embutida e não é descuido: o conector **não tem caminho
privilegiado** (SPEC-002 R12). Ele entra pelo mesmo contexto de tenant de
qualquer pessoa, porque exceção de isolamento é ausência de isolamento. O uuid é
o `sub` do Supabase Auth do dono e, sozinho, não autentica nada.

Se essa pessoa deixar de existir no Auth, o ciclo passa a falhar — e falha
**visível**, no `systemctl list-units --failed`, não em silêncio.
