#!/usr/bin/env bash
#
# INSTALA O CLIENTE psql NO RUNNER, e e o UNICO lugar do repositorio que roda
# `apt-get update`.
#
# USO
#   bash .github/instalar-psql.sh        cliente psql de qualquer versao
#   bash .github/instalar-psql.sh 16     cliente 16, pelo repositorio pgdg
#
# Chamado com `bash`, e nao `./`: a interface web do GitHub nao preserva o bit de
# execucao, e este repo ja perdeu o bit duas vezes por isso (`isolamento.yml`).
#
# ============================================================================
# POR QUE ELE EXISTE, e a data importa.
#
# Em 09/09/2026 o push do `cf9164d` derrubou QUATRO dos cinco jobs do
# `isolamento`. Os quatro morreram no MESMO passo, antes de uma linha nossa
# rodar:
#
#     E: Failed to fetch https://dl.google.com/linux/chrome-stable/.../Packages.gz
#        Hash Sum mismatch
#     ##[error]Process completed with exit code 100
#
# O indice corrompido era o do GOOGLE CHROME. Nada neste projeto instala Chrome:
# a fonte vem na imagem do runner. E `apt-get update` sem argumento atualiza
# TODAS as fontes configuradas - entao qualquer terceiro com indice quebrado
# derrubava o nosso CI inteiro sem que uma linha nossa tivesse mudado.
#
# O `gh run rerun --failed` passou nos cinco, o que confirma que era transiente -
# e confirma tambem o pior: um vermelho que some sozinho no re-run ensina a
# proxima pessoa a re-rodar sem ler o log, e no dia em que o vermelho for de
# verdade ela vai re-rodar tambem.
#
# O QUE MUDA AQUI: o update passa a ser uma LISTA DE PERMISSAO. So sao
# atualizadas as fontes que a gente de fato usa - a do Ubuntu e, quando pedida, a
# do PostgreSQL. Uma fonte de terceiro quebrada deixa de poder derrubar o CI
# porque ela nao e nem consultada.
#
# POR QUE LISTA DE PERMISSAO E NAO `rm` DA FONTE DO CHROME: apagar a do Chrome
# resolveria HOJE. A proxima imagem do runner traz outra, e o modo de falha volta
# com nome diferente. Lista de negacao envelhece; lista de permissao nao.
#
# POR QUE UM SCRIPT E NAO SEIS BLOCOS IGUAIS: o `apt-get update` estava copiado
# em SEIS lugares de dois workflows (`isolamento` x4, `provisionar-cobranca` x1,
# mais a variante com pgdg). Consertar em seis lugares e, um dia, consertar em
# cinco.
# ============================================================================

set -euo pipefail

versao="${1:-}"

# ------------------------------------------------------------------ o pgdg
# So quando a versao e pedida. O repositorio do PostgreSQL e a unica forma de ter
# o cliente 16 exato, e ele nao vem na imagem do runner.
#
# `--yes` no gpg porque o script pode rodar duas vezes no mesmo runner: sem ele o
# `--dearmor` PERGUNTA se sobrescreve, e uma pergunta num passo nao-interativo
# trava ate o timeout do job.
if [ -n "$versao" ]; then
  sudo sh -c "echo \"deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main\" \
    > /etc/apt/sources.list.d/pgdg.list"
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | sudo gpg --dearmor --yes -o /etc/apt/trusted.gpg.d/pgdg.gpg
fi

