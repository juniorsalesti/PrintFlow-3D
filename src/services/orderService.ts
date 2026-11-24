import {
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Material, Order, OrderStatus, ProductionJob } from '../types/erp';
import { createEntityId, getTodayISO } from '../utils/formatters';
import {
  buildSettingsUpdateOrCreate,
  cleanNum,
  cleanStr,
  fetchCompanyCollection,
  sanitizeOrderItems,
  subscribeCompanyCollection,
  type TenantContext,
} from './firestoreBase';

export async function fetchOrders(
  tenant: TenantContext,
  preferServer = true
): Promise<Order[]> {
  return fetchCompanyCollection<Order>('orders', tenant, preferServer);
}

export function subscribeOrders(
  tenant: TenantContext,
  onData: (items: Order[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  return subscribeCompanyCollection<Order>('orders', tenant, onData, onError);
}

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
  const cleanItems = sanitizeOrderItems(data.items);
  const cleanCustomerId = cleanStr(data.customerId || '', 128);
  const cleanCustomerName = cleanStr(data.customerName, 140, 'Cliente Avulso');
  const cleanNotes = cleanStr(data.notes || '', 1000);
  const cleanDeliveryDate = cleanStr(data.expectedDeliveryDate || '', 30);
  const cleanPaymentMethod = cleanStr(data.paymentMethod, 60, 'PIX');
  const cleanSubtotal = cleanNum(data.subtotal, 0);
  const cleanDiscount = cleanNum(data.discount, 0);
  const cleanShipping = cleanNum(data.shipping, 0);
  const cleanTotalValue = cleanNum(data.totalValue, 0);
  const cleanTotalCost = cleanNum(data.totalCost, 0);

  try {
    if (existingId) {
      const updatePayload: Record<string, unknown> = {
        customerId: cleanCustomerId,
        customerName: cleanCustomerName,
        expectedDeliveryDate: cleanDeliveryDate,
        items: cleanItems,
        subtotal: cleanSubtotal,
        discount: cleanDiscount,
        shipping: cleanShipping,
        totalValue: cleanTotalValue,
        totalCost: cleanTotalCost,
        paymentMethod: cleanPaymentMethod,
        notes: cleanNotes,
        updatedAt: serverTimestamp(),
      };
      if (data.status && data.status !== 'cancelado') {
        updatePayload.status = data.status;
      }
      await updateDoc(doc(db, 'orders', id), updatePayload);
      return id;
    }

    await runTransaction(db, async (tx) => {
      const settingsRef = doc(db, 'settings', tenant.companyId);
      const settingsSnap = await tx.get(settingsRef);
      const nextNum = settingsSnap.exists()
        ? ((settingsSnap.data()?.orderCounter as number) || 0) + 1
        : 1;
      const orderNumber = `PED-${String(nextNum).padStart(4, '0')}`;

      const shouldGenerate =
        generateProductionOnApprove &&
        (data.status === 'aprovado' || data.status === 'aguardando_producao');

      buildSettingsUpdateOrCreate(tx, settingsRef, settingsSnap, tenant, {
        orderCounter: nextNum,
      });

      tx.set(doc(db, 'orders', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        orderNumber,
        quoteId: cleanStr(data.quoteId || '', 128),
        customerId: cleanCustomerId,
        customerName: cleanCustomerName,
        expectedDeliveryDate: cleanDeliveryDate,
        items: cleanItems,
        subtotal: cleanSubtotal,
        discount: cleanDiscount,
        shipping: cleanShipping,
        totalValue: cleanTotalValue,
        totalCost: cleanTotalCost,
        paidAmount: 0,
        paymentMethod: cleanPaymentMethod,
        paymentStatus: 'pendente',
        status: shouldGenerate ? 'aguardando_producao' : data.status,
        productionGenerated: shouldGenerate,
        notes: cleanNotes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (shouldGenerate) {
        cleanItems.forEach((item) => {
          const jobId = createEntityId('job');
          tx.set(doc(db, 'productionJobs', jobId), {
            companyId: tenant.companyId,
            ownerUid: tenant.ownerUid,
            orderId: id,
            orderNumber,
            productId: item.productId,
            productName: item.productName,
            customerId: cleanCustomerId,
            customerName: cleanCustomerName,
            printerId: item.printerId,
            printerName: item.printerName,
            materialId: item.materialId,
            materialName: item.materialName,
            color: item.color,
            quantity: item.quantity,
            plannedWeightGrams: item.weightGrams,
            actualWeightGrams: 0,
            wasteWeightGrams: 0,
            reservedWeightGrams: 0,
            estimatedMinutes: item.printTimeMinutes,
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

      const cleanCustomerId = cleanStr(current.customerId || '', 128);
      const cleanCustomerName = cleanStr(current.customerName, 140, 'Cliente Avulso');

      current.items.forEach((item) => {
        const jobId = createEntityId('job');
        tx.set(doc(db, 'productionJobs', jobId), {
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          orderId: order.id,
          orderNumber: cleanStr(current.orderNumber, 40),
          productId: cleanStr(item.productId || '', 128),
          productName: cleanStr(item.productName, 160, 'Peça 3D'),
          customerId: cleanCustomerId,
          customerName: cleanCustomerName,
          printerId: cleanStr(item.printerId || '', 128),
          printerName: cleanStr(item.printerName || '', 120),
          materialId: cleanStr(item.materialId || '', 128),
          materialName: cleanStr(item.materialName || '', 140),
          color: cleanStr(item.color || '', 60),
          quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
          plannedWeightGrams: cleanNum(item.weightGrams, 0),
          actualWeightGrams: 0,
          wasteWeightGrams: 0,
          reservedWeightGrams: 0,
          estimatedMinutes: Math.round(cleanNum(item.printTimeMinutes, 0)),
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

      const newPaidAmount = Number(
        Math.min(order.totalValue, order.paidAmount + amount).toFixed(2)
      );
      const newPaymentStatus =
        newPaidAmount >= order.totalValue - 0.01 ? 'pago' : 'parcial';

      const category =
        newPaymentStatus === 'parcial'
          ? 'Sinal de Pedido'
          : order.paidAmount > 0
            ? 'Pagamento Final'
            : 'Vendas';

      const methodClean = cleanStr(paymentMethod || order.paymentMethod, 60, 'PIX');
      const dateClean = cleanStr(paymentDate || getTodayISO(), 30);

      tx.update(orderRef, {
        paidAmount: newPaidAmount,
        paymentStatus: newPaymentStatus,
        paymentMethod: methodClean,
        updatedAt: serverTimestamp(),
      });

      const txId = createEntityId('trx');
      tx.set(doc(db, 'transactions', txId), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        type: 'receita',
        category,
        description: cleanStr(`Recebimento ${order.orderNumber} — ${order.customerName}`, 240),
        amount: Number(amount.toFixed(2)),
        dueDate: dateClean,
        paymentDate: dateClean,
        paymentMethod: methodClean,
        status: 'pago',
        orderId,
        orderNumber: cleanStr(order.orderNumber, 40),
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
          const updatedReserved = Math.max(
            0,
            Number((mat.reservedWeightGrams - releaseGrams).toFixed(2))
          );
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
            materialName: cleanStr(mat.name, 140, 'Material'),
            type: 'liberacao_reserva',
            quantityGrams: Number(releaseGrams.toFixed(2)),
            previousWeightGrams: mat.currentWeightGrams,
            newWeightGrams: mat.currentWeightGrams,
            unitCostPerGram: 0,
            totalCost: 0,
            referenceType: 'pedido',
            referenceId: order.id,
            idempotencyKey: `rel_${order.id}_${matId}_${movId}`,
            notes: cleanStr(`Liberação de reserva por cancelamento do ${order.orderNumber}`, 500),
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
          notes: cleanStr(
            `${job.notes ? job.notes + ' · ' : ''}Cancelado junto ao pedido`,
            1000
          ),
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
