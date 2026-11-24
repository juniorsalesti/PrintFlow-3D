import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  auth,
  checkAuthorizedDomain,
  firebaseAuthConsoleUrl,
  googleProvider,
  type DomainAuthorizationCheck,
} from '../lib/firebase';
import {
  ensureCompanyBootstrap,
  subscribeCompanyCollection,
  subscribeCompanyMembers,
  subscribeSingleDoc,
  type TenantContext,
} from '../services/erpService';
import type {
  AppNotification,
  Company,
  CompanyMember,
  CompanySettings,
  Customer,
  Expense,
  InventoryMovement,
  MaintenanceRecord,
  Material,
  NavSectionId,
  Order,
  Printer,
  Product,
  ProductionJob,
  Purchase,
  Quote,
  Supplier,
  Transaction,
  UserProfile,
} from '../types/erp';
import { diffDaysFromToday, formatDateBR, formatGrams } from '../utils/formatters';

export interface SmartAlert {
  id: string;
  title: string;
  message: string;
  category:
    | 'estoque_baixo'
    | 'prazo_proximo'
    | 'pedido_atrasado'
    | 'manutencao'
    | 'conta_vencendo'
    | 'falha_impressao';
  severity: 'warning' | 'danger';
  targetSection: NavSectionId;
  targetId?: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ErpContextValue {
  user: User | null;
  authReady: boolean;
  bootstrapping: boolean;
  authError: string | null;
  domainStatus: DomainAuthorizationCheck;
  recheckAuthorizedDomain: () => Promise<DomainAuthorizationCheck>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  profile: UserProfile | null;
  company: Company | null;
  settings: CompanySettings | null;
  tenant: TenantContext | null;
  activeSection: NavSectionId;
  setActiveSection: (section: NavSectionId) => void;
  selectedCustomerId: string | null;
  setSelectedCustomerId: (id: string | null) => void;
  quickActionTrigger: string | null;
  triggerQuickAction: (action: string | null) => void;
  // Collections
  customers: Customer[];
  products: Product[];
  materials: Material[];
  inventoryMovements: InventoryMovement[];
  printers: Printer[];
  maintenanceRecords: MaintenanceRecord[];
  quotes: Quote[];
  orders: Order[];
  productionJobs: ProductionJob[];
  transactions: Transaction[];
  expenses: Expense[];
  suppliers: Supplier[];
  purchases: Purchase[];
  notifications: AppNotification[];
  members: CompanyMember[];
  smartAlerts: SmartAlert[];
  toasts: ToastMessage[];
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
}

const ErpContext = createContext<ErpContextValue | null>(null);

export const ErpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [domainStatus, setDomainStatus] = useState<DomainAuthorizationCheck>({
    checked: false,
    authorized: true,
    currentHost: typeof window !== 'undefined' ? window.location.hostname : '',
    consoleUrl: firebaseAuthConsoleUrl,
  });

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [activeSection, setActiveSection] = useState<NavSectionId>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [quickActionTrigger, setQuickActionTrigger] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [productionJobs, setProductionJobs] = useState<ProductionJob[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const triggerQuickAction = useCallback((action: string | null) => {
    setQuickActionTrigger(action);
  }, []);

  const recheckAuthorizedDomain = useCallback(async (): Promise<DomainAuthorizationCheck> => {
    const result = await checkAuthorizedDomain();
    setDomainStatus(result);
    if (result.checked && result.authorized) {
      setAuthError((prev) =>
        prev && prev.includes('Domínio não autorizado') ? null : prev
      );
    }
    return result;
  }, []);

  useEffect(() => {
    if (!user) {
      void recheckAuthorizedDomain();
    }
  }, [user, recheckAuthorizedDomain]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('pf3d_auth_reload_once');
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Erro ao autenticar com o Google.';
      let friendlyMsg = rawMsg;
      if (rawMsg.includes('auth/unauthorized-domain')) {
        const status = await recheckAuthorizedDomain();
        const currentHost = status.currentHost || (typeof window !== 'undefined' ? window.location.hostname : '');
        if (status.checked && status.authorized && typeof window !== 'undefined') {
          const alreadyReloaded = window.sessionStorage.getItem('pf3d_auth_reload_once') === '1';
          if (!alreadyReloaded) {
            window.sessionStorage.setItem('pf3d_auth_reload_once', '1');
            window.location.reload();
            return;
          }
          friendlyMsg = `O domínio "${currentHost}" já consta como autorizado no Firebase. Atualize a página (Ctrl+F5) e tente entrar novamente.`;
        } else {
          friendlyMsg = `Domínio "${currentHost}" não está autorizado no Firebase Auth. Copie este domínio e adicione-o em Firebase Console > Authentication > Configurações > Domínios autorizados.`;
        }
      } else if (rawMsg.includes('auth/popup-blocked')) {
        friendlyMsg = 'O pop-up de login foi bloqueado pelo navegador. Libere os pop-ups para este site e tente novamente.';
      } else if (rawMsg.includes('auth/popup-closed-by-user')) {
        friendlyMsg = 'A janela de login do Google foi fechada antes da conclusão.';
      }
      setAuthError(friendlyMsg);
      showToast(friendlyMsg, 'error');
    }
  }, [recheckAuthorizedDomain, showToast]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
    setCompany(null);
    setSettings(null);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAuthReady(true);
        setBootstrapping(false);
        setProfile(null);
        setCompany(null);
        setSettings(null);
        return;
      }

      setBootstrapping(true);
      setAuthError(null);
      try {
        const boot = await ensureCompanyBootstrap(currentUser);
        setProfile(boot.profile);
        setCompany(boot.company);
        setSettings(boot.settings);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao inicializar empresa.';
        setAuthError(msg);
      } finally {
        setBootstrapping(false);
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  const tenant = useMemo<TenantContext | null>(() => {
    if (!profile || !company) return null;
    return { companyId: company.id, ownerUid: company.ownerUid };
  }, [profile, company]);

  useEffect(() => {
    if (!tenant) {
      setCustomers([]);
      setProducts([]);
      setMaterials([]);
      setInventoryMovements([]);
      setPrinters([]);
      setMaintenanceRecords([]);
      setQuotes([]);
      setOrders([]);
      setProductionJobs([]);
      setTransactions([]);
      setExpenses([]);
      setSuppliers([]);
      setPurchases([]);
      setNotifications([]);
      setMembers([]);
      return;
    }

    const unsubs = [
      subscribeSingleDoc<Company>('companies', tenant.companyId, (docData) => {
        if (docData) setCompany(docData);
      }),
      subscribeSingleDoc<CompanySettings>('settings', tenant.companyId, (docData) => {
        if (docData) setSettings(docData);
      }),
      subscribeCompanyMembers(tenant, setMembers),
      subscribeCompanyCollection<Customer>('customers', tenant, setCustomers),
      subscribeCompanyCollection<Product>('products', tenant, setProducts),
      subscribeCompanyCollection<Material>('materials', tenant, setMaterials),
      subscribeCompanyCollection<InventoryMovement>('inventoryMovements', tenant, setInventoryMovements),
      subscribeCompanyCollection<Printer>('printers', tenant, setPrinters),
      subscribeCompanyCollection<MaintenanceRecord>('maintenanceRecords', tenant, setMaintenanceRecords),
      subscribeCompanyCollection<Quote>('quotes', tenant, setQuotes),
      subscribeCompanyCollection<Order>('orders', tenant, setOrders),
      subscribeCompanyCollection<ProductionJob>('productionJobs', tenant, setProductionJobs),
      subscribeCompanyCollection<Transaction>('transactions', tenant, setTransactions),
      subscribeCompanyCollection<Expense>('expenses', tenant, setExpenses),
      subscribeCompanyCollection<Supplier>('suppliers', tenant, setSuppliers),
      subscribeCompanyCollection<Purchase>('purchases', tenant, setPurchases),
      subscribeCompanyCollection<AppNotification>('notifications', tenant, setNotifications),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [tenant]);

  // Compute real-time smart operational alerts strictly from live database state
  const smartAlerts = useMemo<SmartAlert[]>(() => {
    const alerts: SmartAlert[] = [];
    const defaultThreshold = settings?.lowStockThresholdGrams ?? 250;

    // 1. Filamentos com estoque baixo
    materials.forEach((mat) => {
      const available = mat.currentWeightGrams - mat.reservedWeightGrams;
      const threshold = mat.minStockGrams > 0 ? mat.minStockGrams : defaultThreshold;
      if (available <= threshold) {
        alerts.push({
          id: `low_${mat.id}`,
          title: `Estoque baixo: ${mat.name}`,
          message: `Disponível: ${formatGrams(Math.max(0, available))} (mínimo: ${formatGrams(threshold)}).`,
          category: 'estoque_baixo',
          severity: available <= threshold * 0.4 ? 'danger' : 'warning',
          targetSection: 'inventory',
          targetId: mat.id,
        });
      }
    });

    // 2. Pedidos atrasados e próximos do prazo
    orders.forEach((ord) => {
      if (ord.status === 'entregue' || ord.status === 'cancelado') return;
      const days = diffDaysFromToday(ord.expectedDeliveryDate);
      if (days === null) return;
      if (days < 0) {
        alerts.push({
          id: `late_${ord.id}`,
          title: `Pedido atrasado: ${ord.orderNumber}`,
          message: `${ord.customerName} · Entrega prevista para ${formatDateBR(ord.expectedDeliveryDate)}.`,
          category: 'pedido_atrasado',
          severity: 'danger',
          targetSection: 'orders',
          targetId: ord.id,
        });
      } else if (days <= 2) {
        alerts.push({
          id: `near_${ord.id}`,
          title: `Prazo próximo: ${ord.orderNumber}`,
          message: `${ord.customerName} · Entrega ${days === 0 ? 'hoje' : `em ${days} dia(s)`}.`,
          category: 'prazo_proximo',
          severity: 'warning',
          targetSection: 'orders',
          targetId: ord.id,
        });
      }
    });

    // 3. Manutenções pendentes
    maintenanceRecords
      .filter((m) => m.status === 'pendente')
      .forEach((m) => {
        alerts.push({
          id: `mnt_${m.id}`,
          title: `Manutenção pendente: ${m.printerName}`,
          message: m.description,
          category: 'manutencao',
          severity: m.type === 'falha' ? 'danger' : 'warning',
          targetSection: 'printers',
          targetId: m.printerId,
        });
      });

    printers.forEach((prt) => {
      if (prt.nextMaintenanceDate) {
        const days = diffDaysFromToday(prt.nextMaintenanceDate);
        if (days !== null && days <= 3) {
          alerts.push({
            id: `prt_due_${prt.id}`,
            title: `Manutenção programada: ${prt.name}`,
            message:
              days < 0
                ? `Vencida em ${formatDateBR(prt.nextMaintenanceDate)}.`
                : `Agendada para ${formatDateBR(prt.nextMaintenanceDate)}.`,
            category: 'manutencao',
            severity: days < 0 ? 'danger' : 'warning',
            targetSection: 'printers',
            targetId: prt.id,
          });
        }
      }
    });

    // 4. Contas vencendo / atrasadas
    expenses
      .filter((e) => e.status === 'pendente' || e.status === 'atrasado')
      .forEach((exp) => {
        const days = diffDaysFromToday(exp.dueDate);
        if (days !== null && days <= 3) {
          alerts.push({
            id: `exp_${exp.id}`,
            title: days < 0 ? `Conta vencida: ${exp.description}` : `Conta vencendo: ${exp.description}`,
            message: `Vencimento em ${formatDateBR(exp.dueDate)} · R$ ${exp.amount.toFixed(2).replace('.', ',')}.`,
            category: 'conta_vencendo',
            severity: days < 0 ? 'danger' : 'warning',
            targetSection: 'financial',
            targetId: exp.id,
          });
        }
      });

    // 5. Impressões com falha recentes (sem reimpressão resolvida ou últimas falhas)
    productionJobs
      .filter((j) => j.status === 'falha_impressao')
      .slice(0, 5)
      .forEach((job) => {
        const hasReprint = productionJobs.some((other) => other.parentJobId === job.id);
        if (!hasReprint) {
          alerts.push({
            id: `fail_${job.id}`,
            title: `Falha na impressão: ${job.productName}`,
            message: `${job.printerName || 'Impressora'} · ${job.failureReason || 'Necessita reimpressão.'}`,
            category: 'falha_impressao',
            severity: 'danger',
            targetSection: 'production',
            targetId: job.id,
          });
        }
      });

    return alerts;
  }, [materials, orders, maintenanceRecords, printers, expenses, productionJobs, settings]);

  const value: ErpContextValue = {
    user,
    authReady,
    bootstrapping,
    authError,
    domainStatus,
    recheckAuthorizedDomain,
    signInWithGoogle,
    logout,
    profile,
    company,
    settings,
    tenant,
    activeSection,
    setActiveSection,
    selectedCustomerId,
    setSelectedCustomerId,
    quickActionTrigger,
    triggerQuickAction,
    customers,
    products,
    materials,
    inventoryMovements,
    printers,
    maintenanceRecords,
    quotes,
    orders,
    productionJobs,
    transactions,
    expenses,
    suppliers,
    purchases,
    notifications,
    members,
    smartAlerts,
    toasts,
    showToast,
    dismissToast,
  };

  return <ErpContext.Provider value={value}>{children}</ErpContext.Provider>;
};

export function useErp(): ErpContextValue {
  const ctx = useContext(ErpContext);
  if (!ctx) {
    throw new Error('useErp deve ser usado dentro de ErpProvider.');
  }
  return ctx;
}
