// Sessao: login pelo Supabase Auth, escolha de tenant, e o contexto que a
// camada de API le em toda chamada.
//
// O TOKEN NAO E GUARDADO POR ESTE ARQUIVO. Quem o guarda e o `supabase-js`, e
// ele renova sozinho antes de expirar. Copiar o `access_token` para um estado do
// React criaria uma SEGUNDA copia que nao renova - e o sintoma seria 401 depois
// de uma hora de tela aberta, que e o tipo de bug que so aparece com o usuario
// real e nunca em teste.
//
// A CONFIGURACAO VEM DA API, nao do build (`GET /api/publico/config`). Um build
// so serve qualquer ambiente, e trocar de projeto Supabase nao exige recompilar.
// Enquanto ela nao chega, a tela nao monta: subir o formulario de login antes de
// saber contra quem autenticar seria oferecer um campo que nao funciona.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { api, ligarContexto, type Sessao } from './api.ts';

type Estado = {
  cliente: SupabaseClient | null;
  sessaoAuth: Session | null;
  sessao: Sessao | null;
  tenantId: string | null;
  escolherTenant: (id: string) => void;
  sair: () => Promise<void>;
  carregando: boolean;
  erro: string | null;
};

const Ctx = createContext<Estado | null>(null);

export function useSessao(): Estado {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSessao fora do ProvedorDeSessao');
  return c;
}

const CHAVE_TENANT = 'financeiro.tenant';

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [cliente, setCliente] = useState<SupabaseClient | null>(null);
  const [sessaoAuth, setSessaoAuth] = useState<Session | null>(null);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(() => localStorage.getItem(CHAVE_TENANT));
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // O contexto que a camada de API le. Ligado por FUNCAO, e nao por valor, para
  // ela sempre ver o token corrente - inclusive o que o supabase-js renovou
  // sozinho no meio da sessao.
  useEffect(() => {
    ligarContexto({
      token: () => sessaoAuth?.access_token ?? null,
      tenantId: () => tenantId,
    });
  }, [sessaoAuth, tenantId]);

  // 1. config -> cliente Supabase -> sessao existente
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const cfg = await api.get<{ supabaseUrl: string; supabaseAnonKey: string }>('/publico/config');
        if (!vivo) return;
        const c = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        setCliente(c);
        const { data } = await c.auth.getSession();
        if (!vivo) return;
        setSessaoAuth(data.session);
        c.auth.onAuthStateChange((_e, s) => setSessaoAuth(s));
      } catch (e: any) {
        if (vivo) setErro(e?.message ?? 'Não foi possível carregar a configuração.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // 2. com token, resolve a identidade do financeiro e os vinculos
  useEffect(() => {
    if (!sessaoAuth) { setSessao(null); return; }
    let vivo = true;
    (async () => {
      try {
        const s = await api.get<Sessao>('/sessao');
        if (!vivo) return;
        setSessao(s);
        /*
         * COM UM VINCULO SO, escolhe sozinho - e isso NAO e "escolher em
         * silencio". O servidor faz o mesmo: `selecionarTenant` aceita ausencia
         * de proposta quando ha um vinculo unico, e RECUSA quando ha mais de um.
         * Com dois, a tela pergunta.
         */
        setTenantId((atual) => {
          if (atual && s.tenants.some((t) => t.tenantId === atual)) return atual;
          const unico = s.tenants.length === 1 ? s.tenants[0]!.tenantId : null;
          if (unico) localStorage.setItem(CHAVE_TENANT, unico);
          return unico;
        });
      } catch (e: any) {
        if (vivo) setErro(e?.message ?? 'Falha ao resolver a sessão.');
      }
    })();
    return () => { vivo = false; };
  }, [sessaoAuth]);

  const valor = useMemo<Estado>(() => ({
    cliente, sessaoAuth, sessao, tenantId, carregando, erro,
    escolherTenant: (id) => { localStorage.setItem(CHAVE_TENANT, id); setTenantId(id); },
    sair: async () => {
      localStorage.removeItem(CHAVE_TENANT);
      setTenantId(null);
      await cliente?.auth.signOut();
    },
  }), [cliente, sessaoAuth, sessao, tenantId, carregando, erro]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
