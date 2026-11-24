import {
  collection,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction as FirestoreTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  buildFirestoreErrorInfo,
  db,
  formatFirestoreErrorMessage,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type { Order, Quote } from '../types/erp';
import { createEntityId, DEFAULT_MATERIAL_DENSITIES } from '../utils/formatters';

export interface TenantContext {
  companyId: string;
  ownerUid: string;
}

export const DEFAULT_MATERIAL_TYPES = ['PLA', 'PLA+', 'PETG', 'ABS', 'TPU', 'ASA', 'Nylon', 'Resina'];

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Compra de Filamentos',
  'Manutenção',
  'Energia Elétrica',
  'Equipamentos',
  'Embalagens',
  'Marketing',
  'Internet',
  'Aluguel',
  'Outras Despesas',
];

export function buildDefaultSettingsPayload(companyId: string, ownerUid: string) {
  return {
    companyId,
    ownerUid,
    energyTariffPerKwh: 0.92,
    defaultProfitMargin: 45,
    defaultPaymentFeePercent: 3.5,
    defaultHourlyLaborRate: 25,
    defaultPackagingCost: 4.5,
    lowStockThresholdGrams: 250,
    currency: 'BRL',
    orderCounter: 0,
    quoteCounter: 0,
    purchaseCounter: 0,
    materialTypes: DEFAULT_MATERIAL_TYPES,
    expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
    materialDensities: DEFAULT_MATERIAL_DENSITIES,
  };
}

export function buildSettingsUpdateOrCreate(
  tx: FirestoreTransaction,
  settingsRef: DocumentReference,
  settingsSnap: DocumentSnapshot,
  tenant: TenantContext,
  counterUpdates: Partial<{ orderCounter: number; quoteCounter: number; purchaseCounter: number }>
): void {
  if (settingsSnap.exists()) {
    tx.update(settingsRef, {
      ...counterUpdates,
      updatedAt: serverTimestamp(),
    });
  } else {
    tx.set(settingsRef, {
      ...buildDefaultSettingsPayload(tenant.companyId, tenant.ownerUid),
      ...counterUpdates,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export function cleanStr(value: unknown, maxLen: number, fallback = ''): string {
  const s = String(value ?? fallback).trim();
  if (!s && fallback) return fallback.slice(0, maxLen);
  return s.slice(0, maxLen);
}

export function cleanNum(value: unknown, min = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, n) : min;
}

export function cleanSignedNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function subscribeCompanyCollection<T extends { id: string }>(
  collectionName: string,
  tenant: TenantContext,
  onData: (items: T[]) => void,
  onError?: (friendlyMessage: string) => void
): Unsubscribe {
  const q = query(
    collection(db, collectionName),
    where('companyId', '==', tenant.companyId),
    where('ownerUid', '==', tenant.ownerUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) } as T));
      onData(rows);
    },
    (error) => {
      const info = buildFirestoreErrorInfo(error, OperationType.LIST, collectionName);
      onError?.(formatFirestoreErrorMessage(new Error(JSON.stringify(info))));
    }
  );
}

export async function fetchCompanyCollection<T extends { id: string }>(
  collectionName: string,
  tenant: TenantContext,
  preferServer = true
): Promise<T[]> {
  const q = query(
    collection(db, collectionName),
    where('companyId', '==', tenant.companyId),
    where('ownerUid', '==', tenant.ownerUid)
  );
  try {
    const snap = preferServer ? await getDocsFromServer(q) : await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) } as T));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionName);
  }
}

export function sanitizeQuoteItems(items: Quote['items']): Quote['items'] {
  return (items || []).slice(0, 40).map((item) => {
    const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    const unitPrice = cleanNum(item.unitPrice, 0);
    return {
      id: cleanStr(item.id || createEntityId('qi'), 128),
      productId: cleanStr(item.productId || '', 128),
      productName: cleanStr(item.productName, 160, 'Peça 3D'),
      materialId: cleanStr(item.materialId || '', 128),
      materialName: cleanStr(item.materialName || '', 140),
      color: cleanStr(item.color || '', 60),
      printerId: cleanStr(item.printerId || '', 128),
      printerName: cleanStr(item.printerName || '', 120),
      quantity,
      weightGrams: cleanNum(item.weightGrams, 0),
      lengthMeters: cleanNum(item.lengthMeters, 0),
      printTimeMinutes: Math.round(cleanNum(item.printTimeMinutes, 0)),
      materialCost: cleanNum(item.materialCost, 0),
      energyCost: cleanNum(item.energyCost, 0),
      depreciationCost: cleanNum(item.depreciationCost, 0),
      laborCost: cleanNum(item.laborCost, 0),
      packagingCost: cleanNum(item.packagingCost, 0),
      extraCost: cleanNum(item.extraCost, 0),
      totalUnitCost: cleanNum(item.totalUnitCost, 0),
      desiredMarginPercent: cleanSignedNum(item.desiredMarginPercent, 0),
      paymentFeePercent: cleanNum(item.paymentFeePercent, 0),
      unitPrice,
      totalPrice: Number((quantity * unitPrice).toFixed(2)),
    };
  });
}

export function sanitizeOrderItems(items: Order['items']): Order['items'] {
  return (items || []).slice(0, 40).map((item) => {
    const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    const unitPrice = cleanNum(item.unitPrice, 0);
    const unitCost = cleanNum(item.unitCost, 0);
    return {
      id: cleanStr(item.id || createEntityId('oi'), 128),
      productId: cleanStr(item.productId || '', 128),
      productName: cleanStr(item.productName, 160, 'Peça 3D'),
      isCustom: Boolean(item.isCustom),
      materialId: cleanStr(item.materialId || '', 128),
      materialName: cleanStr(item.materialName || '', 140),
      color: cleanStr(item.color || '', 60),
      printerId: cleanStr(item.printerId || '', 128),
      printerName: cleanStr(item.printerName || '', 120),
      quantity,
      weightGrams: cleanNum(item.weightGrams, 0),
      printTimeMinutes: Math.round(cleanNum(item.printTimeMinutes, 0)),
      unitCost,
      unitPrice,
      totalPrice: Number((quantity * unitPrice).toFixed(2)),
    };
  });
}
