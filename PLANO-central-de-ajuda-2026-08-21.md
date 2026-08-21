# Central de ajuda — estudo de possibilidades e o que foi feito

**21/08/2026** · véspera da entrada dos usuários novos · sem divisão de suporte

---

## 1. O pedido

> *"quero aperfeiçoar a central de ajuda do sistema financeiro; melhorias de estética:
> colocar o ícone no canto inferior direito. Ademais quero que esteja preparado para
> receber todo tipo de pergunta e sempre devolver o possível link de rota para resolução.
> Faça estudo de possibilidades de tudo que a central de ajuda deve fazer. Sempre que o
> computador fizer o login pela primeira vez no sistema, deve aparecer uma mensagem
> indicando onde fica a central de ajuda, a mensagem deve subir um balão de
> conversa/pensamento a partir do botão de central de ajuda, nada que ocupe muito a tela,
> o balão deve ter um "x" bem pequeno no seu canto superior direito para fechá-lo."*

Três coisas, e a do meio é a maior: **toda resposta tem de terminar num clique.**

---

## 2. A restrição que desenha tudo

Não há divisão de suporte, e não vai haver amanhã. Isso muda a natureza do erro:

| Sistema com suporte | Este sistema |
|---|---|
| Ajuda que não responde → chamado aberto | Ajuda que não responde → **alguém parado** |
| Resposta parcial → a pessoa pergunta o resto | Resposta parcial → a pessoa **desiste** |
| Explicar onde fica a tela → suficiente | Explicar onde fica a tela → **ainda é trabalho de quem já travou** |

É daí que sai a promessa. Não é uma preferência de UX: é a única forma de a ajuda
substituir alguém que não existe.

---

## 3. O estudo: tudo que uma central de ajuda **pode** fazer

Quinze funções possíveis, cada uma com veredito e motivo. As oito primeiras estão de pé.

### ✅ 3.1 Responder por busca, com a palavra da pessoa

Domínio fechado — doze telas, onze pendências —, então uma tabela de sinônimos curada
acerta mais do que qualquer coisa adaptativa, responde na hora, funciona sem rede, não
custa por pergunta e **é testável**. Hoje são **40 assuntos** e **341 formas de procurá-los**.

O termo é o da pessoa, inclusive o errado: `cadê o boleto`, `conta de luz`, `quem trouxe`,
`sumiu da lista`, `o ensaio vai cobrar alguém`. Quem já sabe o nome certo acha de qualquer jeito.

### ✅ 3.2 Terminar num clique — **a promessa**

Toda resposta carrega ao menos um `Caminho` (rota + o ato em imperativo + o tipo).
São **61 caminhos** em 40 assuntos, e a suíte recusa um assunto sem nenhum.

O `tipo` separa duas coisas que pareciam uma só:

- **`resolver`** — é aqui que o dado entra;
- **`ver`** — aqui dá para olhar, mas o conserto é noutro lugar (ou não é de tela).

A distinção não é decoração. Duas pendências **não têm formulário e não vão ter**: a
energia gerada é espelhada do CRM (um campo aqui criaria um segundo dono do mesmo número)
e o valor da comissão é decisão versionada com dono nomeado. Antes elas apareciam com o
número e **sem link nenhum** — verdadeiro e inútil. Agora levam à tela onde aquilo ao
menos aparece, com o rótulo dizendo isso. Pintar as duas iguais seria mandar alguém
procurar em Usinas um campo que não existe.

### ✅ 3.3 Ler o estado ao vivo

Já existia e continua: a ajuda busca o relatório do mês e diz o que está travando
**agora**, em ordem, com o número dentro da frase. É a diferença entre *"para cobrar você
precisa de contrato ativo"* e *"faltam 11 clientes sem CPF confirmado — clique aqui"*.

> ⚠️ Isso depende do ciclo do conector, que roda sozinho a cada 15 minutos desde hoje
> (`deploy/financeiro-ciclo.timer`). Estado ao vivo lido de espelho velho é pior que
> nenhum: responde com confiança um número que já não vale.

### ✅ 3.4 Saber em que tela a pessoa está

Abrir a ajuda em Clientes fala de documento; em Usinas fala de dono e repasse.
**Cobertura hoje: 12 telas de 12.** Até hoje quatro abriam sem nada sobre si —
Pendências, Fatura unificada, Contas a pagar e Relatórios —, e quem travasse ali recebia
perguntas de outras telas e concluía, com razão, que a ajuda não sabia onde ele estava.

### ✅ 3.5 Definir a palavra que ninguém é obrigado a saber

**12 verbetes.** Novidade de hoje: cada um leva a uma tela. Definir e parar era responder
metade — quem descobriu o que é "fatia do cliente" quer, no ato seguinte, ir onde ela se
preenche.

### ✅ 3.6 Apresentar-se sozinha na primeira visita

