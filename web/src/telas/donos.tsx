// DONOS DE USINA — para quem vai o repasse, 70% do consumo.
//
// AUD-08: nulo em 3 de 3 usinas em producao. Nao impede faturar (a cobranca ao
// cliente nao depende disso), mas a R12 bloqueia o SPLIT inteiro quando a fatura
// for paga - e ai o repasse acumula sem destino. E por isso a tela existe antes
// da primeira liquidacao, e nao depois.

import { useState } from 'react';
import { api, type DonoUsina, type Usina } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Campo, Busca, Ferramentas, Filtro, ThOrd, Marca, Icone,
  useOrdenacao, ordenar, contem,
} from '../ui.tsx';

export function TelaDonos() {
  const donos = useDados<DonoUsina[]>(() => api.get('/donos-usina'));
  const semDono = useDados<Usina[]>(() => api.get('/usinas-sem-dono'));
  const acao = useAcao();
  const [f, setF] = useState({ nome: '', natureza: 'pf', documento_bruto: '', chave_pix: '', email: '' });
  const p = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const { ordem, alternar } = useOrdenacao('nome');

  const todos = donos.dado ?? [];
  const visiveis = ordenar(
    todos.filter((d) =>
      (contem(d.nome, busca) || contem(d.documento, busca) || contem(d.chave_pix, busca)) &&
      (!situacao || (situacao === 'ativo') === d.ativo)),
    ordem,
    {
      nome: (d) => d.nome,
      documento: (d) => d.documento,
      pix: (d) => d.chave_pix ?? d.banco,
      situacao: (d) => (d.ativo ? 0 : 1),
    },
  );

  async function criar() {
    const ok = await acao.executar(() => api.post('/donos-usina', {
      nome: f.nome.trim(), natureza: f.natureza, documento_bruto: f.documento_bruto.trim(),
      chave_pix: f.chave_pix.trim() || null, email: f.email.trim() || null,
    }));
    if (ok) {
      setF({ nome: '', natureza: 'pf', documento_bruto: '', chave_pix: '', email: '' });
      acao.anunciar('Dono cadastrado — agora vincule-o à usina na tela Usinas.');
      donos.recarregar(); semDono.recarregar();
    }
  }

  return (
    <Pagina titulo="Donos de usina"
            sub="O maior fluxo de dinheiro do sistema. Exige chave Pix ou conta completa — conferido no cadastro, porque no pagamento já é tarde.">
      {(semDono.dado?.length ?? 0) > 0 && (
        <Aviso tipo="erro">
          {semDono.dado!.length} usina(s) sem dono: {semDono.dado!.map((u) => u.codigo_geradora).join(', ')}.
          O repasse delas fica bloqueado pela R12 quando a primeira fatura for paga.
        </Aviso>
      )}

      <div className="cartao secao">
        <div className="campos">
          <Campo rotulo="Nome" valor={f.nome} ao={p('nome')} />
          <Campo rotulo="Natureza" valor={f.natureza} ao={p('natureza')}
                 opcoes={[{ valor: 'pf', texto: 'Pessoa física' }, { valor: 'pj', texto: 'Pessoa jurídica' }]} />
          <Campo rotulo="Documento" valor={f.documento_bruto} ao={p('documento_bruto')} dica="CPF ou CNPJ" />
          <Campo rotulo="Chave Pix" valor={f.chave_pix} ao={p('chave_pix')} />
          <Campo rotulo="E-mail" valor={f.email} ao={p('email')} />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={criar}
                    disabled={acao.ocupado || !f.nome.trim() || !f.documento_bruto.trim()}>
              <Icone nome="acrescentar" tamanho={15} peso="bold" /> Cadastrar
            </button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {donos.erro && <Aviso tipo="erro">{donos.erro}</Aviso>}

      <Ferramentas contagem={todos.length ? `${visiveis.length} de ${todos.length}` : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por nome, documento ou Pix…" />
        <Filtro valor={situacao} ao={setSituacao} rotulo="Filtrar por situação"
                opcoes={[{ valor: '', texto: 'Todas as situações' },
                         { valor: 'ativo', texto: 'Ativos' },
                         { valor: 'inativo', texto: 'Inativos' }]} />
        {(busca || situacao) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); }}>
            <Icone nome="limpar" tamanho={15} /> Limpar filtros
          </button>
        )}
      </Ferramentas>

      <Tabela cabecalho={<>
                <ThOrd chave="nome" ordem={ordem} ao={alternar}>Nome</ThOrd>
                <ThOrd chave="documento" ordem={ordem} ao={alternar}>Documento</ThOrd>
                <ThOrd chave="pix" ordem={ordem} ao={alternar}>Pix</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
              </>}
              vazio={todos.length
                ? 'Nenhum dono corresponde à busca ou aos filtros.'
                : 'Nenhum dono cadastrado — AUD-08.'}>
        {visiveis.map((d) => (
          <tr key={d.id}>
            <td>{d.nome} <span className="fraco">· {d.natureza.toUpperCase()}</span></td>
            <td className="fraco">{d.documento}</td>
            <td className="fraco">{d.chave_pix ?? d.banco ?? '—'}</td>
            <td><Marca tom={d.ativo ? 'ok' : 'pendente'}>{d.ativo ? 'Ativo' : 'Inativo'}</Marca></td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
