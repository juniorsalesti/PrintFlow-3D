import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  auth,
  checkAuthorizedDomain,
  firebaseAuthConsoleUrl,
  formatFirestoreErrorMessage,
  googleProvider,
  type DomainAuthorizationCheck,
} from '../lib/firebase';
import {
  ensureCompanyBootstrap,
  fetchCompanyMembers,
  subscribeCompanyMembers,
  subscribeSingleDoc,
} from '../services/companyService';
import { fetchCustomers, subscribeCustomers } from '../services/customerService';
import {
  fetchExpenses,
  fetchPurchases,
  fetchSuppliers,
  fetchTransactions,
  subscribeExpenses,
  subscribePurchases,
  subscribeSuppliers,
  subscribeTransactions,
} from '../services/financeService';
import { subscribeCompanyCollection, type TenantContext } from '../services/firestoreBase';
import {
  fetchInventoryMovements,
  fetchMaterials,
  subscribeInventoryMovements,
  subscribeMaterials,
} from '../services/inventoryService';
import { fetchOrders, subscribeOrders } from '../services/orderService';
import {
  fetchMaintenanceRecords,
  fetchPrinters,
  subscribeMaintenanceRecords,
  subscribePrinters,
} from '../services/printerService';
import { fetchProducts, subscribeProducts } from '../services/productService';
import { fetchProductionJobs, subscribeProductionJobs } from '../services/productionService';
import { fetchQuotes, subscribeQuotes } from '../services/quoteService';
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

export type ErpCollectionKey =
  | 'customers'
  | 'products'
  | 'materials'
  | 'inventoryMovements'
  | 'printers'
  | 'maintenanceRecords'
  | 'quotes'
  | 'orders'
  | 'productionJobs'
  | 'transactions'
  | 'expenses'
  | 'suppliers'
  | 'purchases'
  | 'notifications'
  | 'members';

