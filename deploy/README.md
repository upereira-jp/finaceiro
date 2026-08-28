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
| `financeiro-agenda-certificado.service` | lê o vencimento do A1 e classifica. **Não escreve nada** |
| `financeiro-agenda-certificado.timer` | dispara a conferência **uma vez por dia**, 06:07 UTC |

As três da agenda entraram em **28/08/2026**. O motor delas existe desde 30/07
(`Q-AGENDA-01`) e até essa data **nada o chamava** — o `PRD` §3 deixou a escolha
do host em aberto, e pela regra 10 quem implementa não escolhe por quem decide. O
dono escolheu: o host é este systemd.

O `financeiro.service` (API + SPA, porta 3000) ainda não foi trazido para cá — ele
está no ar desde 28/07 e mexer nele é outro assunto. O texto dele está em
`systemctl cat financeiro.service`.

## Instalar ou atualizar

```bash
sudo install -m 644 deploy/financeiro-*.service deploy/financeiro-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now financeiro-ciclo.timer
sudo systemctl enable --now financeiro-agenda-fila.timer
sudo systemctl enable --now financeiro-agenda-consulta.timer
sudo systemctl enable --now financeiro-agenda-certificado.timer
```

## Conferir

```bash
systemctl list-timers 'financeiro*'              # quando roda a próxima de cada uma
journalctl -u financeiro-ciclo -n 40             # o relatório da última
journalctl -u financeiro-agenda-fila -n 40       # idem, a fila de emissão
systemctl list-units --failed                    # o que falhou aparece aqui
```

## O código de saída 3, e por que ele não é `|| true`

As duas unidades que escrevem (`fila` e `consulta`) declaram `SuccessExitStatus=3`,
e **3 quer dizer uma coisa só**: *nenhum conector de cobrança ativo neste tenant*.
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

## Desligar

```bash
sudo systemctl disable --now financeiro-ciclo.timer
sudo systemctl disable --now financeiro-agenda-fila.timer
sudo systemctl disable --now financeiro-agenda-consulta.timer
sudo systemctl disable --now financeiro-agenda-certificado.timer
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

**Certificado: diária, 06:07 UTC**, dez minutos antes da consulta, para que a causa
apareça no journal antes do sintoma. Ela **não notifica ninguém** — o aviso cai no
journal, e escolher o canal é decisão com dono (regra 10).

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
