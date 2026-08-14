// OS DESENHOS. Um nome semântico de `iconografia.ts` -> um ícone do Phosphor.
//
// A BIBLIOTECA É UMA DEPENDÊNCIA NOVA, e num projeto que escreveu o próprio
// roteador em 30 linhas isso pede justificativa. Ela tem duas, e nenhuma é
// conveniência:
//
//   1. O DONO PEDIU PHOSPHOR, nominalmente. Desenhar aproximações à mão daria
//      ícones que se PARECEM com Phosphor e não são — o pior dos dois mundos:
//      o trabalho de manter desenho próprio sem a consistência da família.
//   2. ELA NÃO ENTRA INTEIRA. `sideEffects: false` no pacote e import profundo
//      por ícone (`@phosphor-icons/react/Gear`) — o bundle leva os ~50 desenhos
//      que este arquivo nomeia, não os 3.024 que o pacote tem. Medido no build,
//      não suposto: ver a nota de tamanho no fim.
//
// O IMPORT PROFUNDO É OBRIGATÓRIO, não estilo. `from '@phosphor-icons/react'`
// funciona e tree-shaka no build de produção, mas faz o Vite processar o barril
// de 3.024 módulos a cada arranque de `npm run web:dev`. O caminho por ícone
// custa uma linha e evita isso.
//
// NENHUMA TELA IMPORTA DESTE ARQUIVO UM COMPONENTE DO PHOSPHOR. As telas usam
// `<Icone nome="..." />`, e o nome vem da união fechada. É o que faz "trocar o
// desenho de `confirmar`" ser uma linha aqui em vez de uma varredura.

import type { Icon, IconWeight } from '@phosphor-icons/react';
import { ListChecks } from '@phosphor-icons/react/ListChecks';
import { UsersFour } from '@phosphor-icons/react/UsersFour';
import { Lightning } from '@phosphor-icons/react/Lightning';
import { Signature } from '@phosphor-icons/react/Signature';
import { SolarPanel } from '@phosphor-icons/react/SolarPanel';
import { Handshake } from '@phosphor-icons/react/Handshake';
import { Tag } from '@phosphor-icons/react/Tag';
import { Wallet } from '@phosphor-icons/react/Wallet';
import { Receipt } from '@phosphor-icons/react/Receipt';
import { Bank } from '@phosphor-icons/react/Bank';
import { FileText } from '@phosphor-icons/react/FileText';
import { ChartLineUp } from '@phosphor-icons/react/ChartLineUp';
import { Check } from '@phosphor-icons/react/Check';
import { X } from '@phosphor-icons/react/X';
import { Question } from '@phosphor-icons/react/Question';
import { WarningOctagon } from '@phosphor-icons/react/WarningOctagon';
import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { Warning } from '@phosphor-icons/react/Warning';
import { Checks } from '@phosphor-icons/react/Checks';
import { HandCoins } from '@phosphor-icons/react/HandCoins';
import { CurrencyCircleDollar } from '@phosphor-icons/react/CurrencyCircleDollar';
import { ArrowCircleDown } from '@phosphor-icons/react/ArrowCircleDown';
import { Clock } from '@phosphor-icons/react/Clock';
import { WarningCircle } from '@phosphor-icons/react/WarningCircle';
import { XCircle } from '@phosphor-icons/react/XCircle';
import { MagnifyingGlass } from '@phosphor-icons/react/MagnifyingGlass';
import { CalendarBlank } from '@phosphor-icons/react/CalendarBlank';
import { Broom } from '@phosphor-icons/react/Broom';
import { DownloadSimple } from '@phosphor-icons/react/DownloadSimple';
import { Printer } from '@phosphor-icons/react/Printer';
import { Copy } from '@phosphor-icons/react/Copy';
import { ArrowUp } from '@phosphor-icons/react/ArrowUp';
import { ArrowDown } from '@phosphor-icons/react/ArrowDown';
import { Trash } from '@phosphor-icons/react/Trash';
import { UploadSimple } from '@phosphor-icons/react/UploadSimple';
import { Plus } from '@phosphor-icons/react/Plus';
import { PaperPlaneTilt } from '@phosphor-icons/react/PaperPlaneTilt';
import { ArrowsClockwise } from '@phosphor-icons/react/ArrowsClockwise';
import { CaretUp } from '@phosphor-icons/react/CaretUp';
import { CaretDown } from '@phosphor-icons/react/CaretDown';
import { CaretUpDown } from '@phosphor-icons/react/CaretUpDown';
import { Buildings } from '@phosphor-icons/react/Buildings';
import { UserCircle } from '@phosphor-icons/react/UserCircle';
import { SignOut } from '@phosphor-icons/react/SignOut';
import { Sun } from '@phosphor-icons/react/Sun';
import { Moon } from '@phosphor-icons/react/Moon';
import { Desktop } from '@phosphor-icons/react/Desktop';
import { Barcode } from '@phosphor-icons/react/Barcode';
import { QrCode } from '@phosphor-icons/react/QrCode';
import { Certificate } from '@phosphor-icons/react/Certificate';
import { SpinnerGap } from '@phosphor-icons/react/SpinnerGap';
import { Gear } from '@phosphor-icons/react/Gear';

