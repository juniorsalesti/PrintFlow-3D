import {
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { InventoryMovement, Material } from '../types/erp';
import { createEntityId, getTodayISO } from '../utils/formatters';
import {
  cleanNum,
  cleanStr,
  fetchCompanyCollection,
  subscribeCompanyCollection,
  type TenantContext,
} from './firestoreBase';

export async function fetchMaterials(
  tenant: TenantContext,
  preferServer = true
): Promise<Material[]> {
  return fetchCompanyCollection<Material>('materials', tenant, preferServer);
}

export function subscribeMaterials(
  tenant: TenantContext,
  onData: (items: Material[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<Material>('materials', tenant, onData, onError);
}

export async function fetchInventoryMovements(
  tenant: TenantContext,
  preferServer = true
): Promise<InventoryMovement[]> {
  return fetchCompanyCollection<InventoryMovement>('inventoryMovements', tenant, preferServer);
}

export function subscribeInventoryMovements(
  tenant: TenantContext,
  onData: (items: InventoryMovement[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<InventoryMovement>('inventoryMovements', tenant, onData, onError);
}

export async function saveMaterial(
  tenant: TenantContext,
  data: Omit<Material, 'id' | 'companyId' | 'ownerUid' | 'reservedWeightGrams' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('mat');
  const path = `materials/${id}`;
  try {
    const cleanName = cleanStr(data.name, 140);
    const cleanBrand = cleanStr(data.brand || '', 80);
    const cleanMaterialType = cleanStr(data.materialType, 60, 'PLA');
    const cleanColor = cleanStr(data.color || '', 60);
    const cleanColorHex = cleanStr(data.colorHex || '#F97316', 20, '#F97316');
    const diameterMm = Number(data.diameterMm) === 2.85 ? 2.85 : 1.75;
    const initialW = cleanNum(data.initialWeightGrams, 0) || 1000;
    const emptySpoolW = cleanNum(data.emptySpoolWeightGrams, 0);
    const acqPrice = cleanNum(data.acquisitionPrice, 0);
    const supplierId = cleanStr(data.supplierId || '', 128);
    const supplierName = cleanStr(data.supplierName || '', 140);
    const purchaseDate = cleanStr(data.purchaseDate || getTodayISO(), 30);
    const minStockGrams = cleanNum(data.minStockGrams, 0);
    const storageLocation = cleanStr(data.storageLocation || '', 100);
    const gramsPerMeter = Math.max(0.1, cleanNum(data.gramsPerMeter, 0.1) || 2.98);

    if (existingId) {
      await updateDoc(doc(db, 'materials', id), {
        name: cleanName,
        brand: cleanBrand,
        materialType: cleanMaterialType,
        color: cleanColor,
        colorHex: cleanColorHex,
        diameterMm,
        initialWeightGrams: initialW,
        emptySpoolWeightGrams: emptySpoolW,
        acquisitionPrice: acqPrice,
        supplierId,
        supplierName,
        purchaseDate,
        minStockGrams,
        storageLocation,
        gramsPerMeter,
        updatedAt: serverTimestamp(),
      });
    } else {
      const hasExplicitCurrent =
        data.currentWeightGrams !== undefined &&
        data.currentWeightGrams !== null &&
        Number.isFinite(Number(data.currentWeightGrams));
      const currentW = hasExplicitCurrent ? cleanNum(data.currentWeightGrams, 0) : initialW;

      const batch = writeBatch(db);
      const matRef = doc(db, 'materials', id);
      batch.set(matRef, {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        name: cleanName,
        brand: cleanBrand,
        materialType: cleanMaterialType,
        color: cleanColor,
        colorHex: cleanColorHex,
        diameterMm,
        initialWeightGrams: initialW,
        currentWeightGrams: currentW,
        reservedWeightGrams: 0,
        emptySpoolWeightGrams: emptySpoolW,
        acquisitionPrice: acqPrice,
        supplierId,
        supplierName,
        purchaseDate,
        minStockGrams,
        storageLocation,
        gramsPerMeter,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (currentW > 0) {
        const movId = createEntityId('mov');
        const unitCost = initialW > 0 ? acqPrice / initialW : 0;
        batch.set(doc(db, 'inventoryMovements', movId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          materialId: id,
          materialName: cleanName,
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
        materialName: cleanStr(mat.name, 140, 'Material'),
        type,
        quantityGrams: Number(delta.toFixed(2)),
        previousWeightGrams: mat.currentWeightGrams,
        newWeightGrams: Number(newWeight.toFixed(2)),
        unitCostPerGram: Number(unitCost.toFixed(4)),
        totalCost: Number((delta * unitCost).toFixed(2)),
        referenceType: 'manual',
        referenceId: materialId,
        idempotencyKey: `adj_${movId}`,
        notes: cleanStr(notes, 500, `Movimentação manual (${type})`),
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
