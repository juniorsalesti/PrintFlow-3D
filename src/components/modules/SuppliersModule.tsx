import React, { useMemo, useState } from 'react';
import { Edit2, Plus, Search, Trash2, Truck } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { formatFirestoreErrorMessage } from '../../lib/firebase';
import { deleteSupplier, saveSupplier } from '../../services/erpService';
import type { Supplier } from '../../types/erp';
import { formatBRL, toDateObject } from '../../utils/formatters';
import {
  ConfirmModal,
  EmptyState,
  LoadingButton,
  LoadingState,
  Modal,
  inputClass,
  labelClass,
} from '../common/UiPrimitives';

const emptySupplierForm = {
  name: '',
  document: '',
  contactName: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  notes: '',
};

export const SuppliersModule: React.FC = () => {
  const { tenant, suppliers, purchases, isSectionLoading, showToast } = useErp();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptySupplierForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = !term
      ? [...suppliers]
      : suppliers.filter(
          (s) =>
            s.name.toLowerCase().includes(term) ||
            s.contactName.toLowerCase().includes(term) ||
            s.document.toLowerCase().includes(term)
        );
    return list.sort((a, b) => {
      const da = toDateObject(a.createdAt)?.getTime() || 0;
      const db = toDateObject(b.createdAt)?.getTime() || 0;
      return db - da;
    });
  }, [suppliers, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptySupplierForm);
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      document: s.document,
      contactName: s.contactName,
      phone: s.phone,
      whatsapp: s.whatsapp,
      email: s.email,
      address: s.address,
      notes: s.notes,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!form.name.trim()) {
      showToast('Informe o nome do fornecedor.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveSupplier(tenant, form, editing?.id);
      showToast(editing ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
      setModalOpen(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao salvar fornecedor.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSupplier(deleteTarget.id);
      showToast('Fornecedor removido.');
      setDeleteTarget(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao excluir fornecedor.'), 'error');
    } finally {
      setDeleting(false);
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
            placeholder="Buscar fornecedor ou CNPJ..."
            className="w-full bg-[#1D2027] border border-[#282C35] focus:border-[#F97316] rounded-lg pl-9 pr-3 py-2 text-sm text-[#F5F5F5] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo fornecedor
        </button>
      </div>

      {filtered.length === 0 ? (
        isSectionLoading && suppliers.length === 0 ? (
          <LoadingState label="Carregando fornecedores do banco de dados..." />
        ) : (
          <EmptyState
            icon={<Truck className="w-6 h-6" />}
            title="Nenhum fornecedor cadastrado"
            description="Cadastre seus fornecedores de filamentos, bicos, peças de reposição e embalagens para controlar suas compras."
            actionLabel="Cadastrar fornecedor"
            onAction={openCreate}
          />
        )
      ) : (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#282C35] text-xs text-[#9CA3AF] bg-[#17191E]">
                  <th className="py-3 px-4 font-medium">Fornecedor</th>
                  <th className="py-3 px-4 font-medium">Contato</th>
                  <th className="py-3 px-4 font-medium">WhatsApp / Telefone</th>
                  <th className="py-3 px-4 font-medium text-right">Compras</th>
                  <th className="py-3 px-4 font-medium text-right">Total Comprado</th>
                  <th className="py-3 px-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#282C35]">
                {filtered.map((s) => {
                  const supPurchases = purchases.filter(
                    (p) => p.supplierId === s.id && p.status !== 'cancelado'
                  );
                  const totalBought = supPurchases.reduce((acc, p) => acc + p.totalValue, 0);
                  return (
                    <tr key={s.id} className="hover:bg-[#232730]">
                      <td className="py-3 px-4">
                        <p className="font-medium text-[#F5F5F5]">{s.name}</p>
                        <p className="text-xs text-[#9CA3AF]">{s.document || s.email || '—'}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#F5F5F5]">{s.contactName || '—'}</td>
                      <td className="py-3 px-4 text-xs text-[#9CA3AF]">
                        {s.whatsapp || s.phone || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {supPurchases.length}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {formatBRL(totalBought)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F97316] cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(s)}
                            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-400 cursor-pointer"
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar fornecedor' : 'Cadastrar fornecedor'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Nome / Razão Social *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: 3DLab Indústria de Filamentos"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>CNPJ / CPF</label>
              <input
                type="text"
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Pessoa de contato</label>
              <input
                type="text"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Telefone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>WhatsApp</label>
              <input
                type="text"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>E-mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Endereço</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Observações</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputClass}
              />
            </div>
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
              Salvar fornecedor
            </LoadingButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir fornecedor"
        description={`Deseja excluir o fornecedor "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
