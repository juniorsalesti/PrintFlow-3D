import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  BarChart3,
  Bell,
  Boxes,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Printer,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import type { NavSectionId } from '../../types/erp';
import { formatBRL } from '../../utils/formatters';

interface NavItem {
  id: NavSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orders', label: 'Pedidos', icon: ClipboardList },
  { id: 'quotes', label: 'Orçamentos', icon: FileText },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'production', label: 'Produção', icon: Layers },
  { id: 'printers', label: 'Impressoras', icon: Printer },
  { id: 'inventory', label: 'Estoque', icon: Boxes },
  { id: 'calculator', label: 'Calculadora de custos', icon: Calculator },
  { id: 'financial', label: 'Financeiro', icon: DollarSign },
  { id: 'purchases', label: 'Compras', icon: ShoppingCart },
  { id: 'suppliers', label: 'Fornecedores', icon: Truck },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export const ErpLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    company,
    profile,
    logout,
    activeSection,
    setActiveSection,
    setSelectedCustomerId,
    customers,
    orders,
    products,
    quotes,
    smartAlerts,
    isSectionLoading,
    sectionError,
    refreshCurrentSection,
  } = useErp();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const alertsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
      if (alertsContainerRef.current && !alertsContainerRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return null;

    const matchedCustomers = customers
      .filter(
        (c) =>
          !c.isArchived &&
          (c.fullName.toLowerCase().includes(term) ||
            c.phone.toLowerCase().includes(term) ||
            c.email.toLowerCase().includes(term))
      )
      .slice(0, 4);

    const matchedOrders = orders
      .filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(term) ||
          o.customerName.toLowerCase().includes(term)
      )
      .slice(0, 4);

    const matchedProducts = products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          p.material.toLowerCase().includes(term)
      )
      .slice(0, 4);

    const matchedQuotes = quotes
      .filter(
        (q) =>
          q.quoteNumber.toLowerCase().includes(term) ||
          q.customerName.toLowerCase().includes(term) ||
          q.title.toLowerCase().includes(term)
      )
      .slice(0, 3);

    const total =
      matchedCustomers.length +
      matchedOrders.length +
      matchedProducts.length +
      matchedQuotes.length;

    return { matchedCustomers, matchedOrders, matchedProducts, matchedQuotes, total };
  }, [searchTerm, customers, orders, products, quotes]);

  const currentNavLabel =
    NAV_ITEMS.find((n) => n.id === activeSection)?.label || 'Dashboard';

  const handleSelectNav = (id: NavSectionId) => {
    setActiveSection(id);
    if (id !== 'customers') setSelectedCustomerId(null);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#101114] text-[#F5F5F5] flex">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Fixed Collapsible Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#17191E] border-r border-[#282C35] flex flex-col transition-[width,transform] duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-[72px]' : 'lg:w-[248px]'} w-[248px]`}
      >
        {/* Brand Row */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#282C35] shrink-0">
          <button
            type="button"
            onClick={() => handleSelectNav('dashboard')}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-[#F97316] flex items-center justify-center text-white shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            {!collapsed && (
              <span className="font-display font-bold text-base tracking-tight text-[#F5F5F5] truncate">
                PrintFlow 3D
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="hidden lg:flex p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#22262E] transition-colors cursor-pointer"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#F97316]/15 text-[#F97316]'
                    : 'text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#1D2027]'
                } ${collapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#F97316]' : ''}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-[#282C35] shrink-0">
          {!collapsed ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F5F5F5] truncate">
                  {company?.name || 'PrintFlow 3D'}
                </p>
                <p className="text-[11px] text-[#9CA3AF] truncate">{profile?.email}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Sair da conta"
                className="p-2 rounded-lg text-[#9CA3AF] hover:text-red-400 hover:bg-[#22262E] transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={logout}
              title="Sair da conta"
              className="w-full flex items-center justify-center p-2 rounded-lg text-[#9CA3AF] hover:text-red-400 hover:bg-[#22262E] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ${
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-[248px]'
        }`}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-[#101114]/95 backdrop-blur-sm border-b border-[#282C35] px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
              className="lg:hidden p-2 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#1D2027] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex items-center gap-2.5">
              <h1 className="font-display text-base sm:text-lg font-semibold text-[#F5F5F5] truncate">
                {currentNavLabel}
              </h1>
              {isSectionLoading && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF]">
                  <span className="w-3 h-3 rounded-full border-2 border-[#F97316] border-t-transparent animate-spin" />
                  <span className="hidden md:inline">Sincronizando...</span>
                </span>
              )}
            </div>
          </div>

          {/* Global Search + Notifications */}
          <div className="flex items-center gap-3 shrink-0">
            <div ref={searchContainerRef} className="relative hidden sm:block w-64 md:w-80">
              <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSearchFocused(true);
                }}
                placeholder="Buscar clientes, pedidos, produtos..."
                className="w-full bg-[#17191E] border border-[#282C35] focus:border-[#F97316] rounded-lg pl-9 pr-8 py-1.5 text-sm text-[#F5F5F5] placeholder-[#6B7280] outline-none transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#F5F5F5] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {searchFocused && searchResults && (
                <div className="absolute left-0 right-0 mt-2 bg-[#1D2027] border border-[#2F3542] rounded-xl shadow-2xl overflow-hidden z-50 max-h-96 overflow-y-auto">
                  {searchResults.total === 0 ? (
                    <div className="p-4 text-xs text-[#9CA3AF] text-center">
                      Nenhum resultado encontrado para "{searchTerm}".
                    </div>
                  ) : (
                    <div className="divide-y divide-[#282C35]">
                      {searchResults.matchedCustomers.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[11px] font-semibold text-[#9CA3AF]">
                            Clientes
                          </p>
                          {searchResults.matchedCustomers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomerId(c.id);
                                setActiveSection('customers');
                                setSearchFocused(false);
                                setSearchTerm('');
                              }}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#252A34] flex items-center justify-between text-xs cursor-pointer"
                            >
                              <span className="text-[#F5F5F5] font-medium truncate">
                                {c.fullName}
                              </span>
                              <span className="text-[#9CA3AF] ml-2 shrink-0">
                                {c.phone || c.whatsapp || 'Sem telefone'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.matchedOrders.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[11px] font-semibold text-[#9CA3AF]">
                            Pedidos
                          </p>
                          {searchResults.matchedOrders.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                setActiveSection('orders');
                                setSearchFocused(false);
                                setSearchTerm('');
                              }}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#252A34] flex items-center justify-between text-xs cursor-pointer"
                            >
                              <span className="text-[#F5F5F5] font-medium truncate">
                                {o.orderNumber} · {o.customerName}
                              </span>
                              <span className="text-[#F97316] font-mono tabular-nums ml-2 shrink-0">
                                {formatBRL(o.totalValue)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.matchedProducts.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[11px] font-semibold text-[#9CA3AF]">
                            Produtos
                          </p>
                          {searchResults.matchedProducts.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setActiveSection('products');
                                setSearchFocused(false);
                                setSearchTerm('');
                              }}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#252A34] flex items-center justify-between text-xs cursor-pointer"
                            >
                              <span className="text-[#F5F5F5] font-medium truncate">{p.name}</span>
                              <span className="text-[#9CA3AF] font-mono tabular-nums ml-2 shrink-0">
                                {formatBRL(p.salePrice)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.matchedQuotes.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[11px] font-semibold text-[#9CA3AF]">
                            Orçamentos
                          </p>
                          {searchResults.matchedQuotes.map((q) => (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => {
                                setActiveSection('quotes');
                                setSearchFocused(false);
                                setSearchTerm('');
                              }}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#252A34] flex items-center justify-between text-xs cursor-pointer"
                            >
                              <span className="text-[#F5F5F5] font-medium truncate">
                                {q.quoteNumber} · {q.title || q.customerName}
                              </span>
                              <span className="text-[#9CA3AF] font-mono tabular-nums ml-2 shrink-0">
                                {formatBRL(q.totalPrice)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notifications Bell */}
            <div ref={alertsContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setAlertsOpen((o) => !o)}
                aria-label="Notificações e alertas"
                className="relative p-2 rounded-lg bg-[#17191E] border border-[#282C35] hover:border-[#3A404D] text-[#9CA3AF] hover:text-[#F5F5F5] transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {smartAlerts.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-md bg-[#F97316] text-white text-[10px] font-bold font-mono tabular-nums flex items-center justify-center">
                    {smartAlerts.length > 99 ? '99+' : smartAlerts.length}
                  </span>
                )}
              </button>

              {alertsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#1D2027] border border-[#2F3542] rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-[#282C35] flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#F5F5F5]">
                      Alertas operacionais
                    </span>
                    <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                      {smartAlerts.length} ativo(s)
                    </span>
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-[#282C35]">
                    {smartAlerts.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#9CA3AF]">
                        Nenhum alerta crítico ou pendência no momento.
                      </div>
                    ) : (
                      smartAlerts.map((al) => (
                        <button
                          key={al.id}
                          type="button"
                          onClick={() => {
                            setActiveSection(al.targetSection);
                            setAlertsOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-[#242832] transition-colors flex items-start gap-3 cursor-pointer"
                        >
                          <AlertTriangle
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              al.severity === 'danger' ? 'text-red-400' : 'text-amber-400'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#F5F5F5] truncate">
                              {al.title}
                            </p>
                            <p className="text-xs text-[#9CA3AF] mt-0.5 line-clamp-2">
                              {al.message}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {sectionError && (
            <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-red-200">
                    Falha ao consultar dados no servidor (Cloud Firestore)
                  </p>
                  <p className="text-xs text-red-300/90 mt-0.5 break-words">{sectionError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshCurrentSection()}
                disabled={isSectionLoading}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-xs font-medium text-red-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSectionLoading ? 'Recarregando...' : 'Tentar novamente'}
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};
