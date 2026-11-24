import {
  collection,
  doc,
  getDocsFromServer,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  CompanySettings,
  Material,
  Printer,
  ProductionJob,
  ProductionStatus,
} from '../types/erp';
import { createEntityId, getTodayISO } from '../utils/formatters';
import {
  cleanNum,
  cleanStr,
  fetchCompanyCollection,
  subscribeCompanyCollection,
  type TenantContext,
} from './firestoreBase';

export async function fetchProductionJobs(
  tenant: TenantContext,
  preferServer = true
): Promise<ProductionJob[]> {
  return fetchCompanyCollection<ProductionJob>('productionJobs', tenant, preferServer);
}

export function subscribeProductionJobs(
  tenant: TenantContext,
  onData: (items: ProductionJob[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<ProductionJob>('productionJobs', tenant, onData, onError);
}

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
      orderId: cleanStr(data.orderId || '', 128),
      orderNumber: cleanStr(data.orderNumber || '', 40),
      productId: cleanStr(data.productId || '', 128),
      productName: cleanStr(data.productName, 160),
      customerId: cleanStr(data.customerId || '', 128),
      customerName: cleanStr(data.customerName, 140, 'Produção Interna'),
      printerId: cleanStr(data.printerId || '', 128),
      printerName: cleanStr(data.printerName || '', 120),
      materialId: cleanStr(data.materialId || '', 128),
      materialName: cleanStr(data.materialName || '', 140),
      color: cleanStr(data.color || '', 60),
      quantity: Math.max(1, Math.round(Number(data.quantity) || 1)),
      plannedWeightGrams: cleanNum(data.plannedWeightGrams, 0),
      actualWeightGrams: 0,
      wasteWeightGrams: 0,
      reservedWeightGrams: 0,
      estimatedMinutes: Math.round(cleanNum(data.estimatedMinutes, 0)),
      actualMinutes: 0,
      startedAt: '',
      estimatedFinishAt: '',
      finishedAt: '',
      operatorName: cleanStr(data.operatorName || '', 100),
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
      notes: cleanStr(data.notes || '', 1000),
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
          materialName: cleanStr(mat.name, 140, 'Material'),
          type: 'reserva',
          quantityGrams: job.plannedWeightGrams,
          previousWeightGrams: mat.currentWeightGrams,
          newWeightGrams: mat.currentWeightGrams,
          unitCostPerGram: 0,
          totalCost: 0,
          referenceType: 'producao',
          referenceId: jobId,
          idempotencyKey: `res_${jobId}`,
          notes: cleanStr(`Reserva para impressão: ${job.productName}`, 500),
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
        printerId: cleanStr(params.printerId, 128),
        printerName: cleanStr(params.printerName, 120),
        materialId: cleanStr(params.materialId || '', 128),
        materialName: cleanStr(params.materialName || '', 140),
        color: cleanStr(params.color || '', 60),
        operatorName: cleanStr(params.operatorName || '', 100),
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

      const actualWeight = cleanNum(params.actualWeightGrams, 0);
      const wasteWeight = cleanNum(params.wasteWeightGrams, 0);
      const totalConsumed = Number((actualWeight + wasteWeight).toFixed(2));
      const actualMinutes = Math.max(1, Math.round(Number(params.actualMinutes) || currentJob.estimatedMinutes || 1));
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
            materialName: cleanStr(mat.name, 140, 'Material'),
            type: 'consumo',
            quantityGrams: actualWeight,
            previousWeightGrams: mat.currentWeightGrams,
            newWeightGrams: Number((mat.currentWeightGrams - actualWeight).toFixed(2)),
            unitCostPerGram: Number(unitCostPerGram.toFixed(4)),
            totalCost: Number((actualWeight * unitCostPerGram).toFixed(2)),
            referenceType: 'producao',
            referenceId: job.id,
            idempotencyKey: `cons_${job.id}`,
            notes: cleanStr(`Consumo na produção: ${currentJob.productName}`, 500),
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
            materialName: cleanStr(mat.name, 140, 'Material'),
            type: 'desperdicio',
            quantityGrams: wasteWeight,
            previousWeightGrams: Number((mat.currentWeightGrams - actualWeight).toFixed(2)),
            newWeightGrams: newCurrentWeight,
            unitCostPerGram: Number(unitCostPerGram.toFixed(4)),
            totalCost: Number((wasteWeight * unitCostPerGram).toFixed(2)),
            referenceType: 'producao',
            referenceId: job.id,
            idempotencyKey: `waste_${job.id}`,
            notes: cleanStr(`Desperdício/suporte na produção: ${currentJob.productName}`, 500),
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
        notes: cleanStr(params.notes || '', 1000),
        updatedAt: serverTimestamp(),
      });

      if (totalActualCost > 0 && !currentJob.costRecorded) {
        const txId = createEntityId('trx');
        tx.set(doc(db, 'transactions', txId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          type: 'despesa',
          category: 'Custo de Produção',
          description: cleanStr(
            `Custo real de produção: ${currentJob.productName} (${currentJob.orderNumber || 'Avulsa'})`,
            240
          ),
          amount: totalActualCost,
          dueDate: getTodayISO(),
          paymentDate: getTodayISO(),
          paymentMethod: 'Interno',
          status: 'pago',
          orderId: currentJob.orderId || '',
          orderNumber: cleanStr(currentJob.orderNumber || '', 40),
          purchaseId: '',
          isProductionCost: true,
          idempotencyKey: `prod_cost_${job.id}`,
          notes: cleanStr(
            `Material: ${actualMaterialCost} | Energia: ${energyCost} | Deprec.: ${depreciationCost}`,
            600
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (job.orderId) {
      const siblingQuery = query(
        collection(db, 'productionJobs'),
        where('companyId', '==', tenant.companyId),
        where('ownerUid', '==', tenant.ownerUid),
        where('orderId', '==', job.orderId)
      );
      const siblingSnap = await getDocsFromServer(siblingQuery);
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

      const waste = cleanNum(params.wasteWeightGrams, 0);
      const mins = Math.round(cleanNum(params.actualMinutes, 0));
      const hrs = mins / 60;
      const cleanReason = cleanStr(params.failureReason, 400, 'Falha operacional');

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
            materialName: cleanStr(mat.name, 140, 'Material'),
            type: 'desperdicio',
            quantityGrams: deduct,
            previousWeightGrams: mat.currentWeightGrams,
            newWeightGrams: newCurrent,
            unitCostPerGram: Number(unitCost.toFixed(4)),
            totalCost: wasteCost,
            referenceType: 'producao',
            referenceId: job.id,
            idempotencyKey: `fail_waste_${job.id}`,
            notes: cleanStr(`Falha na impressão: ${cleanReason}`, 500),
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
        failureReason: cleanReason,
        notes: cleanStr(currentJob.notes || '', 1000),
        updatedAt: serverTimestamp(),
      });

      if (totalCost > 0) {
        const txId = createEntityId('trx');
        tx.set(doc(db, 'transactions', txId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          type: 'despesa',
          category: 'Falha / Desperdício',
          description: cleanStr(
            `Perda de impressão: ${currentJob.productName} (Tentativa #${currentJob.attemptNumber})`,
            240
          ),
          amount: totalCost,
          dueDate: getTodayISO(),
          paymentDate: getTodayISO(),
          paymentMethod: 'Interno',
          status: 'pago',
          orderId: currentJob.orderId || '',
          orderNumber: cleanStr(currentJob.orderNumber || '', 40),
          purchaseId: '',
          isProductionCost: true,
          idempotencyKey: `fail_cost_${job.id}`,
          notes: cleanStr(cleanReason, 600),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (params.createReprint) {
        reprintId = createEntityId('job');
        tx.set(doc(db, 'productionJobs', reprintId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          orderId: currentJob.orderId || '',
          orderNumber: cleanStr(currentJob.orderNumber || '', 40),
          productId: currentJob.productId || '',
          productName: cleanStr(currentJob.productName, 160, 'Peça 3D'),
          customerId: currentJob.customerId || '',
          customerName: cleanStr(currentJob.customerName || '', 140),
          printerId: currentJob.printerId || '',
          printerName: cleanStr(currentJob.printerName || '', 120),
          materialId: currentJob.materialId || '',
          materialName: cleanStr(currentJob.materialName || '', 140),
          color: cleanStr(currentJob.color || '', 60),
          quantity: Math.max(1, currentJob.quantity || 1),
          plannedWeightGrams: cleanNum(currentJob.plannedWeightGrams, 0),
          actualWeightGrams: 0,
          wasteWeightGrams: 0,
          reservedWeightGrams: 0,
          estimatedMinutes: Math.round(cleanNum(currentJob.estimatedMinutes, 0)),
          actualMinutes: 0,
          startedAt: '',
          estimatedFinishAt: '',
          finishedAt: '',
          operatorName: cleanStr(currentJob.operatorName || '', 100),
          status: 'aguardando_producao',
          stockDeducted: false,
          materialReserved: false,
          costRecorded: false,
          actualMaterialCost: 0,
          actualEnergyCost: 0,
          actualDepreciationCost: 0,
          totalActualCost: 0,
          attemptNumber: (currentJob.attemptNumber || 1) + 1,
          parentJobId: job.id,
          failureReason: '',
          notes: cleanStr(`Reimpressão após falha: ${cleanReason}`, 1000),
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
