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

O `financeiro.service` (API + SPA, porta 3000) ainda não foi trazido para cá — ele
está no ar desde 28/07 e mexer nele é outro assunto. O texto dele está em
`systemctl cat financeiro.service`.

## Instalar ou atualizar

```bash
sudo install -m 644 deploy/financeiro-ciclo.service /etc/systemd/system/
sudo install -m 644 deploy/financeiro-ciclo.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now financeiro-ciclo.timer
```

## Conferir

```bash
systemctl list-timers financeiro-ciclo.timer     # quando roda a próxima
journalctl -u financeiro-ciclo -n 40             # o relatório da última
systemctl list-units --failed                    # ciclo que falhou aparece aqui
```

## Desligar

```bash
sudo systemctl disable --now financeiro-ciclo.timer
```

O espelho para de se atualizar sozinho na hora, e **nada mais quebra** — as telas
seguem mostrando o último estado sincronizado. O sintoma é silencioso, e é
exatamente por isso que ele vale um aviso aqui: o número envelhece sem ninguém
notar, e a Central de Ajuda passa a responder com confiança um estado que já mudou.

## Por que 15 minutos

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
