import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
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
  Order,
  OrderStatus,
  Printer,
  Product,
  ProductionJob,
  ProductionStatus,
  Purchase,
  Quote,
  Supplier,
  Transaction,
  UserProfile,
} from '../types/erp';
import {
  createEntityId,
  DEFAULT_MATERIAL_DENSITIES,
  getTodayISO,
} from '../utils/formatters';

export interface TenantContext {
  companyId: string;
  ownerUid: string;
}

const DEFAULT_MATERIAL_TYPES = ['PLA', 'PLA+', 'PETG', 'ABS', 'TPU', 'ASA', 'Nylon', 'Resina'];
const DEFAULT_EXPENSE_CATEGORIES = [
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

export async function ensureCompanyBootstrap(user: User): Promise<{
  profile: UserProfile;
  company: Company;
  settings: CompanySettings;
}> {
  const uid = user.uid;
  const userRef = doc(db, 'users', uid);
  const companyRef = doc(db, 'companies', uid);
  const settingsRef = doc(db, 'settings', uid);

  try {
    const companySnap = await getDoc(companyRef);
    if (!companySnap.exists()) {
      await setDoc(companyRef, {
        ownerUid: uid,
        name: user.displayName ? `${user.displayName} 3D Studio` : 'PrintFlow 3D Studio',
        cnpj: '',
        phone: '',
        email: user.email || '',
        address: '',
        logoUrl: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid,
        email: user.email || 'usuario@printflow3d.com',
        displayName: user.displayName || user.email?.split('@')[0] || 'Gestor',
        photoURL: user.photoURL || '',
        companyId: uid,
        role: 'owner',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        companyId: uid,
        ownerUid: uid,
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Ensure initial printer Creality Ender 3 V2 exists when workspace has zero printers
    const printersQuery = query(
      collection(db, 'printers'),
      where('companyId', '==', uid),
      where('ownerUid', '==', uid)
    );
    const printersSnap = await getDocs(printersQuery);
    if (printersSnap.empty) {
      const starterPrinterId = createEntityId('prt');
      await setDoc(doc(db, 'printers', starterPrinterId), {
        companyId: uid,
        ownerUid: uid,
        name: 'Ender 3 V2',
        manufacturer: 'Creality',
        model: 'Ender 3 V2',
        technology: 'FDM',
        filamentDiameterMm: 1.75,
        serialNumber: '',
        acquisitionDate: getTodayISO(),
        acquisitionValue: 1650,
        estimatedLifespanHours: 3000,
        averagePowerWatts: 150,
        status: 'disponivel',
        accumulatedHours: 0,
        totalPrintCount: 0,
        totalFailureCount: 0,
        lastMaintenanceDate: '',
        nextMaintenanceDate: '',
        notes: 'Impressora inicial padrão configurada automaticamente.',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const [finalUser, finalCompany, finalSettings] = await Promise.all([
      getDoc(userRef),
      getDoc(companyRef),
      getDoc(settingsRef),
    ]);

    return {
      profile: { id: finalUser.id, ...(finalUser.data() as Omit<UserProfile, 'id'>) },
      company: { id: finalCompany.id, ...(finalCompany.data() as Omit<Company, 'id'>) },
      settings: { id: finalSettings.id, ...(finalSettings.data() as Omit<CompanySettings, 'id'>) },
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'bootstrap');
  }
}

export function subscribeCompanyCollection<T extends { id: string }>(
  collectionName: string,
  tenant: TenantContext,
  onData: (items: T[]) => void
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
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}

export function subscribeCompanyMembers(
  tenant: TenantContext,
  onData: (items: CompanyMember[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'companies', tenant.companyId, 'members'),
    where('ownerUid', '==', tenant.ownerUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompanyMember, 'id'>) }))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `companies/${tenant.companyId}/members`);
    }
  );
}

export function subscribeSingleDoc<T extends { id: string }>(
  collectionName: string,
  docId: string,
  onData: (item: T | null) => void
): Unsubscribe {
  const ref = doc(db, collectionName, docId);
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<T, 'id'>) } as T) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${docId}`);
    }
  );
}

// ============================================================================
// GENERIC CRUD HELPERS (STRICT TIMESTAMPS & TENANT KEYS)
// ============================================================================

export async function updateCompanyInfo(
  companyId: string,
  data: Partial<Pick<Company, 'name' | 'cnpj' | 'phone' | 'email' | 'address' | 'logoUrl'>>
): Promise<void> {
  const path = `companies/${companyId}`;
  try {
    await updateDoc(doc(db, 'companies', companyId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCompanySettings(
  companyId: string,
  data: Partial<
    Pick<
      CompanySettings,
      | 'energyTariffPerKwh'
      | 'defaultProfitMargin'
      | 'defaultPaymentFeePercent'
      | 'defaultHourlyLaborRate'
      | 'defaultPackagingCost'
      | 'lowStockThresholdGrams'
      | 'currency'
      | 'materialTypes'
      | 'expenseCategories'
      | 'materialDensities'
    >
  >
): Promise<void> {
  const path = `settings/${companyId}`;
  try {
    await updateDoc(doc(db, 'settings', companyId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveCompanyMember(
  tenant: TenantContext,
  data: Omit<CompanyMember, 'id' | 'companyId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('mbr');
  const path = `companies/${tenant.companyId}/members/${id}`;
  try {
    if (existingId) {
      await updateDoc(doc(db, 'companies', tenant.companyId, 'members', id), {
        ...data,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'companies', tenant.companyId, 'members', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCompanyMember(companyId: string, memberId: string): Promise<void> {
  const path = `companies/${companyId}/members/${memberId}`;
  try {
    await deleteDoc(doc(db, 'companies', companyId, 'members', memberId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// CUSTOMERS
export async function saveCustomer(
  tenant: TenantContext,
  data: Omit<Customer, 'id' | 'companyId' | 'ownerUid' | 'isArchived' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('cust');
  const path = `customers/${id}`;
  try {
    if (existingId) {
      await updateDoc(doc(db, 'customers', id), {
        fullName: data.fullName.trim(),
        document: data.document.trim(),
        phone: data.phone.trim(),
        whatsapp: data.whatsapp.trim(),
        email: data.email.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
        state: data.state.trim(),
        notes: data.notes.trim(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'customers', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        fullName: data.fullName.trim(),
        document: data.document.trim(),
        phone: data.phone.trim(),
        whatsapp: data.whatsapp.trim(),
        email: data.email.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
        state: data.state.trim(),
        notes: data.notes.trim(),
        isArchived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteOrArchiveCustomer(
  customerId: string,
  hasHistoricalRecords: boolean
): Promise<'deleted' | 'archived'> {
  const path = `customers/${customerId}`;
  try {
    if (hasHistoricalRecords) {
      await updateDoc(doc(db, 'customers', customerId), {
        isArchived: true,
        updatedAt: serverTimestamp(),
      });
      return 'archived';
    }
    await deleteDoc(doc(db, 'customers', customerId));
    return 'deleted';
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// PRODUCTS
export async function saveProduct(
  tenant: TenantContext,
  data: Omit<Product, 'id' | 'companyId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('prd');
  const path = `products/${id}`;
  try {
    const payload = {
      name: data.name.trim(),
      sku: data.sku.trim(),
      description: data.description.trim(),
      photoUrls: data.photoUrls || [],
      category: data.category.trim(),
      modelFileUrl: data.modelFileUrl || '',
      modelFileName: data.modelFileName || '',
      material: data.material.trim(),
      color: data.color.trim(),
      estimatedWeightGrams: Number(data.estimatedWeightGrams) || 0,
      estimatedLengthMeters: Number(data.estimatedLengthMeters) || 0,
      estimatedTimeMinutes: Number(data.estimatedTimeMinutes) || 0,
      recommendedPrinterId: data.recommendedPrinterId || '',
      recommendedPrinterName: data.recommendedPrinterName || '',
      manufacturingCost: Number(data.manufacturingCost) || 0,
      salePrice: Number(data.salePrice) || 0,
      profitMargin: Number(data.profitMargin) || 0,
      isCustom: Boolean(data.isCustom),
      status: data.status,
    };
    if (existingId) {
      await updateDoc(doc(db, 'products', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'products', id), {
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

export async function deleteProduct(productId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
  }
}

// MATERIALS & INVENTORY MOVEMENTS
export async function saveMaterial(
  tenant: TenantContext,
  data: Omit<Material, 'id' | 'companyId' | 'ownerUid' | 'reservedWeightGrams' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('mat');
  const path = `materials/${id}`;
  try {
    if (existingId) {
      await updateDoc(doc(db, 'materials', id), {
        name: data.name.trim(),
        brand: data.brand.trim(),
        materialType: data.materialType.trim(),
        color: data.color.trim(),
        colorHex: data.colorHex || '#F97316',
        diameterMm: data.diameterMm === 2.85 ? 2.85 : 1.75,
        initialWeightGrams: Number(data.initialWeightGrams) || 1000,
        emptySpoolWeightGrams: Number(data.emptySpoolWeightGrams) || 0,
        acquisitionPrice: Number(data.acquisitionPrice) || 0,
        supplierId: data.supplierId || '',
        supplierName: data.supplierName || '',
        purchaseDate: data.purchaseDate || getTodayISO(),
        minStockGrams: Number(data.minStockGrams) || 0,
        storageLocation: data.storageLocation.trim(),
        gramsPerMeter: Math.max(0.1, Number(data.gramsPerMeter) || 2.98),
        updatedAt: serverTimestamp(),
      });
    } else {
      const initialW = Math.max(0, Number(data.initialWeightGrams) || 1000);
      const currentW = Math.max(0, Number(data.currentWeightGrams) || initialW);
      const batch = writeBatch(db);
      const matRef = doc(db, 'materials', id);
      batch.set(matRef, {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        name: data.name.trim(),
        brand: data.brand.trim(),
        materialType: data.materialType.trim(),
        color: data.color.trim(),
        colorHex: data.colorHex || '#F97316',
        diameterMm: data.diameterMm === 2.85 ? 2.85 : 1.75,
        initialWeightGrams: initialW,
        currentWeightGrams: currentW,
        reservedWeightGrams: 0,
        emptySpoolWeightGrams: Number(data.emptySpoolWeightGrams) || 0,
        acquisitionPrice: Number(data.acquisitionPrice) || 0,
        supplierId: data.supplierId || '',
        supplierName: data.supplierName || '',
        purchaseDate: data.purchaseDate || getTodayISO(),
        minStockGrams: Number(data.minStockGrams) || 0,
        storageLocation: data.storageLocation.trim(),
        gramsPerMeter: Math.max(0.1, Number(data.gramsPerMeter) || 2.98),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (currentW > 0) {
        const movId = createEntityId('mov');
        const unitCost = initialW > 0 ? (Number(data.acquisitionPrice) || 0) / initialW : 0;
        batch.set(doc(db, 'inventoryMovements', movId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          materialId: id,
          materialName: data.name.trim(),
          type: 'entrada',
          quantityGrams: currentW,
          previousWeightGrams: 0,
          newWeightGrams: currentW,
          unitCostPerGram: Number(unitCost.toFixed(4)),
          totalCost: Number((unitCost * currentW).toFixed(2)),
          referenceType: 'manual',
          referenceId: id,
          idempotencyKey: `init_${id}`,
          notes: 'Cadastro inicial de rolo/estoque',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function recordInventoryAdjustment(
  tenant: TenantContext,
  materialId: string,
  type: 'entrada' | 'consumo' | 'desperdicio' | 'ajuste' | 'devolucao',
  quantityGrams: number,
  notes: string,
  allowNegativeAuthorization = false
): Promise<void> {
  const path = `materials/${materialId}`;
  try {
    await runTransaction(db, async (tx) => {
      const matRef = doc(db, 'materials', materialId);
      const snap = await tx.get(matRef);
      if (!snap.exists()) throw new Error('Material não encontrado.');
      const mat = snap.data() as Material;
      const qty = Number(quantityGrams) || 0;
      let newWeight = mat.currentWeightGrams;

      if (type === 'entrada' || type === 'devolucao') {
        newWeight = mat.currentWeightGrams + Math.abs(qty);
      } else if (type === 'consumo' || type === 'desperdicio') {
        newWeight = mat.currentWeightGrams - Math.abs(qty);
      } else if (type === 'ajuste') {
        newWeight = qty;
      }

      if (newWeight < 0) {
        if (!allowNegativeAuthorization) {
          throw new Error(
            'Operação bloqueada: o estoque não pode ficar negativo sem autorização explícita de ajuste.'
          );
        }
        newWeight = 0;
      }

      const unitCost =
        mat.initialWeightGrams > 0 ? mat.acquisitionPrice / mat.initialWeightGrams : 0;
      const delta = Math.abs(newWeight - mat.currentWeightGrams);

      tx.update(matRef, {
        currentWeightGrams: Number(newWeight.toFixed(2)),
        reservedWeightGrams: mat.reservedWeightGrams,
        updatedAt: serverTimestamp(),
      });

      const movId = createEntityId('mov');
      tx.set(doc(db, 'inventoryMovements', movId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        materialId,
        materialName: mat.name,
        type,
        quantityGrams: Number(delta.toFixed(2)),
        previousWeightGrams: mat.currentWeightGrams,
        newWeightGrams: Number(newWeight.toFixed(2)),
        unitCostPerGram: Number(unitCost.toFixed(4)),
        totalCost: Number((delta * unitCost).toFixed(2)),
        referenceType: 'manual',
        referenceId: materialId,
        idempotencyKey: `adj_${movId}`,
        notes: notes.trim() || `Movimentação manual (${type})`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Operação bloqueada')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMaterial(materialId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'materials', materialId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `materials/${materialId}`);
  }
}

// PRINTERS & MAINTENANCE
export async function savePrinter(
  tenant: TenantContext,
  data: Omit<
    Printer,
    | 'id'
    | 'companyId'
    | 'ownerUid'
    | 'accumulatedHours'
    | 'totalPrintCount'
    | 'totalFailureCount'
    | 'createdAt'
    | 'updatedAt'
  >,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('prt');
  const path = `printers/${id}`;
  try {
    const payload = {
      name: data.name.trim(),
      manufacturer: data.manufacturer.trim(),
      model: data.model.trim(),
      technology: data.technology.trim() || 'FDM',
      filamentDiameterMm: data.filamentDiameterMm === 2.85 ? 2.85 : 1.75,
      serialNumber: data.serialNumber.trim(),
      acquisitionDate: data.acquisitionDate || '',
      acquisitionValue: Number(data.acquisitionValue) || 0,
      estimatedLifespanHours: Math.max(1, Number(data.estimatedLifespanHours) || 3000),
      averagePowerWatts: Math.max(0, Number(data.averagePowerWatts) || 0),
      status: data.status,
      lastMaintenanceDate: data.lastMaintenanceDate || '',
      nextMaintenanceDate: data.nextMaintenanceDate || '',
      notes: data.notes.trim(),
    };
    if (existingId) {
      await updateDoc(doc(db, 'printers', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'printers', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        ...payload,
        accumulatedHours: 0,
        totalPrintCount: 0,
        totalFailureCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function recordMaintenance(
  tenant: TenantContext,
  data: Omit<MaintenanceRecord, 'id' | 'companyId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  setPrinterStatus?: Printer['status']
): Promise<string> {
  const id = createEntityId('mnt');
  const path = `maintenanceRecords/${id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'maintenanceRecords', id), {
      companyId: tenant.companyId,
      ownerUid: tenant.ownerUid,
      printerId: data.printerId,
      printerName: data.printerName,
      type: data.type,
      description: data.description.trim(),
      cost: Math.max(0, Number(data.cost) || 0),
      date: data.date || getTodayISO(),
      nextDueDate: data.nextDueDate || '',
      status: data.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const printerUpdates: Record<string, unknown> = {
      lastMaintenanceDate: data.status === 'concluida' ? data.date || getTodayISO() : '',
      nextMaintenanceDate: data.nextDueDate || '',
      updatedAt: serverTimestamp(),
    };
    if (setPrinterStatus) {
      printerUpdates.status = setPrinterStatus;
    }
    batch.update(doc(db, 'printers', data.printerId), printerUpdates);

    if (data.cost > 0) {
      const expId = createEntityId('exp');
      const txId = createEntityId('trx');
      const payStatus = data.status === 'concluida' ? 'pago' : 'pendente';
      batch.set(doc(db, 'expenses', expId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        description: `Manutenção (${data.printerName}): ${data.description.slice(0, 80)}`,
        category: 'Manutenção',
        amount: Number(data.cost),
        dueDate: data.date || getTodayISO(),
        paymentDate: data.status === 'concluida' ? data.date || getTodayISO() : '',
        paymentMethod: 'PIX',
        status: payStatus,
        orderId: '',
        purchaseId: '',
        supplierId: '',
        notes: `Registro de manutenção ${id}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'transactions', txId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        type: 'despesa',
        category: 'Manutenção',
        description: `Manutenção (${data.printerName}): ${data.description.slice(0, 80)}`,
        amount: Number(data.cost),
        dueDate: data.date || getTodayISO(),
        paymentDate: data.status === 'concluida' ? data.date || getTodayISO() : '',
        paymentMethod: 'PIX',
        status: payStatus,
        orderId: '',
        orderNumber: '',
        purchaseId: '',
        isProductionCost: false,
        idempotencyKey: `maint_${id}`,
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function completeMaintenanceRecord(
  recordId: string,
  printerId: string
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'maintenanceRecords', recordId), {
      status: 'concluida',
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'printers', printerId), {
      status: 'disponivel',
      lastMaintenanceDate: getTodayISO(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `maintenanceRecords/${recordId}`);
  }
}

export async function deletePrinter(printerId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'printers', printerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `printers/${printerId}`);
  }
}

// QUOTES & SIMULATIONS
export async function saveQuote(
  tenant: TenantContext,
  data: Omit<Quote, 'id' | 'companyId' | 'ownerUid' | 'quoteNumber' | 'convertedOrderId' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('orc');
  const path = `quotes/${id}`;
  try {
    if (existingId) {
      await updateDoc(doc(db, 'quotes', id), {
        customerId: data.customerId || '',
        customerName: data.customerName || '',
        title: data.title.trim(),
        items: data.items,
        discount: Number(data.discount) || 0,
        shipping: Number(data.shipping) || 0,
        totalCost: Number(data.totalCost) || 0,
        totalPrice: Number(data.totalPrice) || 0,
        estimatedProfit: Number(data.estimatedProfit) || 0,
        profitMarginPercent: Number(data.profitMarginPercent) || 0,
        validUntil: data.validUntil || '',
        status: data.status,
        notes: data.notes.trim(),
        updatedAt: serverTimestamp(),
      });
      return id;
    }

    await runTransaction(db, async (tx) => {
      const settingsRef = doc(db, 'settings', tenant.companyId);
      const settingsSnap = await tx.get(settingsRef);
      const nextNum = ((settingsSnap.data()?.quoteCounter as number) || 0) + 1;
      const prefix = data.isSimulation ? 'SIM' : 'ORC';
      const quoteNumber = `${prefix}-${String(nextNum).padStart(4, '0')}`;

      tx.update(settingsRef, {
        quoteCounter: nextNum,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'quotes', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        quoteNumber,
        isSimulation: Boolean(data.isSimulation),
        customerId: data.customerId || '',
        customerName: data.customerName || '',
        title: data.title.trim(),
        items: data.items,
        discount: Number(data.discount) || 0,
        shipping: Number(data.shipping) || 0,
        totalCost: Number(data.totalCost) || 0,
        totalPrice: Number(data.totalPrice) || 0,
        estimatedProfit: Number(data.estimatedProfit) || 0,
        profitMarginPercent: Number(data.profitMarginPercent) || 0,
        validUntil: data.validUntil || '',
        status: data.status,
        convertedOrderId: '',
        notes: data.notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function convertQuoteToOrder(
  tenant: TenantContext,
  quote: Quote,
  expectedDeliveryDate: string,
  paymentMethod: string,
  generateProductionImmediately: boolean
): Promise<string> {
  const orderId = createEntityId('ped');
  const path = `orders/${orderId}`;
  try {
    await runTransaction(db, async (tx) => {
      const quoteRef = doc(db, 'quotes', quote.id);
      const quoteSnap = await tx.get(quoteRef);
      if (!quoteSnap.exists()) throw new Error('Orçamento não encontrado.');
      const currentQuote = quoteSnap.data() as Quote;
      if (currentQuote.status === 'convertido') {
        throw new Error('Este orçamento já foi convertido em pedido.');
      }

      const settingsRef = doc(db, 'settings', tenant.companyId);
      const settingsSnap = await tx.get(settingsRef);
      const nextNum = ((settingsSnap.data()?.orderCounter as number) || 0) + 1;
      const orderNumber = `PED-${String(nextNum).padStart(4, '0')}`;

      const orderItems = quote.items.map((item) => ({
        id: item.id,
        productId: item.productId || '',
        productName: item.productName,
        isCustom: !item.productId,
        materialId: item.materialId || '',
        materialName: item.materialName || '',
        color: item.color || '',
        printerId: item.printerId || '',
        printerName: item.printerName || '',
        quantity: item.quantity,
        weightGrams: item.weightGrams,
        printTimeMinutes: item.printTimeMinutes,
        unitCost: item.totalUnitCost,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      }));

      const subtotal = orderItems.reduce((acc, i) => acc + i.totalPrice, 0);

      tx.update(settingsRef, {
        orderCounter: nextNum,
        updatedAt: serverTimestamp(),
      });

      tx.update(quoteRef, {
        status: 'convertido',
        convertedOrderId: orderId,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'orders', orderId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        orderNumber,
        quoteId: quote.id,
        customerId: quote.customerId || '',
        customerName: quote.customerName || 'Cliente Avulso',
        expectedDeliveryDate: expectedDeliveryDate || '',
        items: orderItems,
        subtotal: Number(subtotal.toFixed(2)),
        discount: Number(quote.discount) || 0,
        shipping: Number(quote.shipping) || 0,
        totalValue: Number(quote.totalPrice.toFixed(2)),
        totalCost: Number(quote.totalCost.toFixed(2)),
        paidAmount: 0,
        paymentMethod: paymentMethod || 'PIX',
        paymentStatus: 'pendente',
        status: generateProductionImmediately ? 'aguardando_producao' : 'aprovado',
        productionGenerated: generateProductionImmediately,
        notes: quote.notes || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (generateProductionImmediately) {
        orderItems.forEach((item) => {
          const jobId = createEntityId('job');
          tx.set(doc(db, 'productionJobs', jobId), {
            companyId: tenant.companyId,
            ownerUid: tenant.ownerUid,
            orderId,
            orderNumber,
            productId: item.productId,
            productName: item.productName,
            customerId: quote.customerId || '',
            customerName: quote.customerName || 'Cliente Avulso',
            printerId: item.printerId,
            printerName: item.printerName,
            materialId: item.materialId,
            materialName: item.materialName,
            color: item.color,
            quantity: item.quantity,
            plannedWeightGrams: Number(item.weightGrams) || 0,
            actualWeightGrams: 0,
            wasteWeightGrams: 0,
            reservedWeightGrams: 0,
            estimatedMinutes: Number(item.printTimeMinutes) || 0,
            actualMinutes: 0,
            startedAt: '',
            estimatedFinishAt: '',
            finishedAt: '',
            operatorName: '',
            status: 'aguardando_producao',
            stockDeducted: false,
            materialReserved: false,
            costRecorded: false,
            actualMaterialCost: 0,
            actualEnergyCost: 0,
            actualDepreciationCost: 0,
            totalActualCost: 0,
            attemptNumber: 1,
            parentJobId: '',
            failureReason: '',
            notes: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      }
    });

    return orderId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteQuote(quoteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'quotes', quoteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `quotes/${quoteId}`);
  }
}

// ORDERS
export async function saveOrder(
  tenant: TenantContext,
  data: Omit<
    Order,
    | 'id'
    | 'companyId'
    | 'ownerUid'
    | 'orderNumber'
    | 'paidAmount'
    | 'paymentStatus'
    | 'productionGenerated'
    | 'createdAt'
    | 'updatedAt'
  >,
  existingId?: string,
  generateProductionOnApprove = false
): Promise<string> {
  const id = existingId || createEntityId('ped');
  const path = `orders/${id}`;
  try {
    if (existingId) {
      await updateDoc(doc(db, 'orders', id), {
        customerId: data.customerId || '',
        customerName: data.customerName || 'Cliente Avulso',
        expectedDeliveryDate: data.expectedDeliveryDate || '',
        items: data.items,
        subtotal: Number(data.subtotal) || 0,
        discount: Number(data.discount) || 0,
        shipping: Number(data.shipping) || 0,
        totalValue: Number(data.totalValue) || 0,
        totalCost: Number(data.totalCost) || 0,
        paymentMethod: data.paymentMethod || 'PIX',
        notes: data.notes.trim(),
        updatedAt: serverTimestamp(),
      });
      return id;
    }

    await runTransaction(db, async (tx) => {
      const settingsRef = doc(db, 'settings', tenant.companyId);
      const settingsSnap = await tx.get(settingsRef);
      const nextNum = ((settingsSnap.data()?.orderCounter as number) || 0) + 1;
      const orderNumber = `PED-${String(nextNum).padStart(4, '0')}`;

      const shouldGenerate =
        generateProductionOnApprove &&
        (data.status === 'aprovado' || data.status === 'aguardando_producao');

      tx.update(settingsRef, {
        orderCounter: nextNum,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'orders', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        orderNumber,
        quoteId: data.quoteId || '',
        customerId: data.customerId || '',
        customerName: data.customerName || 'Cliente Avulso',
        expectedDeliveryDate: data.expectedDeliveryDate || '',
        items: data.items,
        subtotal: Number(data.subtotal) || 0,
        discount: Number(data.discount) || 0,
        shipping: Number(data.shipping) || 0,
        totalValue: Number(data.totalValue) || 0,
        totalCost: Number(data.totalCost) || 0,
        paidAmount: 0,
        paymentMethod: data.paymentMethod || 'PIX',
        paymentStatus: 'pendente',
        status: shouldGenerate ? 'aguardando_producao' : data.status,
        productionGenerated: shouldGenerate,
        notes: data.notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (shouldGenerate) {
        data.items.forEach((item) => {
          const jobId = createEntityId('job');
          tx.set(doc(db, 'productionJobs', jobId), {
            companyId: tenant.companyId,
            ownerUid: tenant.ownerUid,
            orderId: id,
            orderNumber,
            productId: item.productId || '',
            productName: item.productName,
            customerId: data.customerId || '',
            customerName: data.customerName || 'Cliente Avulso',
            printerId: item.printerId || '',
            printerName: item.printerName || '',
            materialId: item.materialId || '',
            materialName: item.materialName || '',
            color: item.color || '',
            quantity: Math.max(1, item.quantity),
            plannedWeightGrams: Number(item.weightGrams) || 0,
            actualWeightGrams: 0,
            wasteWeightGrams: 0,
            reservedWeightGrams: 0,
            estimatedMinutes: Number(item.printTimeMinutes) || 0,
            actualMinutes: 0,
            startedAt: '',
            estimatedFinishAt: '',
            finishedAt: '',
            operatorName: '',
            status: 'aguardando_producao',
            stockDeducted: false,
            materialReserved: false,
            costRecorded: false,
            actualMaterialCost: 0,
            actualEnergyCost: 0,
            actualDepreciationCost: 0,
            totalActualCost: 0,
            attemptNumber: 1,
            parentJobId: '',
            failureReason: '',
            notes: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      }
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function generateProductionForOrder(
  tenant: TenantContext,
  order: Order
): Promise<number> {
  const path = `orders/${order.id}`;
  try {
    let createdCount = 0;
    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', order.id);
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error('Pedido não encontrado.');
      const current = snap.data() as Order;
      if (current.productionGenerated) {
        throw new Error('As tarefas de produção para este pedido já foram geradas.');
      }

      current.items.forEach((item) => {
        const jobId = createEntityId('job');
        tx.set(doc(db, 'productionJobs', jobId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          orderId: order.id,
          orderNumber: current.orderNumber,
          productId: item.productId || '',
          productName: item.productName,
          customerId: current.customerId || '',
          customerName: current.customerName || 'Cliente Avulso',
          printerId: item.printerId || '',
          printerName: item.printerName || '',
          materialId: item.materialId || '',
          materialName: item.materialName || '',
          color: item.color || '',
          quantity: Math.max(1, item.quantity),
          plannedWeightGrams: Number(item.weightGrams) || 0,
          actualWeightGrams: 0,
          wasteWeightGrams: 0,
          reservedWeightGrams: 0,
          estimatedMinutes: Number(item.printTimeMinutes) || 0,
          actualMinutes: 0,
          startedAt: '',
          estimatedFinishAt: '',
          finishedAt: '',
          operatorName: '',
          status: 'aguardando_producao',
          stockDeducted: false,
          materialReserved: false,
          costRecorded: false,
          actualMaterialCost: 0,
          actualEnergyCost: 0,
          actualDepreciationCost: 0,
          totalActualCost: 0,
          attemptNumber: 1,
          parentJobId: '',
          failureReason: '',
          notes: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        createdCount += 1;
      });

      tx.update(orderRef, {
        status: 'aguardando_producao',
        productionGenerated: true,
        updatedAt: serverTimestamp(),
      });
    });
    return createdCount;
  } catch (error) {
    if (error instanceof Error && error.message.includes('já foram geradas')) throw error;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function recordOrderPayment(
  tenant: TenantContext,
  orderId: string,
  paymentAmount: number,
  paymentMethod: string,
  paymentDate: string
): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error('Pedido não encontrado.');
      const order = snap.data() as Order;

      if (order.status === 'cancelado') {
        throw new Error('Não é possível registrar pagamento em pedido cancelado.');
      }

      const amount = Number(paymentAmount) || 0;
      if (amount <= 0) throw new Error('Informe um valor de pagamento maior que zero.');

      const remaining = Math.max(0, Number((order.totalValue - order.paidAmount).toFixed(2)));
      if (amount > remaining + 0.01) {
        throw new Error('O valor informado excede o saldo pendente do pedido.');
      }

      const newPaidAmount = Number(Math.min(order.totalValue, order.paidAmount + amount).toFixed(2));
      const newPaymentStatus =
        newPaidAmount >= order.totalValue - 0.01 ? 'pago' : 'parcial';

      const category =
        newPaymentStatus === 'parcial'
          ? 'Sinal de Pedido'
          : order.paidAmount > 0
            ? 'Pagamento Final'
            : 'Vendas';

      tx.update(orderRef, {
        paidAmount: newPaidAmount,
        paymentStatus: newPaymentStatus,
        paymentMethod: paymentMethod || order.paymentMethod || 'PIX',
        updatedAt: serverTimestamp(),
      });

      const txId = createEntityId('trx');
      tx.set(doc(db, 'transactions', txId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        type: 'receita',
        category,
        description: `Recebimento ${order.orderNumber} — ${order.customerName}`,
        amount: Number(amount.toFixed(2)),
        dueDate: paymentDate || getTodayISO(),
        paymentDate: paymentDate || getTodayISO(),
        paymentMethod: paymentMethod || order.paymentMethod || 'PIX',
        status: 'pago',
        orderId,
        orderNumber: order.orderNumber,
        purchaseId: '',
        isProductionCost: false,
        idempotencyKey: `pay_${orderId}_${txId}`,
        notes: newPaymentStatus === 'parcial' ? 'Pagamento parcial (sinal)' : 'Quitação de pedido',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Firestore')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cancelOrderAndRelease(
  tenant: TenantContext,
  order: Order,
  jobs: ProductionJob[]
): Promise<void> {
  const path = `orders/${order.id}`;
  try {
    const orderJobs = jobs.filter(
      (j) =>
        j.orderId === order.id &&
        j.status !== 'finalizado' &&
        j.status !== 'cancelado'
    );

    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', order.id);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) throw new Error('Pedido não encontrado.');

      // Read materials that need reservation release first
      const materialReleases = new Map<string, number>();
      for (const job of orderJobs) {
        if (job.materialReserved && job.materialId && job.reservedWeightGrams > 0) {
          materialReleases.set(
            job.materialId,
            (materialReleases.get(job.materialId) || 0) + job.reservedWeightGrams
          );
        }
      }

      const materialSnaps = new Map<string, Material>();
      for (const matId of materialReleases.keys()) {
        const snap = await tx.get(doc(db, 'materials', matId));
        if (snap.exists()) materialSnaps.set(matId, snap.data() as Material);
      }

      for (const [matId, releaseGrams] of materialReleases.entries()) {
        const mat = materialSnaps.get(matId);
        if (mat) {
          const updatedReserved = Math.max(0, Number((mat.reservedWeightGrams - releaseGrams).toFixed(2)));
          tx.update(doc(db, 'materials', matId), {
            currentWeightGrams: mat.currentWeightGrams,
            reservedWeightGrams: updatedReserved,
            updatedAt: serverTimestamp(),
          });

          const movId = createEntityId('mov');
          tx.set(doc(db, 'inventoryMovements', movId), {
            companyId: tenant.companyId,
            ownerUid: tenant.ownerUid,
            materialId: matId,
            materialName: mat.name,
            type: 'liberacao_reserva',
            quantityGrams: Number(releaseGrams.toFixed(2)),
            previousWeightGrams: mat.currentWeightGrams,
            newWeightGrams: mat.currentWeightGrams,
            unitCostPerGram: 0,
            totalCost: 0,
            referenceType: 'pedido',
            referenceId: order.id,
            idempotencyKey: `rel_${order.id}_${matId}_${movId}`,
            notes: `Liberação de reserva por cancelamento do ${order.orderNumber}`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      for (const job of orderJobs) {
        tx.update(doc(db, 'productionJobs', job.id), {
          status: 'cancelado',
          materialReserved: false,
          reservedWeightGrams: 0,
          notes: `${job.notes ? job.notes + ' · ' : ''}Cancelado junto ao pedido`,
          updatedAt: serverTimestamp(),
        });
        if (job.status === 'imprimindo' && job.printerId) {
          tx.update(doc(db, 'printers', job.printerId), {
            status: 'disponivel',
            updatedAt: serverTimestamp(),
          });
        }
      }

      tx.update(orderRef, {
        status: 'cancelado',
        paymentStatus: 'cancelado',
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// PRODUCTION JOBS (KANBAN, START, RESERVE, FINISH, FAIL, REPRINT)
// ============================================================================

export async function createStandaloneProductionJob(
  tenant: TenantContext,
  data: {
    orderId?: string;
    orderNumber?: string;
    productId?: string;
    productName: string;
    customerId?: string;
    customerName?: string;
    printerId?: string;
    printerName?: string;
    materialId?: string;
    materialName?: string;
    color?: string;
    quantity: number;
    plannedWeightGrams: number;
    estimatedMinutes: number;
    operatorName?: string;
    notes?: string;
  }
): Promise<string> {
  const id = createEntityId('job');
  const path = `productionJobs/${id}`;
  try {
    await setDoc(doc(db, 'productionJobs', id), {
      companyId: tenant.companyId,
      ownerUid: tenant.ownerUid,
      orderId: data.orderId || '',
      orderNumber: data.orderNumber || '',
      productId: data.productId || '',
      productName: data.productName.trim(),
      customerId: data.customerId || '',
      customerName: data.customerName || 'Produção Interna',
      printerId: data.printerId || '',
      printerName: data.printerName || '',
      materialId: data.materialId || '',
      materialName: data.materialName || '',
      color: data.color || '',
      quantity: Math.max(1, Number(data.quantity) || 1),
      plannedWeightGrams: Math.max(0, Number(data.plannedWeightGrams) || 0),
      actualWeightGrams: 0,
      wasteWeightGrams: 0,
      reservedWeightGrams: 0,
      estimatedMinutes: Math.max(0, Number(data.estimatedMinutes) || 0),
      actualMinutes: 0,
      startedAt: '',
      estimatedFinishAt: '',
      finishedAt: '',
      operatorName: data.operatorName || '',
      status: 'aguardando_producao',
      stockDeducted: false,
      materialReserved: false,
      costRecorded: false,
      actualMaterialCost: 0,
      actualEnergyCost: 0,
      actualDepreciationCost: 0,
      totalActualCost: 0,
      attemptNumber: 1,
      parentJobId: '',
      failureReason: '',
      notes: (data.notes || '').trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function moveProductionJobStage(
  jobId: string,
  newStatus: ProductionStatus
): Promise<void> {
  try {
    await updateDoc(doc(db, 'productionJobs', jobId), {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `productionJobs/${jobId}`);
  }
}

export async function startProductionJob(
  tenant: TenantContext,
  jobId: string,
  params: {
    printerId: string;
    printerName: string;
    materialId: string;
    materialName: string;
    color: string;
    operatorName: string;
    reserveMaterial: boolean;
  }
): Promise<void> {
  const path = `productionJobs/${jobId}`;
  try {
    await runTransaction(db, async (tx) => {
      const jobRef = doc(db, 'productionJobs', jobId);
      const jobSnap = await tx.get(jobRef);
      if (!jobSnap.exists()) throw new Error('Tarefa de produção não encontrada.');
      const job = jobSnap.data() as ProductionJob;

      if (job.status === 'finalizado' || job.status === 'cancelado') {
        throw new Error('Esta tarefa já foi encerrada.');
      }

      const printerRef = doc(db, 'printers', params.printerId);
      const printerSnap = await tx.get(printerRef);
      if (!printerSnap.exists()) throw new Error('Impressora selecionada não encontrada.');
      const printer = printerSnap.data() as Printer;

      if (printer.status === 'em_manutencao' || printer.status === 'inativa') {
        throw new Error(`A impressora ${printer.name} está ${printer.status.replace('_', ' ')}.`);
      }
      if (printer.status === 'imprimindo' && job.printerId !== params.printerId) {
        throw new Error(`A impressora ${printer.name} já está ocupada em outra impressão.`);
      }

      let mat: Material | null = null;
      const matRef = params.materialId ? doc(db, 'materials', params.materialId) : null;
      if (matRef) {
        const matSnap = await tx.get(matRef);
        if (matSnap.exists()) mat = matSnap.data() as Material;
      }

      const now = new Date();
      const estFinish = new Date(now.getTime() + (job.estimatedMinutes || 60) * 60000);
      let materialReserved = job.materialReserved;
      let reservedWeight = job.reservedWeightGrams;

      if (params.reserveMaterial && mat && matRef && !job.materialReserved && job.plannedWeightGrams > 0) {
        const available = mat.currentWeightGrams - mat.reservedWeightGrams;
        if (available < job.plannedWeightGrams) {
          throw new Error(
            `Estoque disponível insuficiente de ${mat.name}. Disponível: ${available.toFixed(1)} g, necessário: ${job.plannedWeightGrams.toFixed(1)} g.`
          );
        }
        const newReserved = Number((mat.reservedWeightGrams + job.plannedWeightGrams).toFixed(2));
        tx.update(matRef, {
          currentWeightGrams: mat.currentWeightGrams,
          reservedWeightGrams: newReserved,
          updatedAt: serverTimestamp(),
        });

        const movId = createEntityId('mov');
        tx.set(doc(db, 'inventoryMovements', movId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          materialId: params.materialId,
          materialName: mat.name,
          type: 'reserva',
          quantityGrams: job.plannedWeightGrams,
          previousWeightGrams: mat.currentWeightGrams,
          newWeightGrams: mat.currentWeightGrams,
          unitCostPerGram: 0,
          totalCost: 0,
          referenceType: 'producao',
          referenceId: jobId,
          idempotencyKey: `res_${jobId}`,
          notes: `Reserva para impressão: ${job.productName}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        materialReserved = true;
        reservedWeight = job.plannedWeightGrams;
      }

      tx.update(printerRef, {
        status: 'imprimindo',
        updatedAt: serverTimestamp(),
      });

      tx.update(jobRef, {
        printerId: params.printerId,
        printerName: params.printerName,
        materialId: params.materialId,
        materialName: params.materialName,
        color: params.color,
        operatorName: params.operatorName,
        status: 'imprimindo',
        startedAt: now.toISOString(),
        estimatedFinishAt: estFinish.toISOString(),
        materialReserved,
        reservedWeightGrams: reservedWeight,
        updatedAt: serverTimestamp(),
      });

      if (job.orderId) {
        tx.update(doc(db, 'orders', job.orderId), {
          status: 'em_producao',
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Firestore')) throw error;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function finishProductionJob(
  tenant: TenantContext,
  job: ProductionJob,
  settings: CompanySettings,
  params: {
    actualWeightGrams: number;
    wasteWeightGrams: number;
    actualMinutes: number;
    notes: string;
  }
): Promise<void> {
  const path = `productionJobs/${job.id}`;
  try {
    await runTransaction(db, async (tx) => {
      const jobRef = doc(db, 'productionJobs', job.id);
      const jobSnap = await tx.get(jobRef);
      if (!jobSnap.exists()) throw new Error('Tarefa de produção não encontrada.');
      const currentJob = jobSnap.data() as ProductionJob;

      if (currentJob.stockDeducted || currentJob.status === 'finalizado') {
        throw new Error('Esta tarefa já foi finalizada e o estoque já foi baixado.');
      }

      const printerRef = currentJob.printerId ? doc(db, 'printers', currentJob.printerId) : null;
      const printerSnap = printerRef ? await tx.get(printerRef) : null;
      const printer = printerSnap?.exists() ? (printerSnap.data() as Printer) : null;

      const matRef = currentJob.materialId ? doc(db, 'materials', currentJob.materialId) : null;
      const matSnap = matRef ? await tx.get(matRef) : null;
      const mat = matSnap?.exists() ? (matSnap.data() as Material) : null;

      const actualWeight = Math.max(0, Number(params.actualWeightGrams) || 0);
      const wasteWeight = Math.max(0, Number(params.wasteWeightGrams) || 0);
      const totalConsumed = Number((actualWeight + wasteWeight).toFixed(2));
      const actualMinutes = Math.max(1, Number(params.actualMinutes) || currentJob.estimatedMinutes || 1);
      const actualHours = actualMinutes / 60;

      let actualMaterialCost = 0;
      if (mat && matRef) {
        if (mat.currentWeightGrams < totalConsumed) {
          throw new Error(
            `Saldo insuficiente em ${mat.name} (${mat.currentWeightGrams.toFixed(1)} g) para baixar ${totalConsumed.toFixed(1)} g.`
          );
        }
        const unitCostPerGram =
          mat.initialWeightGrams > 0 ? mat.acquisitionPrice / mat.initialWeightGrams : 0;
        actualMaterialCost = Number((totalConsumed * unitCostPerGram).toFixed(2));

        const newCurrentWeight = Number((mat.currentWeightGrams - totalConsumed).toFixed(2));
        const newReservedWeight = currentJob.materialReserved
          ? Math.max(0, Number((mat.reservedWeightGrams - currentJob.reservedWeightGrams).toFixed(2)))
          : mat.reservedWeightGrams;

        tx.update(matRef, {
          currentWeightGrams: newCurrentWeight,
          reservedWeightGrams: newReservedWeight,
          updatedAt: serverTimestamp(),
        });

        if (actualWeight > 0) {
          const movId = createEntityId('mov');
          tx.set(doc(db, 'inventoryMovements', movId), {
            companyId: tenant.companyId,
            ownerUid: tenant.ownerUid,
            materialId: currentJob.materialId,
            materialName: mat.name,
            type: 'consumo',
            quantityGrams: actualWeight,
            previousWeightGrams: mat.currentWeightGrams,
            newWeightGrams: Number((mat.currentWeightGrams - actualWeight).toFixed(2)),
            unitCostPerGram: Number(unitCostPerGram.toFixed(4)),
            totalCost: Number((actualWeight * unitCostPerGram).toFixed(2)),
            referenceType: 'producao',
            referenceId: job.id,
            idempotencyKey: `cons_${job.id}`,
            notes: `Consumo na produção: ${currentJob.productName}`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (wasteWeight > 0) {
          const movWasteId = createEntityId('mov');
          tx.set(doc(db, 'inventoryMovements', movWasteId), {
            companyId: tenant.companyId,
            ownerUid: tenant.ownerUid,
            materialId: currentJob.materialId,
            materialName: mat.name,
            type: 'desperdicio',
            quantityGrams: wasteWeight,
            previousWeightGrams: Number((mat.currentWeightGrams - actualWeight).toFixed(2)),
            newWeightGrams: newCurrentWeight,
            unitCostPerGram: Number(unitCostPerGram.toFixed(4)),
            totalCost: Number((wasteWeight * unitCostPerGram).toFixed(2)),
            referenceType: 'producao',
            referenceId: job.id,
            idempotencyKey: `waste_${job.id}`,
            notes: `Desperdício/suporte na produção: ${currentJob.productName}`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      const energyCost = printer
        ? Number(
            (
              (printer.averagePowerWatts / 1000) *
              actualHours *
              (settings.energyTariffPerKwh || 0.92)
            ).toFixed(2)
          )
        : 0;

      const depreciationCost = printer
        ? Number(
            (
              (printer.acquisitionValue / Math.max(1, printer.estimatedLifespanHours)) *
              actualHours
            ).toFixed(2)
          )
        : 0;

      const totalActualCost = Number(
        (actualMaterialCost + energyCost + depreciationCost).toFixed(2)
      );

      if (printer && printerRef) {
        tx.update(printerRef, {
          status: 'disponivel',
          accumulatedHours: Number((printer.accumulatedHours + actualHours).toFixed(2)),
          totalPrintCount: printer.totalPrintCount + 1,
          totalFailureCount: printer.totalFailureCount,
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(jobRef, {
        status: 'finalizado',
        actualWeightGrams: actualWeight,
        wasteWeightGrams: wasteWeight,
        actualMinutes,
        finishedAt: new Date().toISOString(),
        stockDeducted: true,
        materialReserved: false,
        reservedWeightGrams: 0,
        costRecorded: true,
        actualMaterialCost,
        actualEnergyCost: energyCost,
        actualDepreciationCost: depreciationCost,
        totalActualCost,
        notes: params.notes.trim(),
        updatedAt: serverTimestamp(),
      });

      if (totalActualCost > 0 && !currentJob.costRecorded) {
        const txId = createEntityId('trx');
        tx.set(doc(db, 'transactions', txId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          type: 'despesa',
          category: 'Custo de Produção',
          description: `Custo real de produção: ${currentJob.productName} (${currentJob.orderNumber || 'Avulsa'})`,
          amount: totalActualCost,
          dueDate: getTodayISO(),
          paymentDate: getTodayISO(),
          paymentMethod: 'Interno',
          status: 'pago',
          orderId: currentJob.orderId || '',
          orderNumber: currentJob.orderNumber || '',
          purchaseId: '',
          isProductionCost: true,
          idempotencyKey: `prod_cost_${job.id}`,
          notes: `Material: ${actualMaterialCost} | Energia: ${energyCost} | Deprec.: ${depreciationCost}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    // Check if all jobs for the linked order are now finalized
    if (job.orderId) {
      const siblingQuery = query(
        collection(db, 'productionJobs'),
        where('companyId', '==', tenant.companyId),
        where('ownerUid', '==', tenant.ownerUid),
        where('orderId', '==', job.orderId)
      );
      const siblingSnap = await getDocs(siblingQuery);
      const activePending = siblingSnap.docs.some((d) => {
        const st = (d.data() as ProductionJob).status;
        return st !== 'finalizado' && st !== 'cancelado';
      });
      if (!activePending && siblingSnap.docs.length > 0) {
        await updateDoc(doc(db, 'orders', job.orderId), {
          status: 'finalizado',
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Firestore')) throw error;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function failProductionJobAndOptionalReprint(
  tenant: TenantContext,
  job: ProductionJob,
  settings: CompanySettings,
  params: {
    wasteWeightGrams: number;
    actualMinutes: number;
    failureReason: string;
    createReprint: boolean;
  }
): Promise<string | null> {
  const path = `productionJobs/${job.id}`;
  let reprintId: string | null = null;
  try {
    await runTransaction(db, async (tx) => {
      const jobRef = doc(db, 'productionJobs', job.id);
      const jobSnap = await tx.get(jobRef);
      if (!jobSnap.exists()) throw new Error('Tarefa não encontrada.');
      const currentJob = jobSnap.data() as ProductionJob;

      if (currentJob.status === 'finalizado' || currentJob.status === 'cancelado') {
        throw new Error('Tarefa já encerrada.');
      }

      const printerRef = currentJob.printerId ? doc(db, 'printers', currentJob.printerId) : null;
      const printerSnap = printerRef ? await tx.get(printerRef) : null;
      const printer = printerSnap?.exists() ? (printerSnap.data() as Printer) : null;

      const matRef = currentJob.materialId ? doc(db, 'materials', currentJob.materialId) : null;
      const matSnap = matRef ? await tx.get(matRef) : null;
      const mat = matSnap?.exists() ? (matSnap.data() as Material) : null;

      const waste = Math.max(0, Number(params.wasteWeightGrams) || 0);
      const mins = Math.max(0, Number(params.actualMinutes) || 0);
      const hrs = mins / 60;

      let wasteCost = 0;
      if (mat && matRef) {
        const unitCost = mat.initialWeightGrams > 0 ? mat.acquisitionPrice / mat.initialWeightGrams : 0;
        const deduct = Math.min(mat.currentWeightGrams, waste);
        wasteCost = Number((deduct * unitCost).toFixed(2));
        const newCurrent = Number((mat.currentWeightGrams - deduct).toFixed(2));
        const newReserved = currentJob.materialReserved
          ? Math.max(0, Number((mat.reservedWeightGrams - currentJob.reservedWeightGrams).toFixed(2)))
          : mat.reservedWeightGrams;

        tx.update(matRef, {
          currentWeightGrams: newCurrent,
          reservedWeightGrams: newReserved,
          updatedAt: serverTimestamp(),
        });

        if (deduct > 0) {
          const movId = createEntityId('mov');
          tx.set(doc(db, 'inventoryMovements', movId), {
            companyId: tenant.companyId,
            ownerUid: tenant.ownerUid,
            materialId: currentJob.materialId,
            materialName: mat.name,
            type: 'desperdicio',
            quantityGrams: deduct,
            previousWeightGrams: mat.currentWeightGrams,
            newWeightGrams: newCurrent,
            unitCostPerGram: Number(unitCost.toFixed(4)),
            totalCost: wasteCost,
            referenceType: 'producao',
            referenceId: job.id,
            idempotencyKey: `fail_waste_${job.id}`,
            notes: `Falha na impressão: ${params.failureReason}`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      const energyCost = printer
        ? Number(((printer.averagePowerWatts / 1000) * hrs * (settings.energyTariffPerKwh || 0.92)).toFixed(2))
        : 0;
      const depCost = printer
        ? Number(((printer.acquisitionValue / Math.max(1, printer.estimatedLifespanHours)) * hrs).toFixed(2))
        : 0;
      const totalCost = Number((wasteCost + energyCost + depCost).toFixed(2));

      if (printer && printerRef) {
        tx.update(printerRef, {
          status: 'disponivel',
          accumulatedHours: Number((printer.accumulatedHours + hrs).toFixed(2)),
          totalPrintCount: printer.totalPrintCount,
          totalFailureCount: printer.totalFailureCount + 1,
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(jobRef, {
        status: 'falha_impressao',
        actualWeightGrams: 0,
        wasteWeightGrams: waste,
        actualMinutes: mins,
        finishedAt: new Date().toISOString(),
        stockDeducted: true,
        materialReserved: false,
        reservedWeightGrams: 0,
        costRecorded: totalCost > 0,
        actualMaterialCost: wasteCost,
        actualEnergyCost: energyCost,
        actualDepreciationCost: depCost,
        totalActualCost: totalCost,
        failureReason: params.failureReason.trim(),
        notes: currentJob.notes,
        updatedAt: serverTimestamp(),
      });

      if (totalCost > 0) {
        const txId = createEntityId('trx');
        tx.set(doc(db, 'transactions', txId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          type: 'despesa',
          category: 'Falha / Desperdício',
          description: `Perda de impressão: ${currentJob.productName} (Tentativa #${currentJob.attemptNumber})`,
          amount: totalCost,
          dueDate: getTodayISO(),
          paymentDate: getTodayISO(),
          paymentMethod: 'Interno',
          status: 'pago',
          orderId: currentJob.orderId || '',
          orderNumber: currentJob.orderNumber || '',
          purchaseId: '',
          isProductionCost: true,
          idempotencyKey: `fail_cost_${job.id}`,
          notes: params.failureReason.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (params.createReprint) {
        reprintId = createEntityId('job');
        tx.set(doc(db, 'productionJobs', reprintId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          orderId: currentJob.orderId,
          orderNumber: currentJob.orderNumber,
          productId: currentJob.productId,
          productName: currentJob.productName,
          customerId: currentJob.customerId,
          customerName: currentJob.customerName,
          printerId: currentJob.printerId,
          printerName: currentJob.printerName,
          materialId: currentJob.materialId,
          materialName: currentJob.materialName,
          color: currentJob.color,
          quantity: currentJob.quantity,
          plannedWeightGrams: currentJob.plannedWeightGrams,
          actualWeightGrams: 0,
          wasteWeightGrams: 0,
          reservedWeightGrams: 0,
          estimatedMinutes: currentJob.estimatedMinutes,
          actualMinutes: 0,
          startedAt: '',
          estimatedFinishAt: '',
          finishedAt: '',
          operatorName: currentJob.operatorName,
          status: 'aguardando_producao',
          stockDeducted: false,
          materialReserved: false,
          costRecorded: false,
          actualMaterialCost: 0,
          actualEnergyCost: 0,
          actualDepreciationCost: 0,
          totalActualCost: 0,
          attemptNumber: currentJob.attemptNumber + 1,
          parentJobId: job.id,
          failureReason: '',
          notes: `Reimpressão após falha: ${params.failureReason.trim()}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
    return reprintId;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// FINANCIAL: TRANSACTIONS & EXPENSES
// ============================================================================

export async function saveExpense(
  tenant: TenantContext,
  data: Omit<Expense, 'id' | 'companyId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('exp');
  const path = `expenses/${id}`;
  try {
    const payload = {
      description: data.description.trim(),
      category: data.category.trim(),
      amount: Math.max(0, Number(data.amount) || 0),
      dueDate: data.dueDate || getTodayISO(),
      paymentDate: data.status === 'pago' ? data.paymentDate || getTodayISO() : '',
      paymentMethod: data.paymentMethod || 'PIX',
      status: data.status,
      supplierId: data.supplierId || '',
      notes: data.notes.trim(),
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
        orderId: data.orderId || '',
        purchaseId: data.purchaseId || '',
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
        orderId: data.orderId || '',
        orderNumber: '',
        purchaseId: data.purchaseId || '',
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
    if (existingId) {
      await updateDoc(doc(db, 'transactions', id), {
        description: data.description.trim(),
        category: data.category.trim(),
        amount: Math.max(0, Number(data.amount) || 0),
        dueDate: data.dueDate || getTodayISO(),
        paymentDate: data.status === 'pago' ? data.paymentDate || getTodayISO() : '',
        paymentMethod: data.paymentMethod || 'PIX',
        status: data.status,
        notes: data.notes.trim(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'transactions', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        type: data.type,
        category: data.category.trim(),
        description: data.description.trim(),
        amount: Math.max(0, Number(data.amount) || 0),
        dueDate: data.dueDate || getTodayISO(),
        paymentDate: data.status === 'pago' ? data.paymentDate || getTodayISO() : '',
        paymentMethod: data.paymentMethod || 'PIX',
        status: data.status,
        orderId: data.orderId || '',
        orderNumber: data.orderNumber || '',
        purchaseId: data.purchaseId || '',
        isProductionCost: Boolean(data.isProductionCost),
        idempotencyKey: `manual_${id}`,
        notes: data.notes.trim(),
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

// ============================================================================
// SUPPLIERS & PURCHASES
// ============================================================================

export async function saveSupplier(
  tenant: TenantContext,
  data: Omit<Supplier, 'id' | 'companyId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('sup');
  const path = `suppliers/${id}`;
  try {
    const payload = {
      name: data.name.trim(),
      document: data.document.trim(),
      contactName: data.contactName.trim(),
      phone: data.phone.trim(),
      whatsapp: data.whatsapp.trim(),
      email: data.email.trim(),
      address: data.address.trim(),
      notes: data.notes.trim(),
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
  try {
    if (existingId) {
      await updateDoc(doc(db, 'purchases', id), {
        supplierId: data.supplierId || '',
        supplierName: data.supplierName || '',
        items: data.items,
        shipping: Number(data.shipping) || 0,
        totalValue: Number(data.totalValue) || 0,
        purchaseDate: data.purchaseDate || getTodayISO(),
        paymentMethod: data.paymentMethod || 'PIX',
        notes: data.notes.trim(),
        updatedAt: serverTimestamp(),
      });
      return id;
    }

    await runTransaction(db, async (tx) => {
      const settingsRef = doc(db, 'settings', tenant.companyId);
      const settingsSnap = await tx.get(settingsRef);
      const nextNum = ((settingsSnap.data()?.purchaseCounter as number) || 0) + 1;
      const purchaseNumber = `CMP-${String(nextNum).padStart(4, '0')}`;

      tx.update(settingsRef, {
        purchaseCounter: nextNum,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'purchases', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        purchaseNumber,
        supplierId: data.supplierId || '',
        supplierName: data.supplierName || '',
        items: data.items,
        shipping: Number(data.shipping) || 0,
        totalValue: Number(data.totalValue) || 0,
        purchaseDate: data.purchaseDate || getTodayISO(),
        paymentMethod: data.paymentMethod || 'PIX',
        status: 'pendente',
        stockUpdated: false,
        notes: data.notes.trim(),
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
            purchaseDate: current.purchaseDate || getTodayISO(),
            supplierId: current.supplierId || mat.supplierId,
            supplierName: current.supplierName || mat.supplierName,
            updatedAt: serverTimestamp(),
          });

          const movId = createEntityId('mov');
          const unitCost =
            item.spoolWeightGrams > 0 ? item.unitPrice / item.spoolWeightGrams : 0;
          tx.set(doc(db, 'inventoryMovements', movId), {
            companyId: tenant.companyId,
            ownerUid: tenant.ownerUid,
            materialId: item.materialId,
            materialName: mat.name,
            type: 'entrada',
            quantityGrams: addedGrams,
            previousWeightGrams: Number((newWeight - addedGrams).toFixed(2)),
            newWeightGrams: newWeight,
            unitCostPerGram: Number(unitCost.toFixed(4)),
            totalCost: Number(item.totalPrice.toFixed(2)),
            referenceType: 'compra',
            referenceId: purchase.id,
            idempotencyKey: `cmp_${purchase.id}_${item.id}`,
            notes: `Entrada via ${current.purchaseNumber} (${item.quantity}x ${item.spoolWeightGrams}g)`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      const expId = createEntityId('exp');
      tx.set(doc(db, 'expenses', expId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        description: `Compra ${current.purchaseNumber} — ${current.supplierName || 'Fornecedor'}`,
        category: 'Compra de Filamentos',
        amount: Number(current.totalValue.toFixed(2)),
        dueDate: current.purchaseDate || getTodayISO(),
        paymentDate: getTodayISO(),
        paymentMethod: current.paymentMethod || 'PIX',
        status: 'pago',
        orderId: '',
        purchaseId: purchase.id,
        supplierId: current.supplierId || '',
        notes: current.notes || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const txId = createEntityId('trx');
      tx.set(doc(db, 'transactions', txId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        type: 'despesa',
        category: 'Compra de Filamentos',
        description: `Compra ${current.purchaseNumber} — ${current.supplierName || 'Fornecedor'}`,
        amount: Number(current.totalValue.toFixed(2)),
        dueDate: current.purchaseDate || getTodayISO(),
        paymentDate: getTodayISO(),
        paymentMethod: current.paymentMethod || 'PIX',
        status: 'pago',
        orderId: '',
        orderNumber: '',
        purchaseId: purchase.id,
        isProductionCost: false,
        idempotencyKey: `cmp_exp_${purchase.id}`,
        notes: current.notes || '',
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

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      isRead: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function dismissNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `notifications/${notificationId}`);
  }
}

export async function createNotification(
  tenant: TenantContext,
  data: Omit<AppNotification, 'id' | 'companyId' | 'ownerUid' | 'isRead' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const id = createEntityId('ntf');
  try {
    await setDoc(doc(db, 'notifications', id), {
      companyId: tenant.companyId,
      ownerUid: tenant.ownerUid,
      ...data,
      isRead: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notifications/${id}`);
  }
}
