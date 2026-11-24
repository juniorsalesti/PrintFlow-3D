/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, Layers, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { ErpProvider, useErp } from './context/ErpContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/UiPrimitives';
import { LoginScreen } from './components/auth/LoginScreen';
import { ErpLayout } from './components/layout/ErpLayout';
import { DashboardModule } from './components/modules/DashboardModule';
import { OrdersModule } from './components/modules/OrdersModule';
import { QuotesModule } from './components/modules/QuotesModule';
import { CustomersModule } from './components/modules/CustomersModule';
import { ProductsModule } from './components/modules/ProductsModule';
import { ProductionModule } from './components/modules/ProductionModule';
import { PrintersModule } from './components/modules/PrintersModule';
import { InventoryModule } from './components/modules/InventoryModule';
import { CalculatorModule } from './components/modules/CalculatorModule';
import { FinancialModule } from './components/modules/FinancialModule';
import { PurchasesModule } from './components/modules/PurchasesModule';
import { SuppliersModule } from './components/modules/SuppliersModule';
import { ReportsModule } from './components/modules/ReportsModule';
import { SettingsModule } from './components/modules/SettingsModule';

const ErpWorkspace: React.FC = () => {
  const {
    user,
    tenant,
    authReady,
    bootstrapping,
    authError,
    retryBootstrap,
    logout,
    activeSection,
    toasts,
    dismissToast,
  } = useErp();

  if (!authReady || bootstrapping) {
    return (
      <div className="min-h-screen bg-[#101114] text-[#F5F5F5] flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 rounded-xl bg-[#F97316] flex items-center justify-center text-white mb-4">
          <Layers className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-2.5 text-sm text-[#9CA3AF]">
          <Loader2 className="w-4 h-4 animate-spin text-[#F97316]" />
          <span>Carregando ambiente PrintFlow 3D...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginScreen />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (!tenant) {
    return (
      <>
        <div className="min-h-screen bg-[#101114] text-[#F5F5F5] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#1D2027] border border-red-500/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#F5F5F5]">
                  Não foi possível inicializar sua empresa no banco de dados
                </h2>
                <p className="text-xs text-[#9CA3AF] mt-1">
                  Conta conectada: <strong className="text-[#F5F5F5]">{user.email || user.uid}</strong>
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#101114] border border-[#282C35] text-xs text-red-300 leading-relaxed break-words">
              {authError ||
                'Falha ao carregar ou criar o perfil da empresa no Firestore. Sem essa inicialização os cadastros não podem ser salvos.'}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => void retryBootstrap()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] hover:text-[#F5F5F5] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sair / Trocar conta
              </button>
            </div>
          </div>
        </div>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardModule />;
      case 'orders':
        return <OrdersModule />;
      case 'quotes':
        return <QuotesModule />;
      case 'customers':
        return <CustomersModule />;
      case 'products':
        return <ProductsModule />;
      case 'production':
        return <ProductionModule />;
      case 'printers':
        return <PrintersModule />;
      case 'inventory':
        return <InventoryModule />;
      case 'calculator':
        return <CalculatorModule />;
      case 'financial':
        return <FinancialModule />;
      case 'purchases':
        return <PurchasesModule />;
      case 'suppliers':
        return <SuppliersModule />;
      case 'reports':
        return <ReportsModule />;
      case 'settings':
        return <SettingsModule />;
      default:
        return <DashboardModule />;
    }
  };

  return (
    <>
      <ErpLayout>{renderSection()}</ErpLayout>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ErpProvider>
        <ErpWorkspace />
      </ErpProvider>
    </ErrorBoundary>
  );
}
