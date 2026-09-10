// O VÍNCULO COM O OUTRO SISTEMA, na parte que DESENHA — tudo por propriedade.
//
// Ele mora no painel que já abre na linha da unidade, embaixo do endereço do
// pagador, e não numa coluna nova: a tabela já tem oito colunas, e a pergunta
// «este vínculo está travado?» não é de toda linha todo dia — é da linha que o
// aviso de Pendências nomeou.
//
// A LEITURA É SOB DEMANDA, e isso é desenho e não economia: esta é a única parte
// do sistema que lê o OUTRO banco a partir de uma tela. Quem nunca abrir uma
// linha nunca faz o servidor abrir conexão com ele — ver `crm/pool-de-leitura.ts`.

import { Aviso, DetalheTecnico, Icone, Carregando } from './ui.tsx';
import { fraseDoVinculo, type VinculoNaTela } from './vinculo-do-crm.ts';

export type CorpoDoVinculo = {
  /** `null` enquanto a leitura não voltou. */
  dados: VinculoNaTela | null;
  carregando?: boolean;
  erro?: string | null;
  /** Ausente quando a ação não faz sentido (montagem de teste); aí o botão não é
   *  desenhado, em vez de existir sem efeito. */
  destravar?: () => void;
  ocupado?: boolean;
};

export function PainelDoVinculo({ dados, carregando, erro, destravar, ocupado }: CorpoDoVinculo) {
  if (carregando) return <Carregando texto="Conferindo o vínculo no outro sistema…" />;

  if (erro) {
    return (
      <Aviso tipo="alerta">
        <strong>Não foi possível conferir o vínculo desta unidade.</strong>{' '}
        Isso não quer dizer que ele está errado — quer dizer que ninguém sabe agora. O motivo
        foi: {erro}
      </Aviso>
    );
  }
  if (!dados) return null;

  const f = fraseDoVinculo(dados);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <h4 style={{ margin: 0 }}>
        <Icone nome={f.travada ? 'pendente' : 'ok'} tamanho={15} peso="bold" />{' '}
        Vínculo com o outro sistema
      </h4>
      <div style={{ lineHeight: 1.55 }}>
        <strong>{f.titulo}</strong> <span className="fraco">{f.corpo}</span>
      </div>

      {f.oQueOBotaoFaz && (
        <p className="sub" style={{ margin: 0 }}>{f.oQueOBotaoFaz}</p>
      )}

      {f.podeDestravar && destravar && (
        <div>
          <button className="primario" onClick={destravar} disabled={ocupado}>
            <Icone nome="confirmar" tamanho={15} peso="bold" /> Soltar o vínculo velho
          </button>
        </div>
      )}

      {/* O MOTIVO TÉCNICO INTEIRO, atrás do clique. A frase de cima é a de quem
          opera; esta é a de quem lê o registro — e as duas precisam existir,
          porque o identificador do contrato é o que casa esta tela com a linha do
          aviso em Pendências. */}
      <DetalheTecnico>
        <p style={{ margin: 0 }}>
          Unidade <code>{dados.numero_uc}</code> · contrato no espelho{' '}
          <code>{dados.contrato_no_espelho ?? '(nenhum)'}</code>.
          {dados.crm_por_contrato && (
            <> No outro sistema esse contrato serve <code>{dados.crm_por_contrato.uc}</code>{' '}
              ({dados.crm_por_contrato.lead_codigo}).</>
          )}
          {dados.crm_por_uc && (
            <> Esta unidade é servida por <code>{dados.crm_por_uc.contrato_id}</code>{' '}
              ({dados.crm_por_uc.lead_codigo}).</>
          )}
          {!dados.decisao.pode && <> Guarda {dados.decisao.guarda}: {dados.decisao.motivo}</>}
        </p>
      </DetalheTecnico>
    </div>
  );
}