# --------------------------------------------------- as fontes que sao nossas
# `Dir::Etc::sourceparts` passa a apontar para um diretorio com COPIA so do que
# usamos, e nao para o `/etc/apt/sources.list.d` inteiro da imagem.
#
# OS TRES NOMES ESTAO AQUI PORQUE O LUGAR DO UBUNTU MUDOU ENTRE VERSOES: no 22.04
# o arquivo do arquivo oficial e `/etc/apt/sources.list`; no 24.04 ele virou
# `sources.list.d/ubuntu.sources`, em deb822. Os dois caminhos entram, e o que
# nao existir simplesmente nao casa - `find` com `-exec ... +` nao executa nada
# quando nao ha o que casar.
#
# OS CURINGAS DE POSTGRESQL SAO PREVENCAO, E NAO CONSERTO DE ALGO MEDIDO - e vale
# dizer qual e o estado real, porque eu errei este palpite uma vez.
#
# Medido nos runs 34395903575 e 34396457501 (09/09/2026): em `sources.list.d` a
# imagem do runner tem `ubuntu.sources` e mais DUAS fontes de terceiro, so duas -
# `google-chrome.sources` e `microsoft-prod.list`. Nao ha fonte pgdg ali. Os tres
# jobs que pedem `postgresql-client` sem versao recebem `16.15-1.pgdg24.04+2` pelo
# proprio `/etc/apt/sources.list`, que ja esta na lista de permissao.
#
# Entao os curingas nao casam com nada HOJE. Ficam porque o dia em que a imagem
# mudar de layout e o dia em que ninguem vai estar olhando para isto, e padrao que
# nao casa com nada nao custa nada.
NOSSAS=/etc/apt/fontes-do-financeiro.d
sudo rm -rf "$NOSSAS"
sudo install -d -m 755 "$NOSSAS"
sudo find /etc/apt/sources.list.d -maxdepth 1 -type f \
  \( -name 'ubuntu.sources' -o -name 'ubuntu.list' \
     -o -name '*pgdg*' -o -name '*postgresql*' \) \
  -exec cp -t "$NOSSAS" {} +
sudo touch /etc/apt/sources.list

echo "fontes que serao atualizadas (e SO elas):"
ls -1 "$NOSSAS" | sed 's|^|  /etc/apt/fontes-do-financeiro.d/|'
echo "  /etc/apt/sources.list"

# E AS QUE FICARAM DE FORA, POR NOME. Sem esta lista, o mecanismo e invisivel no
# log: quem investigar um vermelho daqui a um ano ve o que entrou e nao ve que
# havia mais. E e aqui que o Google Chrome aparece - do lado certo.
echo "fontes de terceiro IGNORADAS (nao podem mais derrubar este job):"
comm -23 \
  <(find /etc/apt/sources.list.d -maxdepth 1 -type f -printf '%f\n' | sort) \
  <(ls -1 "$NOSSAS" | sort) | sed 's|^|  |'

# A GUARDA EXISTE PARA A FALHA NAO CHEGAR DISFARCADA. Se um dia a imagem do
# runner mudar de layout outra vez e a lista de permissao nao casar com nada, o
# sintoma seria um `install` com 404 tres linhas adiante - e a leitura obvia
# seria "o pacote sumiu", que e falsa. Aqui ela chega com o nome certo.
if [ -z "$(ls -A "$NOSSAS")" ] && [ ! -s /etc/apt/sources.list ]; then
  echo "::error::a lista de permissao de fontes apt ficou VAZIA. O layout de"
  echo "::error::/etc/apt da imagem do runner mudou: nem ubuntu.sources, nem"
  echo "::error::ubuntu.list, nem um /etc/apt/sources.list com conteudo."
  echo "::error::Ajuste os nomes em .github/instalar-psql.sh - nao e o pacote."
  exit 1
fi

# `APT::Get::List-Cleanup=0` para o apt NAO apagar os indices ja em cache das
# fontes que ficaram de fora. Sem ele, um update restrito limparia tudo o que nao
# esta na lista, e o proximo `apt-get install` de qualquer outra coisa no mesmo
# job ficaria sem indice nenhum - trocariamos uma fragilidade por outra.
sudo apt-get update -qq \
  -o Dir::Etc::sourcelist=/etc/apt/sources.list \
  -o Dir::Etc::sourceparts="$NOSSAS" \
  -o APT::Get::List-Cleanup=0

sudo apt-get install -y -qq "postgresql-client${versao:+-$versao}"

# O PASSO NAO TERMINA EM SILENCIO. `psql --version` diz que o cliente existe e
# QUAL e ele: um install que resolvesse para outra versao passaria verde aqui e
# quebraria no `\gset` do SQL, tres passos adiante, com outro nome.
psql --version
