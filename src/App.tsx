/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Loader2, Layers } from 'lucide-react';
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
  const { user, authReady, bootstrapping, activeSection, toasts, dismissToast } = useErp();

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