Um ícone num canto é mudo. O balão sobe do botão, com duas bolhas de pensamento, e some
para sempre ao ser fechado **ou ao abrir a ajuda** — um aviso que sobrevive ao ato que
pedia é um aviso que não estava lendo a pessoa. A marca fica no navegador **daquele
computador**: quem entra de uma máquina nova, onde o botão está num canto que nunca viu,
é exatamente quem precisa da dica.

### ✅ 3.7 Ser navegável sem saber perguntar

"Ver todos os assuntos (40)", fechado. Existe para quem **não consegue formular** a
pergunta — e essa pessoa existe, é a mesma que ficaria parada. Buscar exige saber a
palavra; varrer uma lista, não.

### ✅ 3.8 Reconhecer quando a pergunta é só de navegação

`onde ficam as usinas` não é dúvida: é alguém procurando uma tela. Não casa assunto
nenhum — e não deve. A terceira defesa lê o nome (ou o apelido) das doze telas no texto
da pergunta e abre a porta.

---

### ⛔ 3.9 Modelo de linguagem respondendo as perguntas

**Rejeitado, e a decisão é firme.** O domínio é fechado e pequeno. Um modelo aqui seria
imprevisibilidade paga para resolver um problema que cabe numa lista — e imprevisível é
justamente o que não se pode ser quando não há ninguém para corrigir a resposta errada.
Some-se: o financeiro não tem provedor de LLM, a busca atual responde offline e sem custo
por pergunta, e — o que mais pesa — **ela é testável**. As 457 verificações deste arquivo
não teriam equivalente.

### ⛔ 3.10 Tour guiado / passo a passo por cima da tela

**Rejeitado.** Um tour é útil para quem tem tempo antes de precisar; aqui a pessoa chega
já travada, no meio de um cadastro. O painel resolve isso melhor por construção: abre por
cima **sem tirar ninguém do lugar**, sabe em que tela foi aberto e devolve ao trabalho com
um clique. Um tour faria o contrário — tomaria a tela para ensinar o que ela ainda não
precisa.

O que substitui o tour, e já existe: `PARTIDA.md` diz a ordem de arranque, e a aba
Pendências **é** o passo a passo, com número real e link em cada linha.

### ⛔ 3.11 Abrir chamado / falar com um humano

**Impossível por definição.** Não há para quem abrir. Um botão "falar com o suporte" seria
a única mentira que uma central de ajuda não pode contar. É por isso que a regra
"**nunca terminar em nada encontrado**" é dura aqui: o beco não tem plano B.

### ⛔ 3.12 Ajuda que preenche por você

**Rejeitado.** Toda pendência do relatório é ou um documento de gente, ou uma decisão
comercial, ou um número espelhado do CRM. Nenhuma é derivável — foi medido em 21/08.
Uma ajuda que "resolve sozinha" só poderia inventar.

---

### 🕐 3.13 Telemetria de busca sem resposta — **o próximo passo mais valioso**

Hoje a base cresce por adivinhação: alguém imagina o que perguntariam. O sinal real está
nas buscas que caem no palpite — elas são a lista exata do que falta na base, escrita
pelos usuários.

O desenho mínimo: `POST /ajuda/sem-resposta { termo }`, sem identificar quem, gravado só
quando `palpite === true`; uma leitura semanal vira assuntos novos. Barato e de alto
retorno. **Fica para depois de 22/08** porque escrever para o servidor a partir do painel
exige decidir retenção e privacidade, e hoje o prazo é a entrada dos usuários.

### 🕐 3.14 Ajuda por campo, dentro do formulário

Um "?" ao lado de cada campo difícil, abrindo a explicação daquele campo. É a evolução
natural: chega antes de a pessoa travar, e não depois. Fica para depois porque exige
mapear campo a campo em doze telas — e porque a maior parte do ganho já veio do painel
sabendo em que tela foi aberto.

### 🕐 3.15 Atalho de teclado e imagens

`?` abrindo o painel: barato, mas exige cuidado para não disparar dentro de campo de
texto, e o público não é de atalhos. Imagens ou vídeo curto por assunto: o maior ganho
de compreensão por real gasto — e o maior custo de manutenção, porque toda foto envelhece
com a tela e ninguém refaz. Só vale quando a interface parar de mudar toda semana.

---

## 4. As três defesas contra o beco

Em ordem, da mais precisa para a menos. A pergunta cai na primeira que responder:

```
1. O ASSUNTO   casou um tópico  →  os caminhos dele          (40 assuntos, 341 termos)
2. A PALAVRA   casou um verbete →  a definição + o endereço  (12 verbetes)
3. A TELA      não casou nada   →  a tela que a pergunta cita (12 telas com apelido)
   ↳ e se nem isso  →  a saída universal: "Ver o que falta neste mês"
```

A saída universal é sempre Pendências, e não por falta de ideia melhor: **aquela tela foi
construída para exatamente esta pessoa**, a que não sabe o que fazer a seguir.

Prova: a suíte roda **46 perguntas selvagens** — bem formuladas, pela metade, palavra
solta, jargão, gíria, `asdfgh` — e exige de todas ao menos um caminho para tela de
verdade.

---

## 5. O que a medição de hoje encontrou

