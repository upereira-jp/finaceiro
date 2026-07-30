// TARIFA: preco por unidade, R$/kWh, versionado por vigencia.
//
// R22: tarifa NAO e dinheiro em centavos, e `numeric(12,6)`. Medido: truncar
// 1,187650 em centavos cobra R$ 2,90 a mais numa UC, num mes, sempre a mais. Por
// isso o campo aceita seis casas e viaja como STRING.
//
// R26: sem tarifa vigente na competencia, a composicao LEVANTA em vez de
// devolver zero - base de faturamento nula somaria como nada e coalesce como
// zero, e a fatura sairia errada sem erro nenhum.

import { useState } from 'react';
import { api, type Tarifa } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, Campo, Icone } from '../ui.tsx';
import { decimalTexto } from '../dinheiro.ts';

export function TelaTarifas() {
  const [dist, setDist] = useState('Equatorial');
  const lista = useDados<Tarifa[]>(() => api.get(`/tarifas/${encodeURIComponent(dist)}`), [dist]);
  const acao = useAcao();
  const [valor, setValor] = useState('1,130000');
  const [inicio, setInicio] = useState('2026-01-01');

  async function abrir() {
    const ok = await acao.executar(() => api.post('/tarifas', {
      distribuidora: dist, tarifa_reais_por_kwh: decimalTexto(valor, 6), vigencia_inicio: inicio,
    }));
    if (ok) { acao.anunciar('Vigência aberta.'); lista.recarregar(); }
  }

  return (
    <Pagina titulo="Tarifas"
            sub="R$/kWh por distribuidora, versionado por vigência. É preço por unidade, não dinheiro — nunca vira centavos.">
      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="campos">
          <Campo rotulo="Distribuidora" valor={dist} ao={setDist} />
          <Campo rotulo="R$/kWh" valor={valor} ao={setValor} dica="Até 6 casas — ex. 1,130000" />
          <Campo rotulo="Vigência a partir de" valor={inicio} ao={setInicio} tipo="date" />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={abrir} disabled={acao.ocupado || !dist.trim()}>
              <Icone nome="tarifas" tamanho={15} peso="bold" /> Abrir vigência
            </button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {lista.erro && <Aviso tipo="erro">{lista.erro}</Aviso>}
      <Tabela cabecalho={<><th>R$/kWh</th><th>Início</th><th>Fim</th></>}
              vazio="Sem tarifa cadastrada — a composição da fatura levanta (R26).">
        {(lista.dado ?? []).map((t) => (
          <tr key={t.id}>
            <td className="num">{t.tarifa_reais_por_kwh}</td>
            <td className="fraco">{String(t.vigencia_inicio).slice(0, 10)}</td>
            <td className="fraco">{t.vigencia_fim ? String(t.vigencia_fim).slice(0, 10) : 'Em aberto'}</td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
