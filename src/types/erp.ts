import type { Timestamp } from 'firebase/firestore';

export type NavSectionId =
  | 'dashboard'
  | 'orders'
  | 'quotes'
  | 'customers'
  | 'products'
  | 'production'
  | 'printers'
  | 'inventory'
  | 'calculator'
  | 'financial'
  | 'purchases'
  | 'suppliers'
  | 'reports'
  | 'settings';

export type UserRole = 'owner' | 'manager' | 'operator' | 'viewer';

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  companyId: string;
  role: UserRole;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Company {
  id: string;
  ownerUid: string;
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  logoUrl: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  ownerUid: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ativo' | 'convidado' | 'inativo';
  permissions: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MaterialDensityConfig {
  densityGcm3: number;
  gramsPerMeter175: number;
  gramsPerMeter285: number;
}

export interface CompanySettings {
  id: string;
  companyId: string;
  ownerUid: string;
  energyTariffPerKwh: number;
  defaultProfitMargin: number;
  defaultPaymentFeePercent: number;
  defaultHourlyLaborRate: number;
  defaultPackagingCost: number;
  lowStockThresholdGrams: number;
  currency: string;
  orderCounter: number;
  quoteCounter: number;
  purchaseCounter: number;
  materialTypes: string[];
  expenseCategories: string[];
  materialDensities: Record<string, MaterialDensityConfig>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Customer {
  id: string;
  companyId: string;
  ownerUid: string;
  fullName: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  notes: string;
  isArchived: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Product {
  id: string;
  companyId: string;
  ownerUid: string;
  name: string;
  sku: string;
  description: string;
  photoUrls: string[];
  category: string;
  modelFileUrl: string;
  modelFileName: string;
  material: string;
  color: string;
  estimatedWeightGrams: number;
  estimatedLengthMeters: number;
  estimatedTimeMinutes: number;
  recommendedPrinterId: string;
  recommendedPrinterName: string;
  manufacturingCost: number;
  salePrice: number;
  profitMargin: number;
  isCustom: boolean;
  status: 'ativo' | 'inativo';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Material {
  id: string;
  companyId: string;
  ownerUid: string;
  name: string;
  brand: string;
  materialType: string;
  color: string;
  colorHex: string;
  diameterMm: 1.75 | 2.85;
  initialWeightGrams: number;
  currentWeightGrams: number;
  reservedWeightGrams: number;
  emptySpoolWeightGrams: number;
  acquisitionPrice: number;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  minStockGrams: number;
  storageLocation: string;
  gramsPerMeter: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type InventoryMovementType =
  | 'entrada'
  | 'consumo'
  | 'desperdicio'
  | 'ajuste'
  | 'devolucao'
  | 'reserva'
  | 'liberacao_reserva';

export interface InventoryMovement {
  id: string;
  companyId: string;
  ownerUid: string;
  materialId: string;
  materialName: string;
  type: InventoryMovementType;
  quantityGrams: number;
  previousWeightGrams: number;
  newWeightGrams: number;
  unitCostPerGram: number;
  totalCost: number;
  referenceType: 'compra' | 'producao' | 'pedido' | 'manual';
  referenceId: string;
  idempotencyKey: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type PrinterStatus = 'disponivel' | 'imprimindo' | 'em_manutencao' | 'inativa';

export interface Printer {
  id: string;
  companyId: string;
  ownerUid: string;
  name: string;
  manufacturer: string;
  model: string;
  technology: string;
  filamentDiameterMm: 1.75 | 2.85;
  serialNumber: string;
  acquisitionDate: string;
  acquisitionValue: number;
  estimatedLifespanHours: number;
  averagePowerWatts: number;
  status: PrinterStatus;
  accumulatedHours: number;
  totalPrintCount: number;
  totalFailureCount: number;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MaintenanceRecord {
  id: string;
  companyId: string;
  ownerUid: string;
  printerId: string;
  printerName: string;
  type: 'preventiva' | 'corretiva' | 'calibracao' | 'falha';
  description: string;
  cost: number;
  date: string;
  nextDueDate: string;
  status: 'pendente' | 'concluida';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  materialId: string;
  materialName: string;
  color: string;
  printerId: string;
  printerName: string;
  quantity: number;
  weightGrams: number;
  lengthMeters: number;
  printTimeMinutes: number;
  materialCost: number;
  energyCost: number;
  depreciationCost: number;
  laborCost: number;
  packagingCost: number;
  extraCost: number;
  totalUnitCost: number;
  desiredMarginPercent: number;
  paymentFeePercent: number;
  unitPrice: number;
  totalPrice: number;
}

export type QuoteStatus =
  | 'rascunho'
  | 'novo_orcamento'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'convertido'
  | 'rejeitado';

export interface Quote {
  id: string;
  companyId: string;
  ownerUid: string;
  quoteNumber: string;
  isSimulation: boolean;
  customerId: string;
  customerName: string;
  title: string;
  items: QuoteItem[];
  discount: number;
  shipping: number;
  totalCost: number;
  totalPrice: number;
  estimatedProfit: number;
  profitMarginPercent: number;
  validUntil: string;
  status: QuoteStatus;
  convertedOrderId: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  isCustom: boolean;
  materialId: string;
  materialName: string;
  color: string;
  printerId: string;
  printerName: string;
  quantity: number;
  weightGrams: number;
  printTimeMinutes: number;
  unitCost: number;
  unitPrice: number;
  totalPrice: number;
}

export type OrderStatus =
  | 'novo_orcamento'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'aguardando_producao'
  | 'em_producao'
  | 'finalizado'
  | 'pronto_retirada'
  | 'enviado'
  | 'entregue'
  | 'cancelado';

export type PaymentStatus = 'pendente' | 'parcial' | 'pago' | 'cancelado';

export interface Order {
  id: string;
  companyId: string;
  ownerUid: string;
  orderNumber: string;
  quoteId: string;
  customerId: string;
  customerName: string;
  expectedDeliveryDate: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  totalValue: number;
  totalCost: number;
  paidAmount: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  productionGenerated: boolean;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ProductionStatus =
  | 'aguardando_producao'
  | 'na_fila'
  | 'preparando_impressao'
  | 'imprimindo'
  | 'pausado'
  | 'falha_impressao'
  | 'finalizado'
  | 'cancelado';

export interface ProductionJob {
  id: string;
  companyId: string;
  ownerUid: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  customerId: string;
  customerName: string;
  printerId: string;
  printerName: string;
  materialId: string;
  materialName: string;
  color: string;
  quantity: number;
  plannedWeightGrams: number;
  actualWeightGrams: number;
  wasteWeightGrams: number;
  reservedWeightGrams: number;
  estimatedMinutes: number;
  actualMinutes: number;
  startedAt: string;
  estimatedFinishAt: string;
  finishedAt: string;
  operatorName: string;
  status: ProductionStatus;
  stockDeducted: boolean;
  materialReserved: boolean;
  costRecorded: boolean;
  actualMaterialCost: number;
  actualEnergyCost: number;
  actualDepreciationCost: number;
  totalActualCost: number;
  attemptNumber: number;
  parentJobId: string;
  failureReason: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type FinancialStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelado';

export interface Transaction {
  id: string;
  companyId: string;
  ownerUid: string;
  type: 'receita' | 'despesa';
  category: string;
  description: string;
  amount: number;
  dueDate: string;
  paymentDate: string;
  paymentMethod: string;
  status: FinancialStatus;
  orderId: string;
  orderNumber: string;
  purchaseId: string;
  isProductionCost: boolean;
  idempotencyKey: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Expense {
  id: string;
  companyId: string;
  ownerUid: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  paymentDate: string;
  paymentMethod: string;
  status: FinancialStatus;
  orderId: string;
  purchaseId: string;
  supplierId: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Supplier {
  id: string;
  companyId: string;
  ownerUid: string;
  name: string;
  document: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PurchaseItem {
  id: string;
  materialId: string;
  description: string;
  materialType: string;
  color: string;
  diameterMm: 1.75 | 2.85;
  spoolWeightGrams: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Purchase {
  id: string;
  companyId: string;
  ownerUid: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  shipping: number;
  totalValue: number;
  purchaseDate: string;
  paymentMethod: string;
  status: 'pendente' | 'recebido' | 'cancelado';
  stockUpdated: boolean;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AppNotification {
  id: string;
  companyId: string;
  ownerUid: string;
  title: string;
  message: string;
  type:
    | 'estoque_baixo'
    | 'prazo_proximo'
    | 'pedido_atrasado'
    | 'manutencao'
    | 'conta_vencendo'
    | 'falha_impressao'
    | 'sistema';
  severity: 'info' | 'warning' | 'danger';
  referenceId: string;
  isRead: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PricingInput {
  partName: string;
  printerAcquisitionValue: number;
  printerLifespanHours: number;
  printerPowerWatts: number;
  energyTariffPerKwh: number;
  filamentPricePerKg: number;
  inputMode: 'grams' | 'meters';
  weightGrams: number;
  lengthMeters: number;
  gramsPerMeter: number;
  printHours: number;
  printMinutes: number;
  quantity: number;
  laborCost: number;
  packagingCost: number;
  extraCosts: number;
  desiredMarginPercent: number;
  paymentFeePercent: number;
  simulatedSalePrice?: number | null;
}

export interface PricingResult {
  resolvedWeightGrams: number;
  resolvedLengthMeters: number;
  totalHours: number;
  filamentPricePerGram: number;
  materialCost: number;
  energyCost: number;
  depreciationCost: number;
  laborCost: number;
  packagingCost: number;
  extraCosts: number;
  totalCost: number;
  costPerUnit: number;
  suggestedPrice: number;
  suggestedUnitPrice: number;
  activeSalePrice: number;
  activeUnitPrice: number;
  paymentFeeAmount: number;
  estimatedProfit: number;
  effectiveMarginPercent: number;
}
