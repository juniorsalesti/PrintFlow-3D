import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Customer } from '../types/erp';
import { createEntityId } from '../utils/formatters';
import {
  cleanStr,
  fetchCompanyCollection,
  subscribeCompanyCollection,
  type TenantContext,
} from './firestoreBase';

export async function fetchCustomers(tenant: TenantContext): Promise<Customer[]> {
  return fetchCompanyCollection<Customer>('customers', tenant);
}

export function subscribeCustomers(
  tenant: TenantContext,
  onData: (items: Customer[]) => void,
  onError?: (friendlyMessage: string) => void
) {
  return subscribeCompanyCollection<Customer>('customers', tenant, onData, onError);
}

export async function saveCustomer(
  tenant: TenantContext,
  data: Omit<Customer, 'id' | 'companyId' | 'ownerUid' | 'isArchived' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('cust');
  const path = `customers/${id}`;
  try {
    const cleanCustomer = {
      fullName: cleanStr(data.fullName, 140),
      document: cleanStr(data.document, 24),
      phone: cleanStr(data.phone, 30),
      whatsapp: cleanStr(data.whatsapp, 30),
      email: cleanStr(data.email, 160),
      address: cleanStr(data.address, 240),
      city: cleanStr(data.city, 100),
      state: cleanStr(data.state, 40),
      notes: cleanStr(data.notes, 1000),
    };
    if (existingId) {
      await updateDoc(doc(db, 'customers', id), {
        ...cleanCustomer,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'customers', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        ...cleanCustomer,
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
