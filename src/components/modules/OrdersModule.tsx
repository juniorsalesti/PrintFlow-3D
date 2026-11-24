import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  ClipboardList,
  Copy,
  CreditCard,
  Edit2,
  FileDown,
  Layers,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { formatFirestoreErrorMessage } from '../../lib/firebase';
import {
  cancelOrderAndRelease,
  generateProductionForOrder,
  recordOrderPayment,
  saveOrder,
  updateOrderStatus,
} from '../../services/erpService';
import type { Order, OrderItem, OrderStatus } from '../../types/erp';
import { exportOrderPDF } from '../../utils/exporters';
import {
  addDaysISO,
  createEntityId,
  formatBRL,
  formatDateBR,
  getTodayISO,
  toDateObject,
} from '../../utils/formatters';
import {
  ConfirmModal,
  EmptyState,
  LoadingButton,
  LoadingState,
  Modal,
  StatusText,
  inputClass,
  labelClass,
} from '../common/UiPrimitives';

const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'novo_orcamento', label: 'Novo orçamento' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'aguardando_producao', label: 'Aguardando produção' },
  { value: 'em_producao', label: 'Em produção' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'pronto_retirada', label: 'Pronto para retirada' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelado', label: 'Cancelado' },
];

export const OrdersModule: React.FC = () => {
  const {
    tenant,
    company,
    orders,
    customers,
    products,
    materials,
    printers,
    productionJobs,
    quickActionTrigger,
    triggerQuickAction,
    setActiveSection,
    isSectionLoading,
    showToast,
  } = useErp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(addDaysISO(7));
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [status, setStatus] = useState<OrderStatus>('aprovado');
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [notes, setNotes] = useState('');
  const [autoGenerateProd, setAutoGenerateProd] = useState(true);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('PIX');
  const [payDate, setPayDate] = useState(getTodayISO());
  const [paying, setPaying] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [canceling, setCanceling] = useState(false);

  const createBlankItem = (): OrderItem => ({
    id: createEntityId('oi'),
    productId: '',
    productName: '',
    isCustom: true,
    materialId: materials[0]?.id || '',
    materialName: materials[0]?.name || 'PLA',
    color: materials[0]?.color || '',
    printerId: printers[0]?.id || '',
    printerName: printers[0]?.name || '',
    quantity: 1,
    weightGrams: 50,
    printTimeMinutes: 120,
    unitCost: 15,
    unitPrice: 45,
    totalPrice: 45,
  });

  useEffect(() => {
    if (quickActionTrigger === 'new_order') {
      openCreate();
      triggerQuickAction(null);
    }
  }, [quickActionTrigger]);

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setCustomerId('');
    setExpectedDeliveryDate(addDaysISO(7));
    setPaymentMethod('PIX');
    setStatus('aprovado');
    setDiscount(0);
    setShipping(0);
    setNotes('');
    setAutoGenerateProd(true);
    setItems([createBlankItem()]);
    setModalOpen(true);
  };

  const openEdit = (o: Order) => {
    setEditing(o);
    setFormError(null);
    setCustomerId(o.customerId);
    setExpectedDeliveryDate(o.expectedDeliveryDate || addDaysISO(7));
    setPaymentMethod(o.paymentMethod || 'PIX');
    setStatus(o.status);
    setDiscount(o.discount);
    setShipping(o.shipping);
    setNotes(o.notes);
    setItems(o.items.length > 0 ? o.items : [createBlankItem()]);
    setModalOpen(true);
  };

  const handleDuplicate = async (o: Order) => {
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    try {
      await saveOrder(
        tenant,
        {
          quoteId: '',
          customerId: o.customerId,
          customerName: o.customerName,
          expectedDeliveryDate: addDaysISO(7),
          items: o.items.map((it) => ({ ...it, id: createEntityId('oi') })),
          subtotal: o.subtotal,
          discount: o.discount,
          shipping: o.shipping,
          totalValue: o.totalValue,
          totalCost: o.totalCost,
          paymentMethod: o.paymentMethod,
          status: 'aprovado',
          notes: `Duplicado de ${o.orderNumber}`,
        },
        undefined,
        false
      );
      showToast(`Pedido ${o.orderNumber} duplicado com sucesso.`);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao duplicar pedido.'), 'error');
    }
  };

  const handleSelectProduct = (idx: number, productId: string) => {
    const p = products.find((item) => item.id === productId);
    if (!p) {
      updateItem(idx, { productId: '', isCustom: true });
      return;
    }
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const unitCost = Math.max(0, Number(p.manufacturingCost) || 0);
        const unitPrice = Math.max(0, Number(p.salePrice) || 0);
        const weight = Math.max(0, Number(p.estimatedWeightGrams) || 0);
        const time = Math.max(0, Number(p.estimatedTimeMinutes) || 0);
        return {
          ...row,
          productId: p.id,
          productName: p.name,
          isCustom: Boolean(p.isCustom),
          materialName: p.material || row.materialName,
          color: p.color || row.color,
          printerId: p.recommendedPrinterId || row.printerId,
          printerName: p.recommendedPrinterName || row.printerName,
          weightGrams: Number((weight * row.quantity).toFixed(2)),
          printTimeMinutes: Math.round(time * row.quantity),
          unitCost,
          unitPrice,
          totalPrice: Number((unitPrice * row.quantity).toFixed(2)),
        };
      })
    );
  };

  const updateItem = (idx: number, patch: Partial<OrderItem>) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        next.quantity = Math.max(1, Math.round(Number(next.quantity) || 1));
        next.weightGrams = Math.max(0, Number.isFinite(Number(next.weightGrams)) ? Number(next.weightGrams) : 0);
        next.unitPrice = Math.max(0, Number.isFinite(Number(next.unitPrice)) ? Number(next.unitPrice) : 0);
        next.unitCost = Math.max(0, Number.isFinite(Number(next.unitCost)) ? Number(next.unitCost) : 0);
        next.totalPrice = Number((next.quantity * next.unitPrice).toFixed(2));
        return next;
      })
    );
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, i) => acc + i.totalPrice, 0);
    const totalCost = items.reduce((acc, i) => acc + i.unitCost * i.quantity, 0);
    const safeDiscount = Math.max(0, Number(discount) || 0);
    const safeShipping = Math.max(0, Number(shipping) || 0);
    const totalValue = Math.max(0, Number((subtotal - safeDiscount + safeShipping).toFixed(2)));
    return { subtotal, totalCost, totalValue };
  }, [items, discount, shipping]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (statusFilter !== 'todos' && o.status !== statusFilter) return false;
        if (!term) return true;
        return (
          o.orderNumber.toLowerCase().includes(term) ||
          o.customerName.toLowerCase().includes(term) ||
          o.items.some((i) => i.productName.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => {
        const ta = toDateObject(a.createdAt)?.getTime() || 0;
        const tb = toDateObject(b.createdAt)?.getTime() || 0;
        return tb - ta;
      });
  }, [orders, search, statusFilter]);

  const extractReadableError = (err: unknown, fallback: string): string => {
    return formatFirestoreErrorMessage(err, fallback);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!tenant) {
      const msg = 'Sessão da empresa ainda está carregando. Aguarde um instante e tente novamente.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }
    if (items.length === 0 || items.some((i) => !i.productName.trim())) {
      const msg = 'Informe a descrição de todas as peças do pedido.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }
    setSaving(true);
    try {
      const cust = customers.find((c) => c.id === customerId);
      await saveOrder(
        tenant,
        {
          quoteId: editing?.quoteId || '',
          customerId: cust?.id || '',
          customerName: cust?.fullName || 'Cliente Avulso',
          expectedDeliveryDate,
          items,
          subtotal: totals.subtotal,
          discount: Math.max(0, Number(discount) || 0),
          shipping: Math.max(0, Number(shipping) || 0),
          totalValue: totals.totalValue,
          totalCost: totals.totalCost,
          paymentMethod,
          status,
          notes,
        },
        editing?.id,
        autoGenerateProd
      );
      showToast(editing ? 'Pedido atualizado.' : 'Pedido criado com sucesso.');
      setModalOpen(false);
    } catch (err) {
      const msg = extractReadableError(err, 'Erro ao salvar pedido.');
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateProduction = async (o: Order) => {
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    try {
      const count = await generateProductionForOrder(tenant, o);
      showToast(`${count} tarefa(s) de produção gerada(s) para ${o.orderNumber}.`);
      setActiveSection('production');
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao gerar produção.'), 'error');
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !payOrder) {
      showToast('Sessão da empresa não inicializada.', 'error');
      return;
    }
    setPaying(true);
    try {
      await recordOrderPayment(tenant, payOrder.id, payAmount, payMethod, payDate);
      showToast('Pagamento registrado no pedido e no fluxo financeiro.');
      setPayOrder(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao registrar pagamento.'), 'error');
    } finally {
      setPaying(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!tenant || !cancelTarget) {
      showToast('Sessão da empresa não inicializada.', 'error');
      return;
    }
    setCanceling(true);
    try {
      await cancelOrderAndRelease(tenant, cancelTarget, productionJobs);
      showToast(`Pedido ${cancelTarget.orderNumber} cancelado e reservas liberadas.`, 'info');
      setCancelTarget(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao cancelar pedido.'), 'error');
    } finally {
      setCanceling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido, cliente ou peça..."
              className="w-full bg-[#1D2027] border border-[#282C35] focus:border-[#F97316] rounded-lg pl-9 pr-3 py-2 text-sm text-[#F5F5F5] outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#1D2027] border border-[#282C35] rounded-lg px-3 py-2 text-xs text-[#F5F5F5] outline-none"
          >
            <option value="todos">Status: Todos</option>
            {ORDER_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo pedido
        </button>
      </div>

      {filteredOrders.length === 0 ? (
        isSectionLoading && orders.length === 0 ? (
          <LoadingState label="Carregando pedidos do Firestore..." />
        ) : (
          <EmptyState
            icon={<ClipboardList className="w-6 h-6" />}
            title="Nenhum pedido registrado"
            description="Crie pedidos com produtos do catálogo ou peças personalizadas, gere tarefas de produção e acompanhe pagamentos."
            actionLabel="Criar primeiro pedido"
            onAction={openCreate}
          />
        )
      ) : (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#282C35] text-xs text-[#9CA3AF] bg-[#17191E]">
                  <th className="py-3 px-4 font-medium">Pedido</th>
                  <th className="py-3 px-4 font-medium">Cliente</th>
                  <th className="py-3 px-4 font-medium">Entrega</th>
                  <th className="py-3 px-4 font-medium text-right">Total</th>
                  <th className="py-3 px-4 font-medium">Pagamento</th>
                  <th className="py-3 px-4 font-medium">Etapa</th>
                  <th className="py-3 px-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#282C35]">
                {filteredOrders.map((o) => {
                  const remaining = Math.max(0, o.totalValue - o.paidAmount);
                  return (
                    <tr key={o.id} className="hover:bg-[#232730]">
                      <td className="py-3 px-4">
                        <p className="font-mono font-semibold text-[#F5F5F5]">{o.orderNumber}</p>
                        <p className="text-[11px] text-[#9CA3AF]">
                          {formatDateBR(o.createdAt)} · {o.items.length} item(ns)
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-[#F5F5F5]">{o.customerName}</p>
                        <p className="text-xs text-[#9CA3AF] truncate max-w-[200px]">
                          {o.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-[#9CA3AF]">
                        {o.expectedDeliveryDate ? formatDateBR(o.expectedDeliveryDate) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <p className="font-semibold text-[#F5F5F5]">{formatBRL(o.totalValue)}</p>
                        {remaining > 0 && o.status !== 'cancelado' && (
                          <p className="text-[11px] text-[#9CA3AF]">
                            Resta {formatBRL(remaining)}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText
                          label={
                            o.paymentStatus === 'pago'
                              ? 'Pago'
                              : o.paymentStatus === 'parcial'
                                ? `Parcial (${formatBRL(o.paidAmount)})`
                                : o.paymentStatus === 'cancelado'
                                  ? 'Cancelado'
                                  : 'Pendente'
                          }
                          tone={
                            o.paymentStatus === 'pago'
                              ? 'positive'
                              : o.paymentStatus === 'parcial'
                                ? 'warning'
                                : o.paymentStatus === 'cancelado'
                                  ? 'neutral'
                                  : 'danger'
                          }
                        />
                      </td>
                      <td className="py-3 px-4">
                        {o.status === 'cancelado' ? (
                          <StatusText label="Cancelado" tone="neutral" />
                        ) : (
                          <select
                            value={o.status}
                            onChange={async (e) => {
                              try {
                                await updateOrderStatus(o.id, e.target.value as OrderStatus);
                                showToast(`Status do ${o.orderNumber} atualizado.`);
                              } catch (err) {
                                showToast(
                                  extractReadableError(err, 'Erro ao atualizar status do pedido.'),
                                  'error'
                                );
                              }
                            }}
                            className="bg-[#101114] border border-[#282C35] rounded-md px-2 py-1 text-xs text-[#F5F5F5] outline-none"
                          >
                            {ORDER_STATUS_OPTIONS.filter((opt) => opt.value !== 'cancelado').map(
                              (opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              )
                            )}
                          </select>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {!o.productionGenerated && o.status !== 'cancelado' && (
                            <button
                              type="button"
                              onClick={() => handleGenerateProduction(o)}
                              title="Gerar tarefas de produção"
                              className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F97316] hover:bg-[#282C35] cursor-pointer"
                            >
                              <Layers className="w-4 h-4" />
                            </button>
                          )}
                          {o.paymentStatus !== 'pago' && o.status !== 'cancelado' && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayOrder(o);
                                setPayAmount(Number((o.totalValue - o.paidAmount).toFixed(2)));
                                setPayMethod(o.paymentMethod || 'PIX');
                                setPayDate(getTodayISO());
                              }}
                              title="Registrar pagamento"
                              className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-emerald-400 hover:bg-[#282C35] cursor-pointer"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => exportOrderPDF(o, company)}
                            title="Comprovante PDF"
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#282C35] cursor-pointer"
                          >
                            <FileDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicate(o)}
                            title="Duplicar pedido"
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#282C35] cursor-pointer"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {o.status !== 'cancelado' && (
                            <button
                              type="button"
                              onClick={() => openEdit(o)}
                              title="Editar pedido"
                              className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F97316] hover:bg-[#282C35] cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {o.status !== 'cancelado' && o.status !== 'entregue' && (
                            <button
                              type="button"
                              onClick={() => setCancelTarget(o)}
                              title="Cancelar pedido"
                              className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-400 hover:bg-[#282C35] cursor-pointer"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Order Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar ${editing.orderNumber}` : 'Novo pedido'}
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Cliente</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className={inputClass}
              >
                <option value="">Cliente Avulso</option>
                {customers
                  .filter((c) => !c.isArchived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Previsão de entrega</label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Forma de pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={inputClass}
              >
                <option value="PIX">PIX</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Boleto">Boleto</option>
                <option value="Transferência">Transferência</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[#F5F5F5]">Produtos / Peças do pedido</h4>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, createBlankItem()])}
                className="text-xs text-[#F97316] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar item
              </button>
            </div>

            {items.map((item, idx) => (
              <div
                key={item.id}
                className="p-3 rounded-lg bg-[#17191E] border border-[#282C35] grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
              >
                <div className="sm:col-span-4">
                  <label className={labelClass}>Produto ou peça personalizada *</label>
                  <select
                    value={item.productId}
                    onChange={(e) => handleSelectProduct(idx, e.target.value)}
                    className={`${inputClass} mb-1.5 text-xs`}
                  >
                    <option value="">Pedido personalizado</option>
                    {products
                      .filter((p) => p.status === 'ativo')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatBRL(p.salePrice)}
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    required
                    value={item.productName}
                    onChange={(e) => updateItem(idx, { productName: e.target.value })}
                    placeholder="Descrição da peça"
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Filamento</label>
                  <select
                    value={item.materialId}
                    onChange={(e) => {
                      const mat = materials.find((m) => m.id === e.target.value);
                      updateItem(idx, {
                        materialId: e.target.value,
                        materialName: mat?.name || item.materialName,
                        color: mat?.color || item.color,
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="">Definir depois</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-1">
                  <label className={labelClass}>Qtd</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Peso tot. (g)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.weightGrams}
                    onChange={(e) =>
                      updateItem(idx, { weightGrams: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateItem(idx, { unitPrice: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-1 flex justify-end pb-1">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-[#9CA3AF] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#282C35]">
            <div>
              <label className={labelClass}>Desconto (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Frete (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={shipping}
                onChange={(e) => setShipping(Math.max(0, Number(e.target.value) || 0))}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col justify-end text-right">
              <span className="text-xs text-[#9CA3AF]">Valor total do pedido</span>
              <span className="text-xl font-bold font-mono tabular-nums text-[#F97316]">
                {formatBRL(totals.totalValue)}
              </span>
            </div>
          </div>

          {!editing && (
            <label className="flex items-center gap-2 text-xs text-[#F5F5F5] cursor-pointer">
              <input
                type="checkbox"
                checked={autoGenerateProd}
                onChange={(e) => setAutoGenerateProd(e.target.checked)}
                className="accent-[#F97316]"
              />
              Aprovar e gerar tarefas na fila de produção automaticamente
            </label>
          )}

          <div>
            <label className={labelClass}>Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 leading-relaxed break-words">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={saving}
              className="px-5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              {editing ? 'Salvar alterações' : 'Criar pedido'}
            </LoadingButton>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal
        open={Boolean(payOrder)}
        onClose={() => setPayOrder(null)}
        title={`Registrar pagamento · ${payOrder?.orderNumber || ''}`}
        subtitle={
          payOrder
            ? `Total: ${formatBRL(payOrder.totalValue)} · Já pago: ${formatBRL(payOrder.paidAmount)} · Saldo: ${formatBRL(Math.max(0, payOrder.totalValue - payOrder.paidAmount))}`
            : ''
        }
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePayment} className="space-y-4">
          <div>
            <label className={labelClass}>Valor recebido agora (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Forma de pagamento</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className={inputClass}
            >
              <option value="PIX">PIX</option>
              <option value="Cartão de Crédito">Cartão de Crédito</option>
              <option value="Cartão de Débito">Cartão de Débito</option>
              <option value="Boleto">Boleto</option>
              <option value="Transferência">Transferência</option>
              <option value="Dinheiro">Dinheiro</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Data do recebimento</label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPayOrder(null)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={paying}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              Confirmar recebimento
            </LoadingButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(cancelTarget)}
        title="Cancelar pedido"
        description={`Ao cancelar o pedido ${cancelTarget?.orderNumber}, as tarefas de produção pendentes serão canceladas e qualquer filamento reservado será devolvido ao saldo disponível. O histórico financeiro é preservado.`}
        confirmLabel="Cancelar pedido"
        danger
        loading={canceling}
        onConfirm={handleCancelOrder}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
};