import type { NomeDeIcone } from './iconografia.ts';

/**
 * O MAPA, e ele é `Record` exaustivo de propósito: acrescentar um nome em
 * `iconografia.ts` sem desenho aqui **não compila**. É a mesma forma de garantia
 * que a migration 19 usa para os campos do documento (enum no banco em vez de
 * lista no código) — o mecanismo recusa, ninguém precisa lembrar.
 *
 * ALGUNS DESENHOS APARECEM DUAS VEZES, e é escolha e não descuido:
 * `aviso_ok` e `confirmar` são o mesmo `CheckCircle` porque significam a mesma
 * coisa em contextos diferentes — "deu certo" e "grave isto". Dois desenhos para
 * um significado é o que confunde; um desenho para dois usos coerentes, não.
 */
const DESENHO: Record<NomeDeIcone, Icon> = {
  // as doze telas
  prontidao: ListChecks,
  clientes: UsersFour,
  unidades: Lightning,
  contratos: Signature,
  usinas: SolarPanel,
  donos: Handshake,
  /* Era `tarifas`, e o nome ficou orfao quando a aba saiu em 14/08 (a tarifa
   * virou coluna da UC, migration 30). O DESENHO continua em uso, e nao pela
   * tarifa: e o botao "Abrir vigencia" do repasse, na tela de Usinas. Renomeado
   * para o que ele significa - um nome de icone que aponta para uma tela que nao
   * existe mais e o comeco de alguem procurar a tela. */
  vigencia: Tag,
  carteira: Wallet,
  faturas: Receipt,
  cobranca: Bank,
  documento: FileText,
  relatorios: ChartLineUp,
  /* A MAO QUE ENTREGA DINHEIRO, e a escolha e por CONTRASTE com `carteira`
   * (Wallet, o dinheiro que ENTRA) e com `faturas` (Receipt, o titulo que se
   * emite). Contas a pagar e a unica tela em que o dinheiro SAI.
   *
   * E O MESMO DESENHO DE `pode_repartir`, de proposito e nao por descuido: a
   * metrica "pode repartir" e a promessa de que o dinheiro vai SAIR para o dono
   * da usina, e esta tela e onde ele sai. Dois nomes semanticos podem partilhar
   * um desenho; o que a iconografia proibe e o contrario - uma tela escolher
   * desenho. */
  contas_a_pagar: HandCoins,

  // os três estados da prontidão — glifo nu, porque a pílula já é a moldura
  ok: Check,
  pendente: X,
  nao_medido: Question,

  // os três avisos — octógono é PARADA, triângulo é atenção
  aviso_erro: WarningOctagon,
  aviso_ok: CheckCircle,
  aviso_alerta: Warning,

  // as métricas
  pode_faturar: Checks,
  pode_repartir: HandCoins,
  faturado: CurrencyCircleDollar,
  recebido: ArrowCircleDown,
  a_receber: Clock,
  vencidas: WarningCircle,
  sim: CheckCircle,
  nao: XCircle,

  // ações
  buscar: MagnifyingGlass,
  calendario: CalendarBlank,
  confirmar: CheckCircle,
  limpar: Broom,
  baixar: DownloadSimple,
  imprimir: Printer,
  copiar: Copy,
  subir: ArrowUp,
  descer: ArrowDown,
  remover: Trash,
  enviar: UploadSimple,
  acrescentar: Plus,
  emitir: PaperPlaneTilt,
  recarregar: ArrowsClockwise,

  // ordenação
  ordem_crescente: CaretUp,
  ordem_decrescente: CaretDown,
  ordem_nenhuma: CaretUpDown,

  // a barra do topo
  empresa: Buildings,
  usuario: UserCircle,
  sair: SignOut,
  tema_claro: Sun,
  tema_escuro: Moon,
  tema_sistema: Desktop,
  abrir_menu: CaretDown,

  // cobrança e documento
  boleto: Barcode,
  pix: QrCode,
  certificado: Certificate,

  // as que existem para se mover
  carregando: SpinnerGap,
  engrenagem: Gear,
};

export type PropsDeIcone = {
  nome: NomeDeIcone;
  /** Em px. 16 é o corpo do texto; 20 a navegação; 28 os cartões de métrica. */
  tamanho?: number;
  peso?: IconWeight;
  /** Rótulo acessível. SEM ELE O ÍCONE É DECORATIVO (`aria-hidden`), e é assim
   *  que ele deve ficar em 90% dos casos: ao lado de um texto que já diz a mesma
   *  coisa, um ícone com rótulo faz o leitor de tela ler tudo duas vezes.
   *  Preencha só quando o ícone estiver SOZINHO — botão de confirmar, de baixar. */
  rotulo?: string;
  className?: string;
};

