import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, authError, bootstrapping, domainStatus, recheckAuthorizedDomain, showToast } =
    useErp();
  const [signingIn, setSigningIn] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);

  const handleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  const handleCopyHost = async () => {
    if (!domainStatus.currentHost) return;
    try {
      await navigator.clipboard.writeText(domainStatus.currentHost);
      setCopiedHost(true);
      showToast('Domínio copiado para a área de transferência.', 'info');
      setTimeout(() => setCopiedHost(false), 2500);
    } catch {
      showToast('Não foi possível copiar automaticamente. Selecione e copie o domínio.', 'error');
    }
  };

  const handleRecheckDomain = async () => {
    setCheckingDomain(true);
    try {
      const res = await recheckAuthorizedDomain();
      if (res.authorized) {
        showToast('Domínio autorizado confirmado! Você já pode entrar com o Google.', 'success');
      } else {
        showToast(`O domínio "${res.currentHost}" ainda não consta nos domínios autorizados.`, 'error');
      }
    } finally {
      setCheckingDomain(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#101114] text-[#F5F5F5] flex flex-col lg:flex-row">
      {/* Left branding & operational overview */}
      <div className="lg:w-1/2 p-8 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#282C35] bg-[#14161B]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F97316] flex items-center justify-center text-white shadow-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="font-display text-xl font-bold tracking-tight text-[#F5F5F5]">
              PrintFlow 3D
            </span>
            <p className="text-xs text-[#9CA3AF]">ERP para Empresas de Impressão 3D</p>
          </div>
        </div>

        <div className="my-12 lg:my-0 max-w-xl space-y-6">
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-[#F5F5F5] leading-tight">
            Controle completo da sua operação de impressão 3D em um único sistema.
          </h1>
          <p className="text-base text-[#9CA3AF] leading-relaxed">
            Gerencie clientes, orçamentos, pedidos, fila de produção, parque de impressoras,
            consumo real de filamentos, custos de energia e fluxo financeiro com dados persistentes e
            integrados.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-4 space-y-2">
              <Calculator className="w-5 h-5 text-[#F97316]" />
              <p className="text-sm font-semibold text-[#F5F5F5]">Precificação Exata</p>
              <p className="text-xs text-[#9CA3AF]">
                Filamento por g/m, energia, depreciação e margem real sobre venda.
              </p>
            </div>
            <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-4 space-y-2">
              <Printer className="w-5 h-5 text-[#F97316]" />
              <p className="text-sm font-semibold text-[#F5F5F5]">Chão de Fábrica</p>
              <p className="text-xs text-[#9CA3AF]">
                Kanban de produção com reserva e baixa automática de filamentos.
              </p>
            </div>
            <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-4 space-y-2">
              <BarChart3 className="w-5 h-5 text-[#F97316]" />
              <p className="text-sm font-semibold text-[#F5F5F5]">Financeiro Real</p>
              <p className="text-xs text-[#9CA3AF]">
                Fluxo de caixa, contas a pagar/receber e relatórios em CSV e PDF.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Dados isolados por empresa com autenticação e regras de segurança Firebase.</span>
        </div>
      </div>

      {/* Right login card */}
      <div className="lg:w-1/2 p-8 lg:p-16 flex items-center justify-center">
        <div className="w-full max-w-md bg-[#1D2027] border border-[#282C35] rounded-xl p-8 space-y-6">
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-bold text-[#F5F5F5]">Acessar plataforma</h2>
            <p className="text-sm text-[#9CA3AF]">
              Entre com sua conta Google para criar ou acessar o ambiente da sua empresa.
            </p>
          </div>

          {domainStatus.checked && !domainStatus.authorized && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-200">
                    Domínio atual precisa ser autorizado no Firebase
                  </p>
                  <p className="text-amber-100/80 leading-relaxed">
                    Para fazer login com Google neste endereço, adicione o domínio abaixo em{' '}
                    <strong>Authentication &gt; Configurações &gt; Domínios autorizados</strong>:
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-[#101114] border border-[#282C35] rounded-lg px-3 py-2">
                <code className="flex-1 text-[11px] font-mono text-[#F5F5F5] break-all select-all">
                  {domainStatus.currentHost}
                </code>
                <button
                  type="button"
                  onClick={handleCopyHost}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#1D2027] hover:bg-[#282C35] text-[#F5F5F5] font-medium transition-colors cursor-pointer shrink-0"
                >
                  {copiedHost ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={domainStatus.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-medium transition-colors"
                >
                  <span>Abrir Firebase Console</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={handleRecheckDomain}
                  disabled={checkingDomain}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D2027] hover:bg-[#282C35] border border-[#282C35] text-[#F5F5F5] font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingDomain ? 'animate-spin' : ''}`} />
                  <span>{checkingDomain ? 'Verificando...' : 'Verificar novamente'}</span>
                </button>
              </div>
            </div>
          )}

          {authError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 leading-relaxed">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={signingIn || bootstrapping}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60"
          >
            {signingIn || bootstrapping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{bootstrapping ? 'Preparando empresa...' : 'Conectando...'}</span>
              </>
            ) : (
              <span>Entrar com Google</span>
            )}
          </button>

          <div className="pt-4 border-t border-[#282C35] text-xs text-[#9CA3AF] space-y-1.5">
            <p>
              No primeiro acesso, o sistema configura automaticamente sua empresa, tarifas padrão e
              sua primeira impressora <strong className="text-[#F5F5F5]">Creality Ender 3 V2</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
