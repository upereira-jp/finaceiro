// USINAS: vincular o dono e abrir a vigencia de repasse.
//
// A REGRA DE REPASSE E VERSIONADA POR VIGENCIA, nunca editada no lugar (R25).
// Renegociar 70% para 65% hoje NAO reprecifica repasse ja pago - por isso a tela
// nao tem "editar percentual", so "abrir nova vigencia", e a anterior fecha na
// mesma transacao.

import { useState } from 'react';
import { api, type Usina, type DonoUsina, type RegraRepasse } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Campo, Busca, Ferramentas, Filtro, ThOrd, Marca, Escolha, Icone,
  useOrdenacao, ordenar, contem, rotulo,
} from '../ui.tsx';
import { decimalTexto } from '../dinheiro.ts';
import { FILTROS_DA_TELA, filtroDaConsulta } from '../destino-da-camada.ts';

export function TelaUsinas() {
  const usinas = useDados<Usina[]>(() => api.get('/usinas'));
  const donos = useDados<DonoUsina[]>(() => api.get('/donos-usina?ativo=true'));
  const acao = useAcao();
  const [sel, setSel] = useState('');
  const [pct, setPct] = useState('70,00');
  const [inicio, setInicio] = useState('2026-01-01');

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  /* `/usinas?pendencia=sem_dono` chega da camada `dono_da_usina` da prontidao e
   * abre a lista ja recortada nas que travam o repasse. O vocabulario do
   * ENDERECO e o das camadas (`sem_dono`); o do filtro e o desta tela
   * (`com`/`sem`), e a traducao fica aqui — trocar os valores do `<select>` para
   * casar com o link mudaria a tela por causa de quem aponta para ela. Lido so
   * na montagem, como na aba Unidades. */
  const [comDono, setComDono] = useState(
    () => (filtroDaConsulta(location.search, FILTROS_DA_TELA['/usinas']) === 'sem_dono' ? 'sem' : ''));
  const { ordem, alternar } = useOrdenacao('codigo');

  const repasses = useDados<RegraRepasse[]>(
    () => (sel ? api.get(`/usinas/${sel}/repasse`) : Promise.resolve([])), [sel]);

  const nomeDono = (id: string | null) => donos.dado?.find((d) => d.id === id)?.nome ?? null;

  const todas = usinas.dado ?? [];
  const visiveis = ordenar(
    todas.filter((u) =>
      (contem(u.codigo_geradora, busca) || contem(u.apelido, busca) || contem(u.distribuidora, busca)) &&
      (!situacao || u.status === situacao) &&
      (!comDono || (comDono === 'com') === Boolean(u.dono_usina_id))),
    ordem,
    {
      codigo: (u) => u.codigo_geradora,
      distribuidora: (u) => u.distribuidora,
      dono: (u) => nomeDono(u.dono_usina_id),
      situacao: (u) => u.status,
    },
  );

  async function vincular(usinaId: string, donoId: string) {
    const ok = await acao.executar(() => api.patch(`/usinas/${usinaId}`, { dono_usina_id: donoId || null }));
    if (ok) { acao.anunciar('Dono vinculado.'); usinas.recarregar(); }
  }

  async function abrirVigencia() {
    if (!sel) return;
    const ok = await acao.executar(() =>
      api.post(`/usinas/${sel}/repasse`, { percentual: decimalTexto(pct, 2), vigencia_inicio: inicio }));
    if (ok) { acao.anunciar('Vigência aberta — a anterior foi fechada na mesma transação.'); repasses.recarregar(); }
  }

  return (
    <Pagina titulo="Usinas"
            sub="Espelhadas do CRM. O dono e o percentual de repasse são locais — e os dois travam o split se faltarem.">
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      {usinas.erro && <Aviso tipo="erro">{usinas.erro}</Aviso>}

      <Ferramentas contagem={todas.length ? `${visiveis.length} de ${todas.length}` : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por código, apelido ou distribuidora…" />
        <Filtro valor={situacao} ao={setSituacao} rotulo="Filtrar por situação"
                opcoes={[{ valor: '', texto: 'Todas as situações' },
                         { valor: 'ativa', texto: 'Ativas' },
                         { valor: 'inativa', texto: 'Inativas' }]} />
        <Filtro valor={comDono} ao={setComDono} rotulo="Filtrar por dono"
                opcoes={[{ valor: '', texto: 'Com e sem dono' },
                         { valor: 'com', texto: 'Com dono' },
                         { valor: 'sem', texto: 'Sem dono (bloqueia o repasse)' }]} />
        {(busca || situacao || comDono) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); setComDono(''); }}>
            <Icone nome="limpar" tamanho={15} /> Limpar filtros
          </button>
        )}
      </Ferramentas>

      <Tabela cabecalho={<>
                <ThOrd chave="codigo" ordem={ordem} ao={alternar}>Código</ThOrd>
                <ThOrd chave="distribuidora" ordem={ordem} ao={alternar}>Distribuidora</ThOrd>
                <ThOrd chave="dono" ordem={ordem} ao={alternar}>Dono</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
              </>}
              vazio={todas.length ? 'Nenhuma usina corresponde à busca ou aos filtros.' : 'Nenhuma usina espelhada.'}>
        {visiveis.map((u) => (
          <tr key={u.id}>
            <td><strong>{u.codigo_geradora}</strong> {u.apelido && <span className="fraco">· {u.apelido}</span>}</td>
            <td className="fraco">{u.distribuidora}</td>
            {/* O vinculo do dono grava NO CHANGE, sem botao de confirmar: e uma
                escolha de lista, nao um valor digitado, e nao ha estado
                intermediario para conferir. Por isso ele NAO usa a classe
                `inline` — um select que parece texto esconderia que ele
                escreve no banco ao mudar. */}
            <td style={{ minWidth: 230 }}>
              <Escolha valor={u.dono_usina_id ?? ''} ao={(v) => void vincular(u.id, v)}
                       desabilitado={acao.ocupado}
                       rotuloAcessivel={`Dono da usina ${u.codigo_geradora}`}
                       primeira="— Sem dono (bloqueia o repasse)"
                       opcoes={(donos.dado ?? []).map((d) => ({ valor: d.id, texto: d.nome }))} />
            </td>
            <td><Marca tom={u.status === 'ativa' ? 'ok' : 'pendente'}>{rotulo(u.status)}</Marca></td>
          </tr>
        ))}
      </Tabela>

      <h2>Percentual de repasse, por vigência</h2>
      <div className="cartao">
        <div className="campos">
          <Campo rotulo="Usina" valor={sel} ao={setSel}
                 opcoes={todas.map((u) => ({ valor: u.id, texto: u.codigo_geradora }))} />
          <Campo rotulo="Percentual" valor={pct} ao={setPct} dica="Ex. 70,00" />
          <Campo rotulo="Vigência a partir de" valor={inicio} ao={setInicio} tipo="date" />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={abrirVigencia} disabled={acao.ocupado || !sel}>
              <Icone nome="vigencia" tamanho={15} peso="bold" /> Abrir vigência
            </button>
          </div>
        </div>
        <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
          O percentual aplicado é o vigente <strong>na competência da fatura</strong>, não o corrente da usina (R25).
          Não há “editar”: abrir uma vigência nova fecha a anterior na mesma transação.
        </p>
      </div>

      {sel && (
        <Tabela cabecalho={<><th>Percentual</th><th>Início</th><th>Fim</th></>}
                vazio="Sem regra de repasse — o split levanta.">
          {(repasses.dado ?? []).map((r) => (
            <tr key={r.id}>
              <td className="num">{r.percentual}%</td>
              <td className="fraco">{String(r.vigencia_inicio).slice(0, 10)}</td>
              <td className="fraco">{r.vigencia_fim ? String(r.vigencia_fim).slice(0, 10) : 'Em aberto'}</td>
            </tr>
          ))}
        </Tabela>
      )}
    </Pagina>
  );
}