Seis defeitos reais, nenhum deles suposto:

| # | Achado | Como apareceu |
|---|---|---|
| 1 | `"baixa"` casava com **"baixar a lista"** e caía no assunto de exportar planilha | Ao dobrar a base. A regra de frase comparava **pedaço de texto**; passou a comparar **palavra**. Quanto mais assuntos, mais pares de palavras uma dentro da outra |
| 2 | `"onde ficam as usinas"` caía em **"Onde vejo quanto entrou"** | Duas palavras casadas, logo forte — só que uma era `onde`, que está no título de meia dúzia de assuntos. A **pergunta** agora pontua mas **não serve de prova**; só os `termos` abrem a porta |
| 3 | `"cadê o boleto"` levava ao formulário de **credencial do banco** | Não havia outro assunto de boleto na base. Quem já tinha o banco configurado e só queria o boleto de uma fatura era mandado para a tela errada |
| 4 | O assunto vinha **fechado**, escondendo o próprio botão | O teste de renderização cobrou: numa central cuja promessa é terminar num clique, esconder o clique é o defeito mais caro possível. O **primeiro** resultado passou a vir aberto |
| 5 | As perguntas dos assuntos saíam **centradas** | Fotografando o painel. `text-align: left` governa o texto dentro da caixa; quem posiciona a caixa é o flex, e a regra base de `button` é `justify-content: center`. Sete perguntas, cada uma num recuo diferente, numa lista feita para ser varrida |
| 6 | `prefers-reduced-motion` zerava a **duração** e não o **atraso** | As bolhas do balão são a primeira animação com atraso do arquivo. Com `fill-mode: both`, o elemento segura o estado invisível durante todo o atraso: quem pediu menos movimento recebia um elemento surgindo 130ms depois |

Os cinco primeiros viraram verificação. O sexto virou `I3e` em `web/tests/interface.ts`.

> **Os defeitos 5 e 6 não seriam achados por nenhuma asserção sobre HTML** — a marcação
> estava certa, o texto estava certo, os botões estavam certos. Foi por isso que nasceu
> `npm run previa`: ela pinta o painel com o CSS de verdade num arquivo que se abre no
> navegador, sem servidor e sem login.

---

## 6. Os arquivos

| Arquivo | O que é | Entrega |
|---|---|---|
| `web/src/ajuda.ts` | 40 assuntos, a busca, as três defesas, o estado ao vivo | sob demanda |
| `web/src/vocabulario.ts` | verbetes das pendências, efeitos, situações, 12 termos do glossário | sob demanda |
| `web/src/ajuda-corpo.tsx` | o desenho do painel — tudo por propriedade, zero efeito de rede | sob demanda |
| `web/src/ajuda-painel.tsx` | busca o relatório do mês e navega | sob demanda |
| **`web/src/ajuda-gatilho.tsx`** | **o botão do canto e o balão de primeira visita** | **no pedaço de entrada** |
| `web/tests/ajuda.ts` | 457 verificações | — |
| `web/tests/caso-render.tsx` | 76 verificações, montando React de verdade | — |
| `web/tests/previa.ts` + `caso-previa.tsx` | a ferramenta de olho | — |

**O gatilho é o único pedaço que não é `lazy`**, e é deliberado: ele precisa existir em
toda tela desde o primeiro desenho, porque **quem trava não sabe que vai travar**. O
painel (12,3 kB comprimido) continua chegando só para quem abre — a tela de login não o
baixa. Conferido no `dist`: o nome do pacote aparece só no mapa de pré-carga.

---

## 7. Manutenção — o que doer daqui para frente

1. **Assunto novo sem caminho não compila a suíte.** É a invariante de que tudo depende.
2. **Tela nova sem assunto próprio quebra `A4e`**, e sem apelido em `PALAVRAS_DA_TELA`
   quebra `A9`. As duas de propósito: tela sem ajuda é tela onde a pessoa trava sozinha.
3. **Jargão no texto exibido quebra `V4` e `R9`.** A regra existe porque quem escreve a
   ajuda é quem já sabe o vocabulário — a frase técnica sai sem doer. Os campos de busca
   ficam de fora: lá o jargão é útil, alguém que ouviu "split" numa reunião vai digitá-lo.
4. **Termo disputado por dois assuntos** faz o desempate cair na ordem alfabética do id,
   que não é resposta. Ao acrescentar um assunto, rode a suíte: o bloco `A2` tem 38 frases
   reais e é ele que acusa.
5. **Crase em comentário do `estilo.ts` fecha a string.** O CSS inteiro vive num template
   literal. Custou duas quebras hoje; o `tsc` pega.

---

## 8. O que fica para a próxima, em ordem de valor

1. **Telemetria de busca sem resposta** (§3.13) — troca adivinhação por sinal real;
2. **Ajuda por campo** (§3.14) — chega antes de a pessoa travar;
3. **Assuntos vindos do uso**, alimentados por (1);
4. Atalho de teclado e imagens (§3.15), quando a interface parar de mudar.
