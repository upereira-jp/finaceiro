// A TELA «Usuários» — as caixas, as travas e a senha provisória.
// Uso: node --experimental-strip-types web/tests/usuarios.ts
//
// O QUE ESTA SUITE PRENDE é a promessa da tela: a caixa que não pode mudar
// aparece TRAVADA e diz por quê, ANTES do clique — e as travas são as mesmas do
// servidor (`src/dominio/acesso.ts`, suite `tests/acesso.ts`). Uma trava a menos
// aqui não abre buraco (o servidor recusa), mas vira um clique que volta com erro;
// uma trava a MAIS esconde da pessoa uma mudança que ela tem direito de fazer.

import {
  PERFIS, COLUNAS_DE_SETOR, alternarSetor, caixaDoSetor, mudancaDePerfil, perfilTravado,
  ehContaDeServico, gerarSenha, textoDeAcesso, faltaNoFormulario, SENHA_MINIMA,
} from '../src/usuarios-regras.ts';
import { FUNIS } from '../src/navegacao.ts';
import { ehContaDeServico as doServidor, SETORES, SENHA_MINIMA as MINIMA_DO_SERVIDOR } from '../../src/dominio/acesso.ts';
import { emailDoServico } from '../../src/auth/usuario-de-servico.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

// ------------------------------------------------ as colunas sao os setores
chk('US1', COLUNAS_DE_SETOR.map((c) => c.chave).join() === SETORES.join()
        && COLUNAS_DE_SETOR.every((c, i) => c.nome === FUNIS[i]!.rotulo),
    'as colunas de caixa sao os setores do servidor, na ordem e com o nome do menu');
chk('US2', PERFIS.map((p) => p.valor).join() === 'admin,financeiro,cobranca,leitura'
        && PERFIS.every((p) => p.faz.length > 20),
    'os quatro perfis da matriz, cada um dizendo o que FAZ');
chk('US3', alternarSetor(['empresa'], 'rateio').join() === 'rateio,empresa'
        && alternarSetor(['rateio', 'empresa'], 'rateio').join() === 'empresa',
    'marcar e desmarcar devolve a lista na ordem do menu');

// ------------------------------------------------ as travas
const outra = { papel: 'admin', setores: ['rateio', 'empresa', 'administracao'], ativo: true, voce: false, email: 'a@g3.com' };
const eu = { ...outra, voce: true };

chk('US4', !caixaDoSetor(outra, 'administracao').travada && !caixaDoSetor(outra, 'rateio').travada,
    'na linha de OUTRA pessoa que administra, tudo se mexe — inclusive tirar a Administracao dela');
chk('US5', caixaDoSetor(eu, 'administracao').travada && !caixaDoSetor(eu, 'rateio').travada,
    'na PROPRIA linha, a Administracao trava (sumiria no proximo clique); os setores financeiros, nao');
chk('US6', caixaDoSetor({ ...outra, papel: 'financeiro', setores: ['rateio'] }, 'administracao').travada
        && /Administrador/.test(caixaDoSetor({ ...outra, papel: 'leitura', setores: ['rateio'] }, 'administracao').motivo ?? ''),
    'a Administracao trava para quem nao e Administrador, e diz por que');
chk('US7', caixaDoSetor({ ...outra, setores: ['empresa'] }, 'empresa').travada
        && !caixaDoSetor({ ...outra, setores: ['empresa'] }, 'rateio').travada,
    'o unico setor marcado trava (a barra nunca fica vazia); os desmarcados continuam livres');
