import {
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  Expense,
  Material,
  Purchase,
  Supplier,
  Transaction,
} from '../types/erp';
import { createEntityId, getTodayISO } from '../utils/formatters';
import {
  buildSettingsUpdateOrCreate,
  cleanNum,
  cleanStr,
  fetchCompanyCollection,
  subscribeCompanyCollection,
  type TenantContext,
} from './firestoreBase';

export async function fetchTransactions(
  tenant: TenantContext,
  preferServer = true
): Promise<Transaction[]> {
  return fetchCompanyCollection<Transaction>('transactions', tenant, preferServer);
}

export function subscribeTransactions(
  tenant: TenantContext,
  onData: (items: Transaction[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<Transaction>('transactions', tenant, onData, onError);
}

export async function fetchExpenses(
  tenant: TenantContext,
  preferServer = true
): Promise<Expense[]> {
  return fetchCompanyCollection<Expense>('expenses', tenant, preferServer);
}

export function subscribeExpenses(
  tenant: TenantContext,
  onData: (items: Expense[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<Expense>('expenses', tenant, onData, onError);
}

export async function fetchSuppliers(
  tenant: TenantContext,
  preferServer = true
): Promise<Supplier[]> {
  return fetchCompanyCollection<Supplier>('suppliers', tenant, preferServer);
}

export function subscribeSuppliers(
  tenant: TenantContext,
  onData: (items: Supplier[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<Supplier>('suppliers', tenant, onData, onError);
}

export async function fetchPurchases(
  tenant: TenantContext,
  preferServer = true
): Promise<Purchase[]> {
  return fetchCompanyCollection<Purchase>('purchases', tenant, preferServer);
}

export function subscribePurchases(
  tenant: TenantContext,
  onData: (items: Purchase[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<Purchase>('purchases', tenant, onData, onError);
}

export async function saveExpense(
  tenant: TenantContext,
  data: Omit<Expense, 'id' | 'companyId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('exp');
  const path = `expenses/${id}`;
  try {
    const dueDate = cleanStr(data.dueDate || getTodayISO(), 30);
    const payload = {
      description: cleanStr(data.description, 240),
      category: cleanStr(data.category, 80, 'Outras Despesas'),
      amount: cleanNum(data.amount, 0),
      dueDate,
      paymentDate: data.status === 'pago' ? cleanStr(data.paymentDate || getTodayISO(), 30) : '',
      paymentMethod: cleanStr(data.paymentMethod || 'PIX', 60, 'PIX'),
      status: data.status,
      supplierId: cleanStr(data.supplierId || '', 128),
      notes: cleanStr(data.notes || '', 600),
    };

    if (existingId) {
      await updateDoc(doc(db, 'expenses', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      const batch = writeBatch(db);
      batch.set(doc(db, 'expenses', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        ...payload,
        orderId: cleanStr(data.orderId || '', 128),
        purchaseId: cleanStr(data.purchaseId || '', 128),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const txId = createEntityId('trx');
      batch.set(doc(db, 'transactions', txId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        type: 'despesa',
        category: payload.category,
        description: payload.description,
        amount: payload.amount,
        dueDate: payload.dueDate,
        paymentDate: payload.paymentDate,
        paymentMethod: payload.paymentMethod,
        status: payload.status,
        orderId: cleanStr(data.orderId || '', 128),
        orderNumber: '',
        purchaseId: cleanStr(data.purchaseId || '', 128),
        isProductionCost: false,
        idempotencyKey: `exp_${id}`,
        notes: payload.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function saveTransaction(
  tenant: TenantContext,
  data: Omit<Transaction, 'id' | 'companyId' | 'ownerUid' | 'idempotencyKey' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('trx');
  const path = `transactions/${id}`;
  try {
    const dueDate = cleanStr(data.dueDate || getTodayISO(), 30);
    const paymentDate =
      data.status === 'pago' ? cleanStr(data.paymentDate || getTodayISO(), 30) : '';
    const cleanPayload = {
      description: cleanStr(data.description, 240),
      category: cleanStr(data.category, 80, data.type === 'receita' ? 'Vendas' : 'Outras Despesas'),
      amount: cleanNum(data.amount, 0),
      dueDate,
      paymentDate,
      paymentMethod: cleanStr(data.paymentMethod || 'PIX', 60, 'PIX'),
      status: data.status,
      notes: cleanStr(data.notes || '', 600),
    };

    if (existingId) {
      await updateDoc(doc(db, 'transactions', id), {
        ...cleanPayload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'transactions', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        type: data.type,
        ...cleanPayload,
        orderId: cleanStr(data.orderId || '', 128),
        orderNumber: cleanStr(data.orderNumber || '', 40),
        purchaseId: cleanStr(data.purchaseId || '', 128),
        isProductionCost: Boolean(data.isProductionCost),
        idempotencyKey: `manual_${id}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteExpense(expenseId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `expenses/${expenseId}`);
  }
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'transactions', transactionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `transactions/${transactionId}`);
  }
}

export async function saveSupplier(
  tenant: TenantContext,
  data: Omit<Supplier, 'id' | 'companyId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('sup');
  const path = `suppliers/${id}`;
  try {
    const payload = {
      name: cleanStr(data.name, 140),
      document: cleanStr(data.document || '', 24),
      contactName: cleanStr(data.contactName || '', 120),
      phone: cleanStr(data.phone || '', 30),
      whatsapp: cleanStr(data.whatsapp || '', 30),
      email: cleanStr(data.email || '', 160),
      address: cleanStr(data.address || '', 240),
      notes: cleanStr(data.notes || '', 1000),
    };
    if (existingId) {
      await updateDoc(doc(db, 'suppliers', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'suppliers', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'suppliers', supplierId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `suppliers/${supplierId}`);
  }
}

function sanitizePurchaseItems(items: Purchase['items']): Purchase['items'] {
  return (items || []).slice(0, 40).map((item) => {
    const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    const unitPrice = cleanNum(item.unitPrice, 0);
    return {
      id: cleanStr(item.id || createEntityId('pi'), 128),
      materialId: cleanStr(item.materialId || '', 128),
      description: cleanStr(item.description, 160, 'Filamento'),
      materialType: cleanStr(item.materialType || 'PLA', 60),
      color: cleanStr(item.color || '', 60),
      diameterMm: Number(item.diameterMm) === 2.85 ? 2.85 : 1.75,
      spoolWeightGrams: cleanNum(item.spoolWeightGrams, 0),
      quantity,
      unitPrice,
      totalPrice: Number((quantity * unitPrice).toFixed(2)),
    };
  });
}

export async function savePurchase(
  tenant: TenantContext,
  data: Omit<
    Purchase,
    'id' | 'companyId' | 'ownerUid' | 'purchaseNumber' | 'stockUpdated' | 'createdAt' | 'updatedAt'
  >,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('cmp');
  const path = `purchases/${id}`;
  const cleanItems = sanitizePurchaseItems(data.items);
  const cleanSupplierId = cleanStr(data.supplierId || '', 128);
  const cleanSupplierName = cleanStr(data.supplierName || '', 140);
  const cleanShipping = cleanNum(data.shipping, 0);
  const cleanTotalValue = cleanNum(data.totalValue, 0);
  const cleanPurchaseDate = cleanStr(data.purchaseDate || getTodayISO(), 30);
  const cleanPaymentMethod = cleanStr(data.paymentMethod || 'PIX', 60, 'PIX');
  const cleanNotes = cleanStr(data.notes || '', 600);

  try {
    if (existingId) {
      await updateDoc(doc(db, 'purchases', id), {
        supplierId: cleanSupplierId,
        supplierName: cleanSupplierName,
        items: cleanItems,
        shipping: cleanShipping,
        totalValue: cleanTotalValue,
        purchaseDate: cleanPurchaseDate,
        paymentMethod: cleanPaymentMethod,
        notes: cleanNotes,
        updatedAt: serverTimestamp(),
      });
      return id;
    }

    await runTransaction(db, async (tx) => {
      const settingsRef = doc(db, 'settings', tenant.companyId);
      const settingsSnap = await tx.get(settingsRef);
      const nextNum = settingsSnap.exists()
        ? ((settingsSnap.data()?.purchaseCounter as number) || 0) + 1
        : 1;
      const purchaseNumber = `CMP-${String(nextNum).padStart(4, '0')}`;

      buildSettingsUpdateOrCreate(tx, settingsRef, settingsSnap, tenant, {
        purchaseCounter: nextNum,
      });

      tx.set(doc(db, 'purchases', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        purchaseNumber,
        supplierId: cleanSupplierId,
        supplierName: cleanSupplierName,
        items: cleanItems,
        shipping: cleanShipping,
        totalValue: cleanTotalValue,
        purchaseDate: cleanPurchaseDate,
        paymentMethod: cleanPaymentMethod,
        status: 'pendente',
        stockUpdated: false,
        notes: cleanNotes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function receivePurchaseAndUpdateStock(
  tenant: TenantContext,
  purchase: Purchase
): Promise<void> {
  const path = `purchases/${purchase.id}`;
  try {
    await runTransaction(db, async (tx) => {
      const purchaseRef = doc(db, 'purchases', purchase.id);
      const snap = await tx.get(purchaseRef);
      if (!snap.exists()) throw new Error('Compra não encontrada.');
      const current = snap.data() as Purchase;
      if (current.status !== 'pendente' || current.stockUpdated) {
        throw new Error('Esta compra já foi recebida ou cancelada.');
      }

      const linkedMaterialIds = Array.from(
        new Set(current.items.map((i) => i.materialId).filter(Boolean))
      );
      const matSnaps = new Map<string, Material>();
      for (const matId of linkedMaterialIds) {
        const mSnap = await tx.get(doc(db, 'materials', matId));
        if (mSnap.exists()) matSnaps.set(matId, mSnap.data() as Material);
      }

      for (const item of current.items) {
        const addedGrams = Number((item.spoolWeightGrams * item.quantity).toFixed(2));
        if (item.materialId && matSnaps.has(item.materialId)) {
          const mat = matSnaps.get(item.materialId)!;
          const newWeight = Number((mat.currentWeightGrams + addedGrams).toFixed(2));
          mat.currentWeightGrams = newWeight;

          tx.update(doc(db, 'materials', item.materialId), {
            currentWeightGrams: newWeight,
            acquisitionPrice: item.unitPrice,
            purchaseDate: cleanStr(current.purchaseDate || getTodayISO(), 30),
            supplierId: cleanStr(current.supplierId || mat.supplierId || '', 128),
            supplierName: cleanStr(current.supplierName || mat.supplierName || '', 140),
            updatedAt: serverTimestamp(),
          });

          const movId = createEntityId('mov');
          const unitCost =
            item.spoolWeightGrams > 0 ? item.unitPrice / item.spoolWeightGrams : 0;
          tx.set(doc(db, 'inventoryMovements', movId), {
            companyId: tenant.companyId,
            ownerUid: tenant.ownerUid,
            materialId: item.materialId,
            materialName: cleanStr(mat.name, 140, 'Material'),
            type: 'entrada',
            quantityGrams: addedGrams,
            previousWeightGrams: Number((newWeight - addedGrams).toFixed(2)),
            newWeightGrams: newWeight,
            unitCostPerGram: Number(unitCost.toFixed(4)),
            totalCost: Number(item.totalPrice.toFixed(2)),
            referenceType: 'compra',
            referenceId: purchase.id,
            idempotencyKey: `cmp_${purchase.id}_${item.id}`,
            notes: cleanStr(
              `Entrada via ${current.purchaseNumber} (${item.quantity}x ${item.spoolWeightGrams}g)`,
              500
            ),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      const expDesc = cleanStr(
        `Compra ${current.purchaseNumber} — ${current.supplierName || 'Fornecedor'}`,
        240
      );
      const expDue = cleanStr(current.purchaseDate || getTodayISO(), 30);
      const expMethod = cleanStr(current.paymentMethod || 'PIX', 60, 'PIX');
      const expNotes = cleanStr(current.notes || '', 600);

      const expId = createEntityId('exp');
      tx.set(doc(db, 'expenses', expId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        description: expDesc,
        category: 'Compra de Filamentos',
        amount: Number(current.totalValue.toFixed(2)),
        dueDate: expDue,
        paymentDate: getTodayISO(),
        paymentMethod: expMethod,
        status: 'pago',
        orderId: '',
        purchaseId: purchase.id,
        supplierId: cleanStr(current.supplierId || '', 128),
        notes: expNotes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const txId = createEntityId('trx');
      tx.set(doc(db, 'transactions', txId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        type: 'despesa',
        category: 'Compra de Filamentos',
        description: expDesc,
        amount: Number(current.totalValue.toFixed(2)),
        dueDate: expDue,
        paymentDate: getTodayISO(),
        paymentMethod: expMethod,
        status: 'pago',
        orderId: '',
        orderNumber: '',
        purchaseId: purchase.id,
        isProductionCost: false,
        idempotencyKey: `cmp_exp_${purchase.id}`,
        notes: expNotes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(purchaseRef, {
        status: 'recebido',
        stockUpdated: true,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Firestore')) throw error;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
