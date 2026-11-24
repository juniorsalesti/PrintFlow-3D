import React, { useMemo, useState } from 'react';
import { PackageCheck, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { formatFirestoreErrorMessage } from '../../lib/firebase';
import { receivePurchaseAndUpdateStock, savePurchase } from '../../services/erpService';
import type { Purchase, PurchaseItem } from '../../types/erp';
import { createEntityId, formatBRL, formatDateBR, getTodayISO, toDateObject } from '../../utils/formatters';
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

export const PurchasesModule: React.FC = () => {
  const { tenant, purchases, suppliers, materials, isSectionLoading, showToast } = useErp();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(getTodayISO());
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [shipping, setShipping] = useState(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [receiveTarget, setReceiveTarget] = useState<Purchase | null>(null);
  const [receiving, setReceiving] = useState(false);

  const createBlankItem = (): PurchaseItem => ({
    id: createEntityId('pi'),
    materialId: materials[0]?.id || '',
    description: materials[0]?.name || '',
    materialType: materials[0]?.materialType || 'PLA',
    color: materials[0]?.color || '',
    diameterMm: materials[0]?.diameterMm || 1.75,
    spoolWeightGrams: materials[0]?.initialWeightGrams || 1000,
    quantity: 1,
    unitPrice: materials[0]?.acquisitionPrice || 105,
    totalPrice: materials[0]?.acquisitionPrice || 105,
  });

  const openCreate = () => {
    setSupplierId(suppliers[0]?.id || '');
    setPurchaseDate(getTodayISO());
    setPaymentMethod('PIX');
    setShipping(0);
    setNotes('');
    setItems([createBlankItem()]);
    setModalOpen(true);
  };

  const updateItem = (idx: number, patch: Partial<PurchaseItem>) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        next.totalPrice = Number((next.quantity * next.unitPrice).toFixed(2));
        return next;
      })
    );
  };

  const totalValue = useMemo(() => {
    const itemsSum = items.reduce((acc, i) => acc + i.totalPrice, 0);
    return Number((itemsSum + shipping).toFixed(2));
  }, [items, shipping]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = !term
      ? [...purchases]
      : purchases.filter(
          (p) =>
            p.purchaseNumber.toLowerCase().includes(term) ||
            p.supplierName.toLowerCase().includes(term) ||
            p.items.some((i) => i.description.toLowerCase().includes(term))
        );
    return list.sort((a, b) => {
      const da = toDateObject(a.createdAt)?.getTime() || toDateObject(a.purchaseDate)?.getTime() || 0;
      const db = toDateObject(b.createdAt)?.getTime() || toDateObject(b.purchaseDate)?.getTime() || 0;
      return db - da;
    });
  }, [purchases, search]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (items.length === 0 || items.some((i) => !i.description.trim())) {
      showToast('Informe a descrição de todos os itens comprados.', 'error');
      return;
    }
    setSaving(true);
    try {
      const sup = suppliers.find((s) => s.id === supplierId);
      await savePurchase(tenant, {
        supplierId: sup?.id || '',
        supplierName: sup?.name || 'Fornecedor Avulso',
        items,
        shipping,
        totalValue,
        purchaseDate,
        paymentMethod,
        status: 'pendente',
        notes,
      });
      showToast('Ordem de compra registrada.');
      setModalOpen(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao registrar compra.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async () => {
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!receiveTarget) return;
    setReceiving(true);
    try {
      await receivePurchaseAndUpdateStock(tenant, receiveTarget);
      showToast('Compra recebida! Estoque e financeiro atualizados.');
      setReceiveTarget(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao confirmar recebimento.'), 'error');
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-64 sm:w-80">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar compra ou fornecedor..."
            className="w-full bg-[#1D2027] border border-[#282C35] focus:border-[#F97316] rounded-lg pl-9 pr-3 py-2 text-sm text-[#F5F5F5] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nova compra
        </button>
      </div>

      {filtered.length === 0 ? (
        isSectionLoading && purchases.length === 0 ? (
          <LoadingState label="Carregando compras do banco de dados..." />
        ) : (
          <EmptyState
            icon={<ShoppingCart className="w-6 h-6" />}
            title="Nenhuma compra registrada"
            description="Registre pedidos de compra de filamentos e insumos. Ao confirmar o recebimento, o estoque é atualizado automaticamente."
            actionLabel="Registrar primeira compra"
            onAction={openCreate}
          />
        )
      ) : (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#282C35] text-xs text-[#9CA3AF] bg-[#17191E]">
                  <th className="py-3 px-4 font-medium">Compra</th>
                  <th className="py-3 px-4 font-medium">Fornecedor</th>
                  <th className="py-3 px-4 font-medium">Data</th>
                  <th className="py-3 px-4 font-medium">Itens</th>
                  <th className="py-3 px-4 font-medium text-right">Total</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#282C35]">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-[#232730]">
                    <td className="py-3 px-4 font-mono font-semibold text-[#F5F5F5]">
                      {p.purchaseNumber}
                    </td>
                    <td className="py-3 px-4 text-[#F5F5F5]">{p.supplierName}</td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-[#9CA3AF]">
                      {formatDateBR(p.purchaseDate)}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#9CA3AF] max-w-xs truncate">
                      {p.items.map((i) => `${i.quantity}x ${i.description}`).join(', ')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#F5F5F5]">
                      {formatBRL(p.totalValue)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText
                        label={
                          p.status === 'recebido'
                            ? 'Recebido (estoque atualizado)'
                            : p.status === 'cancelado'
                              ? 'Cancelado'
                              : 'Aguardando entrega'
                        }
                        tone={
                          p.status === 'recebido'
                            ? 'positive'
                            : p.status === 'pendente'
                              ? 'warning'
                              : 'neutral'
                        }
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      {p.status === 'pendente' && (
                        <button
                          type="button"
                          onClick={() => setReceiveTarget(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Receber
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Purchase Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar compra de materiais"
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Fornecedor</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={inputClass}
              >
                <option value="">Fornecedor avulso</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Data da compra</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
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
                <option value="Boleto">Boleto</option>
                <option value="Transferência">Transferência</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[#F5F5F5]">Produtos / Filamentos adquiridos</h4>
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
                  <label className={labelClass}>Vincular filamento do estoque</label>
                  <select
                    value={item.materialId}
                    onChange={(e) => {
                      const mat = materials.find((m) => m.id === e.target.value);
                      updateItem(idx, {
                        materialId: e.target.value,
                        description: mat ? mat.name : item.description,
                        materialType: mat?.materialType || item.materialType,
                        spoolWeightGrams: mat?.initialWeightGrams || 1000,
                      });
                    }}
                    className={`${inputClass} mb-1.5 text-xs`}
                  >
                    <option value="">Insumo avulso (não altera rolo)</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.materialType})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    value={item.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="Descrição do item"
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Peso/rolo (g)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.spoolWeightGrams}
                    onChange={(e) =>
                      updateItem(idx, { spoolWeightGrams: Number(e.target.value) })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
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
                <div className="sm:col-span-3">
                  <label className={labelClass}>Valor unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#282C35]">
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
              <span className="text-xs text-[#9CA3AF]">Valor total da compra</span>
              <span className="text-xl font-bold font-mono tabular-nums text-[#F97316]">
                {formatBRL(totalValue)}
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
              Salvar compra
            </LoadingButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(receiveTarget)}
        title="Confirmar recebimento da compra"
        description={`Ao confirmar o recebimento de ${receiveTarget?.purchaseNumber}, os filamentos vinculados terão o saldo somado automaticamente com histórico de entrada, e a despesa será lançada no financeiro.`}
        confirmLabel="Confirmar entrada no estoque"
        loading={receiving}
        onConfirm={handleReceive}
        onCancel={() => setReceiveTarget(null)}
      />
    </div>
  );
};