chk('US8', ['rateio', 'empresa', 'administracao'].every((s) => caixaDoSetor({ ...outra, ativo: false }, s).travada),
    'acesso desligado: a linha inteira trava ate religar');
{
  const servico = { ...outra, papel: 'cobranca', setores: ['rateio', 'empresa'],
                    email: emailDoServico('eac198c0-b0c1-4b13-9b4d-6ac1a6eb011d') };
  chk('US9', ehContaDeServico(servico.email) && doServidor(servico.email)
          && ['rateio', 'empresa'].every((s) => caixaDoSetor(servico, s).travada) && perfilTravado(servico),
      'a conta do conector Sicoob trava inteira — desliga-la faria os pagamentos deixarem de ser baixados');
}
chk('US10', perfilTravado(eu) && !perfilTravado(outra) && perfilTravado({ ...outra, ativo: false }),
    'o proprio perfil trava; o de outra pessoa ativa, nao');

// ------------------------------------------------ trocar o perfil
{
  const m = mudancaDePerfil(outra, 'financeiro');
  chk('US11', m.papel === 'financeiro' && !m.setores.includes('administracao') && m.aviso !== null,
      'sair do Administrador leva a Administracao junto, no mesmo pedido, e a tela avisa');
  const so = mudancaDePerfil({ papel: 'admin', setores: ['administracao'] }, 'leitura');
  chk('US12', so.setores.join() === 'rateio,empresa',
      'se a Administracao era o unico setor, a pessoa fica com os dois financeiros — nunca sem nada');
  const igual = mudancaDePerfil({ papel: 'leitura', setores: ['empresa'] }, 'cobranca');
  chk('US13', igual.aviso === null && igual.setores.join() === 'empresa',
      'troca entre perfis que nao tocam a Administracao nao mexe nos setores');
}

// ------------------------------------------------ a senha provisoria
{
  const s1 = gerarSenha();
  const s2 = gerarSenha();
  chk('US14', /^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/.test(s1) && s1 !== s2,
      `a senha gerada tem tres blocos de quatro, e duas seguidas diferem (${s1.length} caracteres)`);
  chk('US15', s1.length >= SENHA_MINIMA && SENHA_MINIMA === MINIMA_DO_SERVIDOR,
      'a gerada passa no minimo, e o minimo da tela e o do servidor');
  const muitas = Array.from({ length: 200 }, () => gerarSenha()).join('');
  chk('US16', !/[0O1lI]/.test(muitas),
      'nenhuma senha usa 0/O nem 1/l/I — e o par que se digita errado lendo de uma mensagem');
  const fixo = gerarSenha((n) => new Uint32Array(n));
  chk('US17', fixo === 'aaaa-aaaa-aaaa', 'o sorteio e injetavel, e a forma do resultado nao depende dele');
}

// ------------------------------------------------ o formulario e a mensagem
const ok = { nome: 'Ana Souza', email: 'ana@g3solar.com.br', senha: 'x'.repeat(SENHA_MINIMA), papel: 'financeiro', setores: ['empresa'] };
chk('US18', faltaNoFormulario(ok) === null, 'formulario completo: pode enviar');
chk('US19', faltaNoFormulario({ ...ok, email: 'ana' }) !== null
         && faltaNoFormulario({ ...ok, papel: '' }) !== null
         && faltaNoFormulario({ ...ok, setores: [] }) !== null
         && faltaNoFormulario({ ...ok, setores: ['administracao'] }) !== null
         && faltaNoFormulario({ ...ok, senha: 'curta' }) !== null,
    'o botao diz o que falta: e-mail, perfil, setor, senha curta, Administracao sem Administrador');
{
  const t = textoDeAcesso({ nome: ' Ana Souza ', email: 'ana@g3solar.com.br', senha: 'abcd-efgh-jkmn',
                            endereco: 'https://financeiro.exemplo' });
  chk('US20', t.startsWith('Olá, Ana!') && t.includes('https://financeiro.exemplo')
           && t.includes('ana@g3solar.com.br') && t.includes('abcd-efgh-jkmn'),
      'a mensagem para a pessoa nova traz endereco, e-mail e senha — o que ela precisa para entrar');
}

console.log(`--- usuarios (regras da tela): ${feitas} verificacoes, ${falhas} falhas`);
if (falhas > 0) process.exit(1);