/**
 * O ícone. `currentColor` sempre: quem decide a cor é a regra CSS do lugar onde
 * ele está, e não uma prop — foi assim que a paleta da G3 inteira caiu num
 * arquivo em 28/07, e é a mesma disciplina.
 *
 * A CLASSE `ic-<nome>` SAI DAQUI para o CSS poder animar por nome. As quatro que
 * se movem estão listadas em `ICONES_QUE_SE_MOVEM` (`iconografia.ts`) e a
 * correspondência entre a lista e as regras CSS é verificada em
 * `web/tests/interface.ts` — sem isso "só estas quatro se movem" seria promessa.
 */
export function Icone({ nome, tamanho = 16, peso = 'regular', rotulo, className }: PropsDeIcone) {
  const Desenho = DESENHO[nome];
  return (
    <Desenho
      size={tamanho}
      weight={peso}
      color="currentColor"
      className={`ic ic-${nome}${className ? ` ${className}` : ''}`}
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
      focusable="false"
    />
  );
}

// -------------------------------------------------------------------- a marca
//
// O LOGOTIPO NÃO É PHOSPHOR, e é a única exceção — de propósito e nomeada aqui.
// Marca é identidade, não iconografia: um `Sun` da biblioteca faria o sistema da
// G3 abrir com o mesmo sol de qualquer outro produto que use Phosphor. Ele
// continua desenhado com o acento do tema, então segue a paleta.

/**
 * O sol da G3. Refeito em 30/07 a pedido do dono ("mais limpo e profissional") —
 * e o que mudou é geometria, não estilo:
 *
 *   - OS RAIOS ERAM OITO E FICARAM DOZE, alternando comprimento. Oito raios
 *     grossos em 20px viram uma estrela; doze finos em dois comprimentos leem
 *     como brilho, que é o que um sol é.
 *   - O DISCO PERDEU 0,5px DE RAIO e os raios afinaram de 1.8 para 1.5 — a
 *     mesma espessura de traço do Phosphor `regular`, para o logotipo não
 *     aparecer mais pesado que os ícones ao lado dele na mesma barra.
 *   - O CENTRO GANHOU UM VAZADO em `--fundo2`, que é o que dá a leitura de anel
 *     e evita o "bolinha com espinhos" do desenho antigo.
 */
export const Logotipo = ({ tamanho = 20 }: { tamanho?: number }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" aria-hidden="true"
       className="logotipo">
    <circle cx="12" cy="12" r="4.2" fill="var(--acento)" />
    <circle cx="12" cy="12" r="1.7" fill="var(--fundo2)" />
    <g stroke="var(--acento)" strokeWidth="1.5" strokeLinecap="round">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        const [x, y] = [Math.cos(a), Math.sin(a)];
        // Raio longo e curto alternados: 12 traços iguais viram uma roda dentada.
        const fim = i % 2 === 0 ? 10.4 : 8.8;
        return <line key={i} x1={12 + 6.2 * x} y1={12 + 6.2 * y} x2={12 + fim * x} y2={12 + fim * y} />;
      })}
    </g>
  </svg>
);

/**
 * O TRIANGULO DO AVISO DA FOLHA — desenhado a mao, e nao do Phosphor.
 *
 * A razao de nao vir do pacote esta escrita desde 12/08 e continua valendo: o
 * pacote e da INTERFACE, e um icone de tela dentro do papel traria peso e
 * tamanho pensados para outro meio. A folha e desenhada em `pt`, com filete de
 * 1,3 e um triangulo que ocupa 24pt ao lado de um titulo de 13,5pt.
 *
 * O QUE MUDOU EM 14/08 SAO DUAS COISAS, e as duas sao de higiene:
 *
 *   1. ELE ESTAVA DUPLICADO. O mesmo `<path>` aparecia em `documento.tsx` e em
 *      `fatura-unificada.tsx`, com o `stroke` escrito a mao nos dois. Duas copias
 *      do mesmo desenho e uma delas envelhecendo sozinha;
 *   2. O `stroke` ERA LITERAL num `.tsx`, e o invariante `I1b` da suite de
 *      interface so varre o `estilo.ts` — entao a lista de tintas do papel que o
 *      `I1c` declara "fechada" tinha duas ocorrencias fora do alcance dela.
 *      `currentColor` resolve: `.g3-aviso` ja declara `color: #14213D`, e o
 *      desenho passa a herdar a tinta da faixa em vez de repeti-la.
 */
export const TrianguloDeAviso = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.6L21.4 20H2.6L12 3.6z" />
    <path d="M12 9.6v4.6" /><path d="M12 17.1h.01" />
  </svg>
);
