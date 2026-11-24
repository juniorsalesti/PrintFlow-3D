import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Edit2,
  Eye,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { formatFirestoreErrorMessage } from '../../lib/firebase';
import { deleteOrArchiveCustomer, saveCustomer } from '../../services/erpService';
import type { Customer } from '../../types/erp';
import { formatBRL, formatDateBR, toDateObject } from '../../utils/formatters';
import {
  ConfirmModal,
  EmptyState,
  KpiCard,
  LoadingButton,
  LoadingState,
  Modal,
  StatusText,
  inputClass,
  labelClass,
} from '../common/UiPrimitives';

const emptyForm = {
  fullName: '',
  document: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  city: '',
  state: '',
  notes: '',
};

export const CustomersModule: React.FC = () => {
  const {
    tenant,
    customers,
    orders,
    quotes,
    selectedCustomerId,
    setSelectedCustomerId,
    quickActionTrigger,
    triggerQuickAction,
    setActiveSection,
    isSectionLoading,
    showToast,
  } = useErp();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (quickActionTrigger === 'new_customer') {
      setEditingCustomer(null);
      setForm(emptyForm);
      setModalOpen(true);
      triggerQuickAction(null);
    }
  }, [quickActionTrigger, triggerQuickAction]);

  const activeCustomers = useMemo(
    () => customers.filter((c) => !c.isArchived),
    [customers]
  );

  const customerStatsMap = useMemo(() => {
    const map = new Map<
      string,
      { totalSpent: number; pendingBalance: number; ordersCount: number; quotesCount: number }
    >();
    customers.forEach((c) => {
      map.set(c.id, { totalSpent: 0, pendingBalance: 0, ordersCount: 0, quotesCount: 0 });
    });
    orders.forEach((o) => {
      if (!o.customerId || o.status === 'cancelado') return;
      const entry = map.get(o.customerId);
      if (!entry) return;
      entry.ordersCount += 1;
      entry.totalSpent += o.paidAmount;
      if (o.paymentStatus !== 'pago') {
        entry.pendingBalance += Math.max(0, o.totalValue - o.paidAmount);
      }
    });
    quotes.forEach((q) => {
      if (!q.customerId) return;
      const entry = map.get(q.customerId);
      if (entry) entry.quotesCount += 1;
    });
    return map;
  }, [customers, orders, quotes]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = !term
      ? activeCustomers
      : activeCustomers.filter(
          (c) =>
            c.fullName.toLowerCase().includes(term) ||
            c.phone.toLowerCase().includes(term) ||
            c.whatsapp.toLowerCase().includes(term) ||
            c.document.toLowerCase().includes(term) ||
            c.email.toLowerCase().includes(term)
        );
    return [...list].sort((a, b) => {
      const ta = toDateObject(a.createdAt)?.getTime() || 0;
      const tb = toDateObject(b.createdAt)?.getTime() || 0;
      return tb - ta;
    });
  }, [activeCustomers, search]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const openCreateModal = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      fullName: customer.fullName,
      document: customer.document,
      phone: customer.phone,
      whatsapp: customer.whatsapp,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      notes: customer.notes,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!form.fullName.trim()) {
      showToast('Informe o nome completo do cliente.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveCustomer(tenant, form, editingCustomer?.id);
      showToast(editingCustomer ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.');
      setModalOpen(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao salvar cliente.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const stats = customerStatsMap.get(deleteTarget.id);
      const hasHistory = Boolean(
        stats && (stats.ordersCount > 0 || stats.quotesCount > 0)
      );
      const result = await deleteOrArchiveCustomer(deleteTarget.id, hasHistory);
      if (result === 'archived') {
        showToast(
          'Cliente arquivado para preservar histórico de pedidos e orçamentos.',
          'info'
        );
      } else {
        showToast('Cliente excluído com sucesso.');
      }
      if (selectedCustomerId === deleteTarget.id) setSelectedCustomerId(null);
      setDeleteTarget(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao remover cliente.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Individual Customer Detail View
  if (selectedCustomer) {
    const cOrders = orders.filter((o) => o.customerId === selectedCustomer.id);
    const cQuotes = quotes.filter((q) => q.customerId === selectedCustomer.id);
    const stats = customerStatsMap.get(selectedCustomer.id) || {
      totalSpent: 0,
      pendingBalance: 0,
      ordersCount: 0,
      quotesCount: 0,
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedCustomerId(null)}
              className="p-2 rounded-lg bg-[#1D2027] border border-[#282C35] hover:border-[#F97316] text-[#9CA3AF] hover:text-[#F5F5F5] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="font-display text-xl font-bold text-[#F5F5F5]">
                {selectedCustomer.fullName}
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Cadastro em {formatDateBR(selectedCustomer.createdAt)}
                {selectedCustomer.document ? ` · CPF/CNPJ: ${selectedCustomer.document}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openEditModal(selectedCustomer)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1D2027] border border-[#282C35] hover:border-[#F97316] text-xs font-medium text-[#F5F5F5] cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Editar cadastro
            </button>
            <button
              type="button"
              onClick={() => {
                triggerQuickAction('new_order');
                setActiveSection('orders');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo pedido
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total gasto (pago)"
            value={formatBRL(stats.totalSpent)}
            tone="positive"
          />
          <KpiCard
            label="Valores pendentes"
            value={formatBRL(stats.pendingBalance)}
            tone={stats.pendingBalance > 0 ? 'negative' : 'default'}
          />
          <KpiCard label="Pedidos realizados" value={String(stats.ordersCount)} />
          <KpiCard label="Orçamentos emitidos" value={String(stats.quotesCount)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Information */}
          <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[#F5F5F5]">Informações de contato</h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5 text-[#9CA3AF]">
                <Phone className="w-4 h-4 text-[#F97316] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#F5F5F5] font-medium">
                    Telefone: {selectedCustomer.phone || '—'}
                  </p>
                  <p>WhatsApp: {selectedCustomer.whatsapp || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 text-[#9CA3AF]">
                <Mail className="w-4 h-4 text-[#F97316] shrink-0 mt-0.5" />
                <span className="text-[#F5F5F5] break-all">
                  {selectedCustomer.email || 'Sem e-mail cadastrado'}
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-[#9CA3AF]">
                <MapPin className="w-4 h-4 text-[#F97316] shrink-0 mt-0.5" />
                <span>
                  {[selectedCustomer.address, selectedCustomer.city, selectedCustomer.state]
                    .filter(Boolean)
                    .join(' · ') || 'Endereço não informado'}
                </span>
              </div>
            </div>
            {selectedCustomer.notes && (
              <div className="pt-3 border-t border-[#282C35]">
                <p className="text-xs font-medium text-[#9CA3AF] mb-1">Observações</p>
                <p className="text-xs text-[#F5F5F5] leading-relaxed">{selectedCustomer.notes}</p>
              </div>
            )}
          </div>

          {/* Purchase History */}
          <div className="lg:col-span-2 bg-[#1D2027] border border-[#282C35] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[#F5F5F5]">Histórico de compras e pedidos</h3>
            {cOrders.length === 0 && cQuotes.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] py-6 text-center">
                Este cliente ainda não possui pedidos ou orçamentos registrados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#282C35] text-[#9CA3AF]">
                      <th className="py-2.5 pr-4 font-medium">Número</th>
                      <th className="py-2.5 pr-4 font-medium">Data</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 pr-4 font-medium">Pagamento</th>
                      <th className="py-2.5 text-right font-medium">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#282C35]/70">
                    {cOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-[#232730]">
                        <td className="py-3 pr-4 font-mono font-semibold text-[#F5F5F5]">
                          {ord.orderNumber}
                        </td>
                        <td className="py-3 pr-4 font-mono tabular-nums text-[#9CA3AF]">
                          {formatDateBR(ord.createdAt)}
                        </td>
                        <td className="py-3 pr-4 text-[#F5F5F5]">
                          {ord.status.replace(/_/g, ' ')}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusText
                            label={
                              ord.paymentStatus === 'pago'
                                ? 'Pago'
                                : ord.paymentStatus === 'parcial'
                                  ? `Parcial (${formatBRL(ord.paidAmount)})`
                                  : ord.paymentStatus === 'cancelado'
                                    ? 'Cancelado'
                                    : 'Pendente'
                            }
                            tone={
                              ord.paymentStatus === 'pago'
                                ? 'positive'
                                : ord.paymentStatus === 'parcial'
                                  ? 'warning'
                                  : ord.paymentStatus === 'cancelado'
                                    ? 'neutral'
                                    : 'danger'
                            }
                          />
                        </td>
                        <td className="py-3 text-right font-mono tabular-nums font-semibold text-[#F5F5F5]">
                          {formatBRL(ord.totalValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, telefone ou CPF/CNPJ..."
            className="w-full bg-[#1D2027] border border-[#282C35] focus:border-[#F97316] rounded-lg pl-9 pr-3 py-2 text-sm text-[#F5F5F5] placeholder-[#6B7280] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Cadastrar cliente
        </button>
      </div>

      {/* Customer List */}
      {filteredCustomers.length === 0 ? (
        isSectionLoading && customers.length === 0 ? (
          <LoadingState label="Carregando clientes do Firestore..." />
        ) : (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            description={
              search
                ? 'Tente ajustar o termo pesquisado ou limpe o filtro.'
                : 'Cadastre seus primeiros clientes para vincular orçamentos, pedidos e histórico financeiro.'
            }
            actionLabel={!search ? 'Cadastrar primeiro cliente' : undefined}
            onAction={!search ? openCreateModal : undefined}
          />
        )
      ) : (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#282C35] text-xs text-[#9CA3AF] bg-[#17191E]">
                  <th className="py-3 px-4 font-medium">Cliente</th>
                  <th className="py-3 px-4 font-medium">Contato</th>
                  <th className="py-3 px-4 font-medium">Cidade / UF</th>
                  <th className="py-3 px-4 font-medium text-right">Pedidos</th>
                  <th className="py-3 px-4 font-medium text-right">Total Gasto</th>
                  <th className="py-3 px-4 font-medium text-right">Pendente</th>
                  <th className="py-3 px-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#282C35]">
                {filteredCustomers.map((c) => {
                  const st = customerStatsMap.get(c.id) || {
                    totalSpent: 0,
                    pendingBalance: 0,
                    ordersCount: 0,
                    quotesCount: 0,
                  };
                  return (
                    <tr key={c.id} className="hover:bg-[#232730] transition-colors">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerId(c.id)}
                          className="text-left group cursor-pointer"
                        >
                          <p className="font-medium text-[#F5F5F5] group-hover:text-[#F97316] transition-colors">
                            {c.fullName}
                          </p>
                          <p className="text-xs text-[#9CA3AF]">
                            {c.document || c.email || `Desde ${formatDateBR(c.createdAt)}`}
                          </p>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#9CA3AF]">
                        <p className="text-[#F5F5F5]">{c.whatsapp || c.phone || '—'}</p>
                        {c.email && <p className="truncate max-w-[180px]">{c.email}</p>}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#9CA3AF]">
                        {[c.city, c.state].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {st.ordersCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">
                        {formatBRL(st.totalSpent)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span className={st.pendingBalance > 0 ? 'text-red-400' : 'text-[#9CA3AF]'}>
                          {formatBRL(st.pendingBalance)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerId(c.id)}
                            title="Ver ficha do cliente"
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#282C35] cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            title="Editar cliente"
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F97316] hover:bg-[#282C35] cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            title="Excluir ou arquivar cliente"
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-400 hover:bg-[#282C35] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Customer Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? 'Editar cliente' : 'Cadastrar cliente'}
        subtitle="Preencha os dados de contato e endereço do cliente"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Nome completo *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Ex: Studio Arquitetura Silva Ltda"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>CPF / CNPJ (opcional)</label>
              <input
                type="text"
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
                placeholder="000.000.000-00"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>E-mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contato@cliente.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Telefone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(11) 3333-4444"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>WhatsApp</label>
              <input
                type="text"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                placeholder="(11) 99999-8888"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Endereço</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Rua, número, complemento e bairro"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Cidade</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="São Paulo"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Estado (UF)</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="SP"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Observações</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Preferências de material, entrega ou condições comerciais..."
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] hover:text-[#F5F5F5] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={saving}
              className="px-5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              <User className="w-4 h-4" />
              {editingCustomer ? 'Salvar alterações' : 'Cadastrar cliente'}
            </LoadingButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir cliente"
        description={
          deleteTarget
            ? customerStatsMap.get(deleteTarget.id)?.ordersCount
              ? `O cliente "${deleteTarget.fullName}" possui pedidos/orçamentos vinculados. Ele será arquivado para preservar os registros históricos financeiros e de produção.`
              : `Tem certeza que deseja excluir permanentemente o cliente "${deleteTarget.fullName}"?`
            : ''
        }
        confirmLabel="Confirmar"
        danger
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
