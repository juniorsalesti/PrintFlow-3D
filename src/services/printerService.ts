import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { MaintenanceRecord, Printer } from '../types/erp';
import { createEntityId, getTodayISO } from '../utils/formatters';
import {
  cleanNum,
  cleanStr,
  fetchCompanyCollection,
  subscribeCompanyCollection,
  type TenantContext,
} from './firestoreBase';

export async function fetchPrinters(
  tenant: TenantContext,
  preferServer = true
): Promise<Printer[]> {
  return fetchCompanyCollection<Printer>('printers', tenant, preferServer);
}

export function subscribePrinters(
  tenant: TenantContext,
  onData: (items: Printer[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<Printer>('printers', tenant, onData, onError);
}

export async function fetchMaintenanceRecords(
  tenant: TenantContext,
  preferServer = true
): Promise<MaintenanceRecord[]> {
  return fetchCompanyCollection<MaintenanceRecord>('maintenanceRecords', tenant, preferServer);
}

export function subscribeMaintenanceRecords(
  tenant: TenantContext,
  onData: (items: MaintenanceRecord[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<MaintenanceRecord>('maintenanceRecords', tenant, onData, onError);
}

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
      name: cleanStr(data.name, 120),
      manufacturer: cleanStr(data.manufacturer || '', 80),
      model: cleanStr(data.model || '', 80),
      technology: cleanStr(data.technology, 40, 'FDM'),
      filamentDiameterMm: Number(data.filamentDiameterMm) === 2.85 ? 2.85 : 1.75,
      serialNumber: cleanStr(data.serialNumber || '', 80),
      acquisitionDate: cleanStr(data.acquisitionDate || '', 30),
      acquisitionValue: cleanNum(data.acquisitionValue, 0),
      estimatedLifespanHours: Math.max(1, cleanNum(data.estimatedLifespanHours, 1) || 3000),
      averagePowerWatts: cleanNum(data.averagePowerWatts, 0),
      status: data.status,
      lastMaintenanceDate: cleanStr(data.lastMaintenanceDate || '', 30),
      nextMaintenanceDate: cleanStr(data.nextMaintenanceDate || '', 30),
      notes: cleanStr(data.notes || '', 600),
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
    const cleanPrinterName = cleanStr(data.printerName, 120, 'Impressora');
    const cleanDesc = cleanStr(data.description, 1000);
    const cleanDate = cleanStr(data.date || getTodayISO(), 30);
    const cleanNextDate = cleanStr(data.nextDueDate || '', 30);
    const cost = cleanNum(data.cost, 0);

    batch.set(doc(db, 'maintenanceRecords', id), {
      companyId: tenant.companyId,
      ownerUid: tenant.ownerUid,
      printerId: cleanStr(data.printerId, 128),
      printerName: cleanPrinterName,
      type: data.type,
      description: cleanDesc,
      cost,
      date: cleanDate,
      nextDueDate: cleanNextDate,
      status: data.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const printerUpdates: Record<string, unknown> = {
      lastMaintenanceDate: data.status === 'concluida' ? cleanDate : '',
      nextMaintenanceDate: cleanNextDate,
      updatedAt: serverTimestamp(),
    };
    if (setPrinterStatus) {
      printerUpdates.status = setPrinterStatus;
    }
    batch.update(doc(db, 'printers', data.printerId), printerUpdates);

    if (cost > 0) {
      const expId = createEntityId('exp');
      const txId = createEntityId('trx');
      const payStatus = data.status === 'concluida' ? 'pago' : 'pendente';
      const desc = cleanStr(`Manutenção (${cleanPrinterName}): ${cleanDesc.slice(0, 80)}`, 240);
      batch.set(doc(db, 'expenses', expId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        description: desc,
        category: 'Manutenção',
        amount: cost,
        dueDate: cleanDate,
        paymentDate: data.status === 'concluida' ? cleanDate : '',
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
        description: desc,
        amount: cost,
        dueDate: cleanDate,
        paymentDate: data.status === 'concluida' ? cleanDate : '',
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
