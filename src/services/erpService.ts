export type { TenantContext } from './firestoreBase';
export {
  DEFAULT_MATERIAL_TYPES,
  DEFAULT_EXPENSE_CATEGORIES,
  subscribeCompanyCollection,
  fetchCompanyCollection,
} from './firestoreBase';

export {
  ensureCompanyBootstrap,
  subscribeSingleDoc,
  subscribeCompanyMembers,
  fetchCompanyMembers,
  updateCompanyInfo,
  updateCompanySettings,
  saveCompanyMember,
  deleteCompanyMember,
  markNotificationRead,
  dismissNotification,
  createNotification,
} from './companyService';

export {
  fetchCustomers,
  subscribeCustomers,
  saveCustomer,
  deleteOrArchiveCustomer,
} from './customerService';

export {
  fetchProducts,
  subscribeProducts,
  saveProduct,
  deleteProduct,
} from './productService';

export {
  fetchMaterials,
  subscribeMaterials,
  fetchInventoryMovements,
  subscribeInventoryMovements,
  saveMaterial,
  recordInventoryAdjustment,
  deleteMaterial,
} from './inventoryService';

export {
  fetchPrinters,
  subscribePrinters,
  fetchMaintenanceRecords,
  subscribeMaintenanceRecords,
  savePrinter,
  recordMaintenance,
  completeMaintenanceRecord,
  deletePrinter,
} from './printerService';

export {
  fetchQuotes,
  subscribeQuotes,
  saveQuote,
  convertQuoteToOrder,
  deleteQuote,
} from './quoteService';

export {
  fetchOrders,
  subscribeOrders,
  saveOrder,
  generateProductionForOrder,
  updateOrderStatus,
  recordOrderPayment,
  cancelOrderAndRelease,
} from './orderService';

export {
  fetchProductionJobs,
  subscribeProductionJobs,
  createStandaloneProductionJob,
  moveProductionJobStage,
  startProductionJob,
  finishProductionJob,
  failProductionJobAndOptionalReprint,
} from './productionService';

export {
  fetchTransactions,
  subscribeTransactions,
  fetchExpenses,
  subscribeExpenses,
  fetchSuppliers,
  subscribeSuppliers,
  fetchPurchases,
  subscribePurchases,
  saveExpense,
  saveTransaction,
  deleteExpense,
  deleteTransaction,
  saveSupplier,
  deleteSupplier,
  savePurchase,
  receivePurchaseAndUpdateStock,
} from './financeService';
