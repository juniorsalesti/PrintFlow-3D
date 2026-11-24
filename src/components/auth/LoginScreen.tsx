import React, { useState } from 'react';
import { Layers, Loader2, ShieldCheck, Printer, Calculator, BarChart3 } from 'lucide-react';
import { useErp } from '../../context/ErpContext';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, authError, bootstrapping } = useErp();
  const [signingIn, setSigningIn] = useState(false);

  const handleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
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

          {authError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
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
