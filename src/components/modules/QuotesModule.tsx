import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightCircle,
  CheckCircle2,
  Edit2,
  FileDown,
  FileText,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { convertQuoteToOrder, deleteQuote, saveQuote } from '../../services/erpService';
import type { Quote, QuoteItem, QuoteStatus } from '../../types/erp';
import { exportQuotePDF } from '../../utils/exporters';
import {
  addDaysISO,
  createEntityId,
  formatBRL,
  formatDateBR,
  formatNumber,
} from '../../utils/formatters';
import {
  ConfirmModal,
  EmptyState,
  LoadingButton,
  Modal,
  StatusText,
  inputClass,
  labelClass,
} from '../common/UiPrimitives';

export const QuotesModule: React.FC = () => {
  const {
    tenant,
    company,
    quotes,
    customers,
    products,
    materials,
    printers,
    quickActionTrigger,
    triggerQuickAction,
    setActiveSection,
    showToast,
  } = useErp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [showSimulations, setShowSimulations] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('');
  const [validUntil, setValidUntil] = useState(addDaysISO(15));
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [status, setStatus] = useState<QuoteStatus>('novo_orcamento');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [convertTarget, setConvertTarget] = useState<Quote | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(addDaysISO(7));
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [genProduction, setGenProduction] = useState(true);
  const [converting, setConverting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const createBlankItem = (): QuoteItem => ({
    id: createEntityId('qi'),
    productId: '',
    productName: '',
    materialId: materials[0]?.id || '',
    materialName: materials[0]?.name || 'PLA',
    color: materials[0]?.color || '',
    printerId: printers[0]?.id || '',
    printerName: printers[0]?.name || '',
    quantity: 1,
    weightGrams: 50,
    lengthMeters: 0,
    printTimeMinutes: 120,
    materialCost: 0,
    energyCost: 0,
    depreciationCost: 0,
    laborCost: 0,
    packagingCost: 0,
    extraCost: 0,
    totalUnitCost: 15,
    desiredMarginPercent: 45,
    paymentFeePercent: 3.5,
    unitPrice: 40,
    totalPrice: 40,
  });

  useEffect(() => {
    if (quickActionTrigger === 'new_quote') {
      openCreate();
      triggerQuickAction(null);
    }
  }, [quickActionTrigger]);

  const openCreate = () => {
    setEditing(null);
    setCustomerId('');
    setTitle('');
    setValidUntil(addDaysISO(15));
    setDiscount(0);
    setShipping(0);
    setStatus('novo_orcamento');
    setNotes('');
    setItems([createBlankItem()]);
    setModalOpen(true);
  };

  const openEdit = (q: Quote) => {
    setEditing(q);
    setCustomerId(q.customerId);
    setTitle(q.title);
    setValidUntil(q.validUntil || addDaysISO(15));
    setDiscount(q.discount);
    setShipping(q.shipping);
    setStatus(q.status);
    setNotes(q.notes);
    setItems(q.items.length > 0 ? q.items : [createBlankItem()]);
    setModalOpen(true);
  };

  const handleSelectProduct = (idx: number, productId: string) => {
    const p = products.find((item) => item.id === productId);
    if (!p) return;
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const unitPrice = p.salePrice;
        return {
          ...row,
          productId: p.id,
          productName: p.name,
          materialName: p.material || row.materialName,
          color: p.color || row.color,
          printerId: p.recommendedPrinterId || row.printerId,
          printerName: p.recommendedPrinterName || row.printerName,
          weightGrams: p.estimatedWeightGrams * row.quantity,
          printTimeMinutes: p.estimatedTimeMinutes * row.quantity,
          totalUnitCost: p.manufacturingCost,
          unitPrice,
          totalPrice: Number((unitPrice * row.quantity).toFixed(2)),
        };
      })
    );
  };

  const updateItem = (idx: number, patch: Partial<QuoteItem>) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        next.totalPrice = Number((next.quantity * next.unitPrice).toFixed(2));
        return next;
      })
    );
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, i) => acc + i.totalPrice, 0);
    const totalCost = items.reduce((acc, i) => acc + i.totalUnitCost * i.quantity, 0);
    const totalPrice = Math.max(0, Number((subtotal - discount + shipping).toFixed(2)));
    const estimatedProfit = Number((totalPrice - totalCost).toFixed(2));
    const profitMarginPercent =
      totalPrice > 0 ? Number(((estimatedProfit / totalPrice) * 100).toFixed(2)) : 0;
    return { subtotal, totalCost, totalPrice, estimatedProfit, profitMarginPercent };
  }, [items, discount, shipping]);

  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter((q) => {
      if (!showSimulations && q.isSimulation) return false;
      if (statusFilter !== 'todos' && q.status !== statusFilter) return false;
      if (!term) return true;
      return (
        q.quoteNumber.toLowerCase().includes(term) ||
        q.customerName.toLowerCase().includes(term) ||
        q.title.toLowerCase().includes(term)
      );
    });
  }, [quotes, search, statusFilter, showSimulations]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    if (items.length === 0 || items.some((i) => !i.productName.trim())) {
      showToast('Preencha o nome de todos os itens do orçamento.', 'error');
      return;
    }
    setSaving(true);
    try {
      const cust = customers.find((c) => c.id === customerId);
      await saveQuote(
        tenant,
        {
          isSimulation: false,
          customerId: cust?.id || '',
          customerName: cust?.fullName || 'Cliente Avulso',
          title: title.trim() || items[0].productName,
          items,
          discount,
          shipping,
          totalCost: totals.totalCost,
          totalPrice: totals.totalPrice,
          estimatedProfit: totals.estimatedProfit,
          profitMarginPercent: totals.profitMarginPercent,
          validUntil,
          status,
          notes,
        },
        editing?.id
      );
      showToast(editing ? 'Orçamento atualizado.' : 'Orçamento criado com sucesso.');
      setModalOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao salvar orçamento.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveQuick = async (q: Quote) => {
    if (!tenant) return;
    try {
      await saveQuote(
        tenant,
        {
          isSimulation: q.isSimulation,
          customerId: q.customerId,
          customerName: q.customerName,
          title: q.title,
          items: q.items,
          discount: q.discount,
          shipping: q.shipping,
          totalCost: q.totalCost,
          totalPrice: q.totalPrice,
          estimatedProfit: q.estimatedProfit,
          profitMarginPercent: q.profitMarginPercent,
          validUntil: q.validUntil,
          status: 'aprovado',
          notes: q.notes,
        },
        q.id
      );
      showToast(`Orçamento ${q.quoteNumber} aprovado.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao aprovar orçamento.', 'error');
    }
  };

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !convertTarget) return;
    setConverting(true);
    try {
      await convertQuoteToOrder(tenant, convertTarget, deliveryDate, paymentMethod, genProduction);
      showToast(`Orçamento ${convertTarget.quoteNumber} convertido em pedido!`);
      setConvertTarget(null);
      setActiveSection('orders');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao converter orçamento.', 'error');
    } finally {
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteQuote(deleteTarget.id);
      showToast('Orçamento excluído.');
      setDeleteTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const statusTone = (st: QuoteStatus) => {
    if (st === 'aprovado' || st === 'convertido') return 'positive';
    if (st === 'aguardando_aprovacao' || st === 'novo_orcamento') return 'warning';
    if (st === 'rejeitado') return 'danger';
    return 'neutral';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar orçamento ou cliente..."
              className="w-full bg-[#1D2027] border border-[#282C35] focus:border-[#F97316] rounded-lg pl-9 pr-3 py-2 text-sm text-[#F5F5F5] outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#1D2027] border border-[#282C35] rounded-lg px-3 py-2 text-xs text-[#F5F5F5] outline-none"
          >
            <option value="todos">Todos os status</option>
            <option value="novo_orcamento">Novo orçamento</option>
            <option value="aguardando_aprovacao">Aguardando aprovação</option>
            <option value="aprovado">Aprovado</option>
            <option value="convertido">Convertido em pedido</option>
            <option value="rejeitado">Rejeitado</option>
          </select>

          <label className="inline-flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer">
            <input
              type="checkbox"
              checked={showSimulations}
              onChange={(e) => setShowSimulations(e.target.checked)}
              className="accent-[#F97316]"
            />
            Exibir simulações da calculadora
          </label>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo orçamento
        </button>
      </div>

      {filteredQuotes.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-6 h-6" />}
          title="Nenhum orçamento encontrado"
          description="Crie orçamentos profissionais para seus clientes com vários itens, validade e conversão direta em pedido e produção."
          actionLabel="Criar primeiro orçamento"
          onAction={openCreate}
        />
      ) : (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#282C35] text-xs text-[#9CA3AF] bg-[#17191E]">
                  <th className="py-3 px-4 font-medium">Número</th>
                  <th className="py-3 px-4 font-medium">Cliente / Título</th>
                  <th className="py-3 px-4 font-medium">Validade</th>
                  <th className="py-3 px-4 font-medium text-right">Custo Est.</th>
                  <th className="py-3 px-4 font-medium text-right">Valor Total</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#282C35]">
                {filteredQuotes.map((q) => (
                  <tr key={q.id} className="hover:bg-[#232730]">
                    <td className="py-3 px-4 font-mono font-semibold text-[#F5F5F5]">
                      {q.quoteNumber}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#F5F5F5]">{q.title || 'Orçamento 3D'}</p>
                      <p className="text-xs text-[#9CA3AF]">
                        {q.customerName} · {q.items.length} item(ns)
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-[#9CA3AF]">
                      {q.validUntil ? formatDateBR(q.validUntil) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                      {formatBRL(q.totalCost)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#F5F5F5]">
                      {formatBRL(q.totalPrice)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText
                        label={q.status.replace(/_/g, ' ')}
                        tone={statusTone(q.status)}
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {q.status !== 'aprovado' &&
                          q.status !== 'convertido' &&
                          q.status !== 'rejeitado' && (
                            <button
                              type="button"
                              onClick={() => handleApproveQuick(q)}
                              title="Aprovar orçamento"
                              className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-emerald-400 hover:bg-[#282C35] cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                        {q.status !== 'convertido' && q.status !== 'rejeitado' && (
                          <button
                            type="button"
                            onClick={() => setConvertTarget(q)}
                            title="Transformar em pedido"
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F97316] hover:bg-[#282C35] cursor-pointer"
                          >
                            <ArrowRightCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => exportQuotePDF(q, company)}
                          title="Exportar PDF"
                          className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#282C35] cursor-pointer"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                        {q.status !== 'convertido' && q.status !== 'rejeitado' && (
                          <button
                            type="button"
                            onClick={() => openEdit(q)}
                            title="Editar"
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F97316] hover:bg-[#282C35] cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(q)}
                          title="Excluir"
                          className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-400 hover:bg-[#282C35] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Quote Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar ${editing.quoteNumber}` : 'Novo orçamento'}
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
              <label className={labelClass}>Validade</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as QuoteStatus)}
                className={inputClass}
              >
                <option value="novo_orcamento">Novo orçamento</option>
                <option value="aguardando_aprovacao">Aguardando aprovação</option>
                <option value="aprovado">Aprovado</option>
                <option value="rejeitado">Rejeitado</option>
              </select>
            </div>
            <div className="sm:col-span-4">
              <label className={labelClass}>Título / Descrição geral</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Lote de suportes sob medida em PETG"
                className={inputClass}
              />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[#F5F5F5]">Itens do orçamento</h4>
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
                  <label className={labelClass}>Produto catálogo ou nome da peça *</label>
                  <select
                    value={item.productId}
                    onChange={(e) => handleSelectProduct(idx, e.target.value)}
                    className={`${inputClass} mb-1.5 text-xs`}
                  >
                    <option value="">Peça personalizada (digitar abaixo)</option>
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
                    placeholder="Nome do item"
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
                    <option value="">Padrão</option>
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
                    min="0"
                    value={item.weightGrams}
                    onChange={(e) => updateItem(idx, { weightGrams: Number(e.target.value) })}
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
                    onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-1 flex items-center justify-end pb-1">
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
                onChange={(e) => setDiscount(Number(e.target.value))}
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
                onChange={(e) => setShipping(Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col justify-end text-right">
              <span className="text-xs text-[#9CA3AF]">
                Total ({formatNumber(totals.profitMarginPercent, 1)}% margem est.)
              </span>
              <span className="text-xl font-bold font-mono tabular-nums text-[#F97316]">
                {formatBRL(totals.totalPrice)}
              </span>
            </div>
          </div>

          <div>
            <label className={labelClass}>Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </div>

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
              {editing ? 'Salvar orçamento' : 'Criar orçamento'}
            </LoadingButton>
          </div>
        </form>
      </Modal>

      {/* Convert to Order Modal */}
      <Modal
        open={Boolean(convertTarget)}
        onClose={() => setConvertTarget(null)}
        title={`Transformar ${convertTarget?.quoteNumber || ''} em pedido`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConvert} className="space-y-4">
          <div>
            <label className={labelClass}>Data prevista de entrega</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Forma de pagamento prevista</label>
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
          <label className="flex items-center gap-2 text-xs text-[#F5F5F5] cursor-pointer">
            <input
              type="checkbox"
              checked={genProduction}
              onChange={(e) => setGenProduction(e.target.checked)}
              className="accent-[#F97316]"
            />
            Gerar tarefas na fila de produção automaticamente
          </label>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setConvertTarget(null)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={converting}
              className="px-5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              Confirmar pedido
            </LoadingButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir orçamento"
        description={`Deseja excluir o orçamento ${deleteTarget?.quoteNumber}?`}
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
