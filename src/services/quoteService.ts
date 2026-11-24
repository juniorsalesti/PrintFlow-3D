import { deleteDoc, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Quote } from '../types/erp';
import { createEntityId } from '../utils/formatters';
import {
  buildDefaultSettingsPayload,
  cleanNum,
  cleanSignedNum,
  cleanStr,
  fetchCompanyCollection,
  sanitizeOrderItems,
  sanitizeQuoteItems,
  subscribeCompanyCollection,
  type TenantContext,
} from './firestoreBase';

export async function fetchQuotes(tenant: TenantContext): Promise<Quote[]> {
  return fetchCompanyCollection<Quote>('quotes', tenant);
}

export function subscribeQuotes(
  tenant: TenantContext,
  onData: (items: Quote[]) => void,
  onError?: (friendlyMessage: string) => void
) {
  return subscribeCompanyCollection<Quote>('quotes', tenant, onData, onError);
}

export async function saveQuote(
  tenant: TenantContext,
  data: Omit<
    Quote,
    'id' | 'companyId' | 'ownerUid' | 'quoteNumber' | 'convertedOrderId' | 'createdAt' | 'updatedAt'
  >,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('orc');
  const path = `quotes/${id}`;
  const cleanItems = sanitizeQuoteItems(data.items);
  const cleanCustomerId = cleanStr(data.customerId, 128);
  const cleanCustomerName = cleanStr(data.customerName, 140, 'Cliente Avulso');
  const cleanTitle = cleanStr(data.title || cleanItems[0]?.productName || 'Orçamento 3D', 160);
  const cleanNotes = cleanStr(data.notes, 1000);
  const cleanValidUntil = cleanStr(data.validUntil, 30);
  const cleanDiscount = cleanNum(data.discount, 0);
  const cleanShipping = cleanNum(data.shipping, 0);
  const cleanTotalCost = cleanNum(data.totalCost, 0);
  const cleanTotalPrice = cleanNum(data.totalPrice, 0);
  const cleanProfit = cleanSignedNum(data.estimatedProfit, 0);
  const cleanMargin = cleanSignedNum(data.profitMarginPercent, 0);

  try {
    if (existingId) {
      await updateDoc(doc(db, 'quotes', id), {
        customerId: cleanCustomerId,
        customerName: cleanCustomerName,
        title: cleanTitle,
        items: cleanItems,
        discount: cleanDiscount,
        shipping: cleanShipping,
        totalCost: cleanTotalCost,
        totalPrice: cleanTotalPrice,
        estimatedProfit: cleanProfit,
        profitMarginPercent: cleanMargin,
        validUntil: cleanValidUntil,
        status: data.status,
        notes: cleanNotes,
        updatedAt: serverTimestamp(),
      });
      return id;
    }

    await runTransaction(db, async (tx) => {
      const settingsRef = doc(db, 'settings', tenant.companyId);
      const settingsSnap = await tx.get(settingsRef);
      const nextNum = settingsSnap.exists()
        ? ((settingsSnap.data()?.quoteCounter as number) || 0) + 1
        : 1;
      const prefix = data.isSimulation ? 'SIM' : 'ORC';
      const quoteNumber = `${prefix}-${String(nextNum).padStart(4, '0')}`;

      if (settingsSnap.exists()) {
        tx.update(settingsRef, {
          quoteCounter: nextNum,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(settingsRef, {
          ...buildDefaultSettingsPayload(tenant.companyId, tenant.ownerUid),
          quoteCounter: nextNum,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(doc(db, 'quotes', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        quoteNumber,
        isSimulation: Boolean(data.isSimulation),
        customerId: cleanCustomerId,
        customerName: cleanCustomerName,
        title: cleanTitle,
        items: cleanItems,
        discount: cleanDiscount,
        shipping: cleanShipping,
        totalCost: cleanTotalCost,
        totalPrice: cleanTotalPrice,
        estimatedProfit: cleanProfit,
        profitMarginPercent: cleanMargin,
        validUntil: cleanValidUntil,
        status: data.status,
        convertedOrderId: '',
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
      const nextNum = settingsSnap.exists()
        ? ((settingsSnap.data()?.orderCounter as number) || 0) + 1
        : 1;
      const orderNumber = `PED-${String(nextNum).padStart(4, '0')}`;

      const orderItems = sanitizeOrderItems(
        quote.items.map((item) => ({
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
        }))
      );

      const subtotal = orderItems.reduce((acc, i) => acc + i.totalPrice, 0);

      if (settingsSnap.exists()) {
        tx.update(settingsRef, {
          orderCounter: nextNum,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(settingsRef, {
          ...buildDefaultSettingsPayload(tenant.companyId, tenant.ownerUid),
          orderCounter: nextNum,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

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
        customerId: cleanStr(quote.customerId, 128),
        customerName: cleanStr(quote.customerName, 140, 'Cliente Avulso'),
        expectedDeliveryDate: cleanStr(expectedDeliveryDate, 30),
        items: orderItems,
        subtotal: Number(subtotal.toFixed(2)),
        discount: cleanNum(quote.discount, 0),
        shipping: cleanNum(quote.shipping, 0),
        totalValue: Number(cleanNum(quote.totalPrice, 0).toFixed(2)),
        totalCost: Number(cleanNum(quote.totalCost, 0).toFixed(2)),
        paidAmount: 0,
        paymentMethod: cleanStr(paymentMethod, 60, 'PIX'),
        paymentStatus: 'pendente',
        status: generateProductionImmediately ? 'aguardando_producao' : 'aprovado',
        productionGenerated: generateProductionImmediately,
        notes: cleanStr(quote.notes, 1000),
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
            customerId: cleanStr(quote.customerId, 128),
            customerName: cleanStr(quote.customerName, 140, 'Cliente Avulso'),
            printerId: item.printerId,
            printerName: item.printerName,
            materialId: item.materialId,
            materialName: item.materialName,
            color: item.color,
            quantity: item.quantity,
            plannedWeightGrams: cleanNum(item.weightGrams, 0),
            actualWeightGrams: 0,
            wasteWeightGrams: 0,
            reservedWeightGrams: 0,
            estimatedMinutes: cleanNum(item.printTimeMinutes, 0),
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
    if (error instanceof Error && !error.message.includes('Firestore') && error.message.includes('Orçamento')) {
      throw error;
    }
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
