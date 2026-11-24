import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Product } from '../types/erp';
import { createEntityId } from '../utils/formatters';
import {
  cleanNum,
  cleanSignedNum,
  cleanStr,
  fetchCompanyCollection,
  subscribeCompanyCollection,
  type TenantContext,
} from './firestoreBase';

export async function fetchProducts(tenant: TenantContext): Promise<Product[]> {
  return fetchCompanyCollection<Product>('products', tenant);
}

export function subscribeProducts(
  tenant: TenantContext,
  onData: (items: Product[]) => void,
  onError?: (friendlyMessage: string) => void
) {
  return subscribeCompanyCollection<Product>('products', tenant, onData, onError);
}

export async function saveProduct(
  tenant: TenantContext,
  data: Omit<Product, 'id' | 'companyId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('prd');
  const path = `products/${id}`;
  try {
    const payload = {
      name: cleanStr(data.name, 160),
      sku: cleanStr(data.sku, 60),
      description: cleanStr(data.description, 2000),
      photoUrls: (data.photoUrls || [])
        .slice(0, 8)
        .map((u) => cleanStr(u, 600))
        .filter(Boolean),
      category: cleanStr(data.category, 80),
      modelFileUrl: cleanStr(data.modelFileUrl, 600),
      modelFileName: cleanStr(data.modelFileName, 160),
      material: cleanStr(data.material, 60),
      color: cleanStr(data.color, 60),
      estimatedWeightGrams: cleanNum(data.estimatedWeightGrams, 0),
      estimatedLengthMeters: cleanNum(data.estimatedLengthMeters, 0),
      estimatedTimeMinutes: Math.round(cleanNum(data.estimatedTimeMinutes, 0)),
      recommendedPrinterId: cleanStr(data.recommendedPrinterId, 128),
      recommendedPrinterName: cleanStr(data.recommendedPrinterName, 120),
      manufacturingCost: cleanNum(data.manufacturingCost, 0),
      salePrice: cleanNum(data.salePrice, 0),
      profitMargin: cleanSignedNum(data.profitMargin, 0),
      isCustom: Boolean(data.isCustom),
      status: data.status === 'inativo' ? 'inativo' : 'ativo',
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