const SECTION_COLLECTIONS: Record<NavSectionId, ErpCollectionKey[]> = {
  dashboard: [
    'orders',
    'quotes',
    'productionJobs',
    'transactions',
    'expenses',
    'materials',
    'printers',
    'maintenanceRecords',
  ],
  customers: ['customers', 'orders', 'quotes'],
  products: ['products', 'printers', 'orders', 'productionJobs', 'materials'],
  calculator: ['printers', 'materials', 'products', 'customers'],
  quotes: ['quotes', 'customers', 'products', 'printers', 'materials'],
  orders: ['orders', 'customers', 'products', 'printers', 'materials', 'productionJobs', 'transactions'],
  production: ['productionJobs', 'orders', 'printers', 'materials', 'products'],
  printers: ['printers', 'maintenanceRecords', 'productionJobs'],
  inventory: ['materials', 'inventoryMovements', 'suppliers'],
  financial: ['transactions', 'expenses', 'orders', 'suppliers', 'purchases'],
  purchases: ['purchases', 'suppliers', 'materials'],
  suppliers: ['suppliers', 'purchases', 'materials'],
  reports: [
    'orders',
    'quotes',
    'productionJobs',
    'transactions',
    'expenses',
    'materials',
    'printers',
    'products',
    'customers',
  ],
  settings: ['members'],
};

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
  retryBootstrap: () => Promise<void>;
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
  // Data lifecycle states
  isSectionLoading: boolean;
  sectionError: string | null;
  refreshCurrentSection: () => Promise<void>;
  isCollectionLoading: (key: ErpCollectionKey) => boolean;
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

  const [loadingMap, setLoadingMap] = useState<Partial<Record<ErpCollectionKey, boolean>>>({});
  const [errorMap, setErrorMap] = useState<Partial<Record<ErpCollectionKey, string>>>({});
  const [sectionFetching, setSectionFetching] = useState(false);
  const refreshSeqRef = useRef(0);

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
        const currentHost =
          status.currentHost || (typeof window !== 'undefined' ? window.location.hostname : '');
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
        friendlyMsg =
          'O pop-up de login foi bloqueado pelo navegador. Libere os pop-ups para este site e tente novamente.';
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
    setLoadingMap({});
    setErrorMap({});
  }, []);

  const runBootstrap = useCallback(async (currentUser: User) => {
    setBootstrapping(true);
    setAuthError(null);
    try {
      const boot = await ensureCompanyBootstrap(currentUser);
      setProfile(boot.profile);
      setCompany(boot.company);
      setSettings(boot.settings);
    } catch (err) {
      setProfile(null);
      setCompany(null);
      setSettings(null);
      setAuthError(formatFirestoreErrorMessage(err, 'Erro ao inicializar empresa.'));
    } finally {
      setBootstrapping(false);
      setAuthReady(true);
    }
  }, []);

  const retryBootstrap = useCallback(async () => {
    if (!auth.currentUser) return;
    await runBootstrap(auth.currentUser);
  }, [runBootstrap]);

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

      await runBootstrap(currentUser);
    });
    return () => unsub();
  }, [runBootstrap]);

  // Stabilize tenant solely on primitive identity keys so snapshot updates to
  // company metadata never tear down or reset active Firestore listeners.
  const companyId = company?.id;
  const ownerUid = company?.ownerUid;
  const tenant = useMemo<TenantContext | null>(() => {
    if (!companyId || !ownerUid) return null;
    return { companyId, ownerUid };
  }, [companyId, ownerUid]);

  const markCollectionLoaded = useCallback((key: ErpCollectionKey) => {
    setLoadingMap((prev) => (prev[key] === false ? prev : { ...prev, [key]: false }));
    setErrorMap((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const markCollectionError = useCallback((key: ErpCollectionKey, message: string) => {
    setLoadingMap((prev) => ({ ...prev, [key]: false }));
    setErrorMap((prev) => ({ ...prev, [key]: message }));
  }, []);

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
      setLoadingMap({});
      setErrorMap({});
      return;
    }

    setLoadingMap({
      customers: true,
      products: true,
      materials: true,
      inventoryMovements: true,
      printers: true,
      maintenanceRecords: true,
      quotes: true,
      orders: true,
      productionJobs: true,
      transactions: true,
      expenses: true,
      suppliers: true,
      purchases: true,
      notifications: true,
      members: true,
    });
    setErrorMap({});

    const unsubs = [
      subscribeSingleDoc<Company>('companies', tenant.companyId, (docData) => {
        if (docData) setCompany(docData);
      }),
      subscribeSingleDoc<CompanySettings>('settings', tenant.companyId, (docData) => {
        if (docData) setSettings(docData);
      }),
      subscribeCompanyMembers(
        tenant,
        (items) => {
          setMembers(items);
          markCollectionLoaded('members');
        },
        (msg) => markCollectionError('members', msg)
      ),
      subscribeCustomers(
        tenant,
        (items) => {
          setCustomers(items);
          markCollectionLoaded('customers');
        },
        (msg) => markCollectionError('customers', msg)
      ),
      subscribeProducts(
        tenant,
        (items) => {
          setProducts(items);
          markCollectionLoaded('products');
        },
        (msg) => markCollectionError('products', msg)
      ),
      subscribeMaterials(
        tenant,
        (items) => {
          setMaterials(items);
          markCollectionLoaded('materials');
        },
        (msg) => markCollectionError('materials', msg)
      ),
      subscribeInventoryMovements(
        tenant,
        (items) => {
          setInventoryMovements(items);
          markCollectionLoaded('inventoryMovements');
        },
        (msg) => markCollectionError('inventoryMovements', msg)
      ),
      subscribePrinters(
        tenant,
        (items) => {
          setPrinters(items);
          markCollectionLoaded('printers');
        },
        (msg) => markCollectionError('printers', msg)
      ),
      subscribeMaintenanceRecords(
        tenant,
        (items) => {
          setMaintenanceRecords(items);
          markCollectionLoaded('maintenanceRecords');
        },
        (msg) => markCollectionError('maintenanceRecords', msg)
      ),
      subscribeQuotes(
        tenant,
        (items) => {
          setQuotes(items);
          markCollectionLoaded('quotes');
        },
        (msg) => markCollectionError('quotes', msg)
      ),
      subscribeOrders(
        tenant,
        (items) => {
          setOrders(items);
          markCollectionLoaded('orders');
        },
        (msg) => markCollectionError('orders', msg)
      ),
      subscribeProductionJobs(
        tenant,
        (items) => {
          setProductionJobs(items);
          markCollectionLoaded('productionJobs');
        },
        (msg) => markCollectionError('productionJobs', msg)
      ),
      subscribeTransactions(
        tenant,
        (items) => {
          setTransactions(items);
          markCollectionLoaded('transactions');
        },
        (msg) => markCollectionError('transactions', msg)
      ),
      subscribeExpenses(
        tenant,
        (items) => {
          setExpenses(items);
          markCollectionLoaded('expenses');
        },
        (msg) => markCollectionError('expenses', msg)
      ),
      subscribeSuppliers(
        tenant,
        (items) => {
          setSuppliers(items);
          markCollectionLoaded('suppliers');
        },
        (msg) => markCollectionError('suppliers', msg)
      ),
      subscribePurchases(
        tenant,
        (items) => {
          setPurchases(items);
          markCollectionLoaded('purchases');
        },
        (msg) => markCollectionError('purchases', msg)
      ),
      subscribeCompanyCollection<AppNotification>(
        'notifications',
        tenant,
        (items) => {
          setNotifications(items);
          markCollectionLoaded('notifications');
        },
        (msg) => markCollectionError('notifications', msg)
      ),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [tenant, markCollectionLoaded, markCollectionError]);

  const fetchCollectionByKey = useCallback(
    async (key: ErpCollectionKey, currentTenant: TenantContext) => {
      switch (key) {
        case 'customers':
          setCustomers(await fetchCustomers(currentTenant));
          break;
        case 'products':
          setProducts(await fetchProducts(currentTenant));
          break;
        case 'materials':
          setMaterials(await fetchMaterials(currentTenant, true));
          break;
        case 'inventoryMovements':
          setInventoryMovements(await fetchInventoryMovements(currentTenant, true));
          break;
        case 'printers':
          setPrinters(await fetchPrinters(currentTenant, true));
          break;
        case 'maintenanceRecords':
          setMaintenanceRecords(await fetchMaintenanceRecords(currentTenant, true));
          break;
        case 'quotes':
          setQuotes(await fetchQuotes(currentTenant));
          break;
        case 'orders':
          setOrders(await fetchOrders(currentTenant, true));
          break;
        case 'productionJobs':
          setProductionJobs(await fetchProductionJobs(currentTenant, true));
          break;
        case 'transactions':
          setTransactions(await fetchTransactions(currentTenant, true));
          break;
        case 'expenses':
          setExpenses(await fetchExpenses(currentTenant, true));
          break;
        case 'suppliers':
          setSuppliers(await fetchSuppliers(currentTenant, true));
          break;
        case 'purchases':
          setPurchases(await fetchPurchases(currentTenant, true));
          break;
        case 'members':
          setMembers(await fetchCompanyMembers(currentTenant));
          break;
        default:
          break;
      }
    },
    []
  );

  const refreshSectionData = useCallback(
    async (section: NavSectionId) => {
      if (!tenant) return;
      const keys = SECTION_COLLECTIONS[section] || [];
      if (keys.length === 0) return;

      const seq = ++refreshSeqRef.current;
      setSectionFetching(true);

      await Promise.all(
        keys.map(async (key) => {
          try {
            await fetchCollectionByKey(key, tenant);
            markCollectionLoaded(key);
          } catch (err) {
            markCollectionError(
              key,
              formatFirestoreErrorMessage(err, `Erro ao carregar dados de ${key}.`)
            );
          }
        })
      );

      if (refreshSeqRef.current === seq) {
        setSectionFetching(false);
      }
    },
    [tenant, fetchCollectionByKey, markCollectionLoaded, markCollectionError]
  );

  useEffect(() => {
    if (!tenant) return;
    void refreshSectionData(activeSection);
  }, [tenant, activeSection, refreshSectionData]);

  const refreshCurrentSection = useCallback(async () => {
    await refreshSectionData(activeSection);
  }, [refreshSectionData, activeSection]);

  const isCollectionLoading = useCallback(
    (key: ErpCollectionKey) => Boolean(loadingMap[key]),
    [loadingMap]
  );

  const isSectionLoading = useMemo(() => {
    if (!tenant) return false;
    const keys = SECTION_COLLECTIONS[activeSection] || [];
    return sectionFetching || keys.some((k) => Boolean(loadingMap[k]));
  }, [tenant, activeSection, sectionFetching, loadingMap]);

  const sectionError = useMemo(() => {
    const keys = SECTION_COLLECTIONS[activeSection] || [];
    for (const k of keys) {
      if (errorMap[k]) return errorMap[k] || null;
    }
    return null;
  }, [activeSection, errorMap]);

  const smartAlerts = useMemo<SmartAlert[]>(() => {
    const alerts: SmartAlert[] = [];
    const defaultThreshold = settings?.lowStockThresholdGrams ?? 250;

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
    retryBootstrap,
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
    isSectionLoading,
    sectionError,
    refreshCurrentSection,
    isCollectionLoading,
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
