import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  Edit2,
  History,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useErp } from '../../context/ErpContext';
import { formatFirestoreErrorMessage } from '../../lib/firebase';
import {
  deleteMaterial,
  recordInventoryAdjustment,
  saveMaterial,
  updateCompanySettings,
} from '../../services/erpService';
import type { Material } from '../../types/erp';
import {
  computeGramsPerMeter,
  DEFAULT_MATERIAL_DENSITIES,
  formatBRL,
  formatDateTimeBR,
  formatGrams,
  getTodayISO,
  toDateObject,
} from '../../utils/formatters';
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

const emptyMaterialForm = {
  name: '',
  brand: '',
  materialType: 'PLA',
  color: '',
  colorHex: '#F97316',
  diameterMm: 1.75 as 1.75 | 2.85,
  initialWeightGrams: 1000,
  currentWeightGrams: 1000,
  emptySpoolWeightGrams: 220,
  acquisitionPrice: 110,
  supplierId: '',
  supplierName: '',
  purchaseDate: getTodayISO(),
  minStockGrams: 250,
  storageLocation: 'Prateleira A1',
  gramsPerMeter: 2.98,
};

export const InventoryModule: React.FC = () => {
  const {
    tenant,
    materials,
    inventoryMovements,
    suppliers,
    settings,
    quickActionTrigger,
    triggerQuickAction,
    isSectionLoading,
    showToast,
  } = useErp();

  const [tab, setTab] = useState<'estoque' | 'movimentacoes' | 'consumo'>('estoque');
  const [search, setSearch] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('todos');
  const [chartDays, setChartDays] = useState<30 | 90 | 365>(30);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(emptyMaterialForm);
  const [saving, setSaving] = useState(false);

  const [newMaterialTypeInput, setNewMaterialTypeInput] = useState('');
  const [addingMaterialType, setAddingMaterialType] = useState(false);

  const [moveModalMat, setMoveModalMat] = useState<Material | null>(null);
  const [moveType, setMoveType] = useState<'entrada' | 'consumo' | 'desperdicio' | 'ajuste' | 'devolucao'>('entrada');
  const [moveGrams, setMoveGrams] = useState(0);
  const [moveNotes, setMoveNotes] = useState('');
  const [allowNegativeAuth, setAllowNegativeAuth] = useState(false);
  const [moving, setMoving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (quickActionTrigger === 'new_material') {
      setEditing(null);
      setForm(emptyMaterialForm);
      setModalOpen(true);
      triggerQuickAction(null);
    }
  }, [quickActionTrigger, triggerQuickAction]);

  const materialTypes = settings?.materialTypes || ['PLA', 'PLA+', 'PETG', 'ABS', 'TPU'];

  const getDefaultGpm = (matType: string, diameter: 1.75 | 2.85) => {
    const cfg =
      settings?.materialDensities?.[matType] || DEFAULT_MATERIAL_DENSITIES[matType];
    if (cfg) {
      return diameter === 2.85 ? cfg.gramsPerMeter285 : cfg.gramsPerMeter175;
    }
    return computeGramsPerMeter(1.24, diameter);
  };

  const summary = useMemo(() => {
    const totalPhysical = materials.reduce((acc, m) => acc + m.currentWeightGrams, 0);
    const totalReserved = materials.reduce((acc, m) => acc + m.reservedWeightGrams, 0);
    const totalFree = Math.max(0, totalPhysical - totalReserved);
    const totalValue = materials.reduce((acc, m) => {
      const unitCost = m.initialWeightGrams > 0 ? m.acquisitionPrice / m.initialWeightGrams : 0;
      return acc + m.currentWeightGrams * unitCost;
    }, 0);
    const lowCount = materials.filter(
      (m) => m.currentWeightGrams - m.reservedWeightGrams <= (m.minStockGrams || 250)
    ).length;

    return { totalPhysical, totalReserved, totalFree, totalValue, lowCount };
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...materials]
      .filter((m) => {
        if (filterMaterial !== 'todos' && m.materialType !== filterMaterial) return false;
        if (!term) return true;
        return (
          m.name.toLowerCase().includes(term) ||
          m.brand.toLowerCase().includes(term) ||
          m.color.toLowerCase().includes(term) ||
          m.materialType.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const ta = toDateObject(a.createdAt)?.getTime() || 0;
        const tb = toDateObject(b.createdAt)?.getTime() || 0;
        return tb - ta;
      });
  }, [materials, search, filterMaterial]);

  const sortedMovements = useMemo(() => {
    return [...inventoryMovements].sort((a, b) => {
      const da = toDateObject(a.createdAt)?.getTime() || 0;
      const db = toDateObject(b.createdAt)?.getTime() || 0;
      return db - da;
    });
  }, [inventoryMovements]);

  const consumptionByMaterialChart = useMemo(() => {
    const cutoff = Date.now() - chartDays * 24 * 60 * 60 * 1000;
    const matMap = new Map<string, Material>();
    materials.forEach((m) => matMap.set(m.id, m));

    const agg = new Map<string, { material: string; consumo: number; desperdicio: number }>();

    inventoryMovements.forEach((mov) => {
      if (mov.type !== 'consumo' && mov.type !== 'desperdicio') return;
      const ts = toDateObject(mov.createdAt)?.getTime() || 0;
      if (ts < cutoff) return;
      const matType = matMap.get(mov.materialId)?.materialType || mov.materialName;
      const entry = agg.get(matType) || { material: matType, consumo: 0, desperdicio: 0 };
      if (mov.type === 'consumo') entry.consumo = Number((entry.consumo + mov.quantityGrams).toFixed(1));
      if (mov.type === 'desperdicio')
        entry.desperdicio = Number((entry.desperdicio + mov.quantityGrams).toFixed(1));
      agg.set(matType, entry);
    });

    return Array.from(agg.values());
  }, [inventoryMovements, materials, chartDays]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyMaterialForm);
    setModalOpen(true);
  };

  const openEdit = (m: Material) => {
    setEditing(m);
    setForm({
      name: m.name,
      brand: m.brand,
      materialType: m.materialType,
      color: m.color,
      colorHex: m.colorHex || '#F97316',
      diameterMm: m.diameterMm,
      initialWeightGrams: m.initialWeightGrams,
      currentWeightGrams: m.currentWeightGrams,
      emptySpoolWeightGrams: m.emptySpoolWeightGrams,
      acquisitionPrice: m.acquisitionPrice,
      supplierId: m.supplierId,
      supplierName: m.supplierName,
      purchaseDate: m.purchaseDate,
      minStockGrams: m.minStockGrams,
      storageLocation: m.storageLocation,
      gramsPerMeter: m.gramsPerMeter,
    });
    setModalOpen(true);
  };

  const handleAddCustomMaterialType = async () => {
    const label = newMaterialTypeInput.trim();
    if (!label || !tenant || !settings) return;
    if (materialTypes.includes(label)) {
      setForm((prev) => ({ ...prev, materialType: label }));
      setNewMaterialTypeInput('');
      return;
    }
    setAddingMaterialType(true);
    try {
      const updatedTypes = [...materialTypes, label];
      await updateCompanySettings(tenant.companyId, { materialTypes: updatedTypes });
      setForm((prev) => ({ ...prev, materialType: label }));
      setNewMaterialTypeInput('');
      showToast(`Tipo de material "${label}" adicionado.`);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao adicionar material.'), 'error');
    } finally {
      setAddingMaterialType(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!form.name.trim()) {
      showToast('Informe o nome do filamento.', 'error');
      return;
    }
    setSaving(true);
    try {
      const supplier = suppliers.find((s) => s.id === form.supplierId);
      await saveMaterial(
        tenant,
        {
          ...form,
          supplierName: supplier?.name || form.supplierName,
        },
        editing?.id
      );
      showToast(editing ? 'Filamento atualizado.' : 'Filamento adicionado ao estoque.');
      setModalOpen(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao salvar filamento.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !moveModalMat) {
      showToast('Sessão da empresa não inicializada.', 'error');
      return;
    }
    setMoving(true);
    try {
      await recordInventoryAdjustment(
        tenant,
        moveModalMat.id,
        moveType,
        moveGrams,
        moveNotes,
        allowNegativeAuth
      );
      showToast('Movimentação de estoque registrada.');
      setMoveModalMat(null);
      setMoveNotes('');
      setAllowNegativeAuth(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro na movimentação.'), 'error');
    } finally {
      setMoving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMaterial(deleteTarget.id);
      showToast('Filamento removido.');
      setDeleteTarget(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao remover filamento.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Estoque físico total"
          value={formatGrams(summary.totalPhysical)}
          subtext={`${materials.length} rolo(s)/lote(s) cadastrado(s)`}
        />
        <KpiCard
          label="Disponível livre"
          value={formatGrams(summary.totalFree)}
          subtext={`Reservado em produção: ${formatGrams(summary.totalReserved)}`}
          tone="positive"
        />
        <KpiCard
          label="Valor em estoque"
          value={formatBRL(summary.totalValue)}
          subtext="Calculado pelo custo de aquisição"
        />
        <KpiCard
          label="Alertas de estoque baixo"
          value={String(summary.lowCount)}
          subtext="Abaixo do nível mínimo configurado"
          tone={summary.lowCount > 0 ? 'negative' : 'default'}
        />
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#17191E] border border-[#282C35]">
          {(
            [
              { id: 'estoque', label: 'Filamentos e Estoque' },
              { id: 'movimentacoes', label: 'Histórico de Movimentações' },
              { id: 'consumo', label: 'Gráfico de Consumo' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                tab === t.id ? 'bg-[#F97316] text-white' : 'text-[#9CA3AF] hover:text-[#F5F5F5]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Cadastrar filamento
        </button>
      </div>

      {tab === 'estoque' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64 sm:w-80">
              <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, marca, cor..."
                className="w-full bg-[#1D2027] border border-[#282C35] focus:border-[#F97316] rounded-lg pl-9 pr-3 py-2 text-sm text-[#F5F5F5] placeholder-[#6B7280] outline-none"
              />
            </div>

            <select
              value={filterMaterial}
              onChange={(e) => setFilterMaterial(e.target.value)}
              className="bg-[#1D2027] border border-[#282C35] rounded-lg px-3 py-2 text-xs text-[#F5F5F5] outline-none"
            >
              <option value="todos">Todos os materiais</option>
              {materialTypes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {filteredMaterials.length === 0 ? (
            isSectionLoading && materials.length === 0 ? (
              <LoadingState label="Carregando filamentos do Firestore..." />
            ) : (
              <EmptyState
                icon={<Boxes className="w-6 h-6" />}
                title="Nenhum filamento em estoque"
                description="Cadastre seus rolos de PLA, PETG, ABS ou TPU para controlar reservas, consumo real e alertas de reposição."
                actionLabel="Cadastrar primeiro filamento"
                onAction={openCreate}
              />
            )
          ) : (
            <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#282C35] text-xs text-[#9CA3AF] bg-[#17191E]">
                      <th className="py-3 px-4 font-medium">Filamento / Marca</th>
                      <th className="py-3 px-4 font-medium">Material · Ø</th>
                      <th className="py-3 px-4 font-medium text-right">Físico Atual</th>
                      <th className="py-3 px-4 font-medium text-right">Reservado</th>
                      <th className="py-3 px-4 font-medium text-right">Livre</th>
                      <th className="py-3 px-4 font-medium text-right">Custo / kg</th>
                      <th className="py-3 px-4 font-medium">Situação</th>
                      <th className="py-3 px-4 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#282C35]">
                    {filteredMaterials.map((m) => {
                      const free = Math.max(0, m.currentWeightGrams - m.reservedWeightGrams);
                      const isLow = free <= (m.minStockGrams || 250);
                      const pricePerKg =
                        m.initialWeightGrams > 0
                          ? (m.acquisitionPrice / m.initialWeightGrams) * 1000
                          : m.acquisitionPrice;

                      return (
                        <tr key={m.id} className="hover:bg-[#232730]">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
                                style={{ backgroundColor: m.colorHex || '#F97316' }}
                              />
                              <div>
                                <p className="font-medium text-[#F5F5F5]">{m.name}</p>
                                <p className="text-xs text-[#9CA3AF]">
                                  {[m.brand, m.color, m.storageLocation]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-[#F5F5F5]">
                            {m.materialType} · <span className="font-mono">{m.diameterMm} mm</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                            {formatGrams(m.currentWeightGrams)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-400">
                            {formatGrams(m.reservedWeightGrams)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#F5F5F5]">
                            {formatGrams(free)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                            {formatBRL(pricePerKg)}
                          </td>
                          <td className="py-3 px-4">
                            <StatusText
                              label={isLow ? 'Estoque baixo' : 'Normal'}
                              tone={isLow ? 'danger' : 'positive'}
                            />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setMoveModalMat(m);
                                  setMoveType('entrada');
                                  setMoveGrams(0);
                                  setMoveNotes('');
                                  setAllowNegativeAuth(false);
                                }}
                                title="Movimentar estoque"
                                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F97316] hover:bg-[#282C35] cursor-pointer"
                              >
                                <ArrowDownUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(m)}
                                title="Editar filamento"
                                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#282C35] cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(m)}
                                title="Excluir filamento"
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
        </div>
      )}

      {tab === 'movimentacoes' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          {sortedMovements.length === 0 ? (
            <EmptyState
              icon={<History className="w-6 h-6" />}
              title="Sem movimentações registradas"
              description="Entradas, reservas para produção, consumos efetivos e ajustes aparecerão aqui automaticamente."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                    <th className="py-3 px-4 font-medium">Data / Hora</th>
                    <th className="py-3 px-4 font-medium">Filamento</th>
                    <th className="py-3 px-4 font-medium">Tipo</th>
                    <th className="py-3 px-4 font-medium text-right">Qtd (g)</th>
                    <th className="py-3 px-4 font-medium text-right">Saldo Anterior → Novo</th>
                    <th className="py-3 px-4 font-medium text-right">Custo</th>
                    <th className="py-3 px-4 font-medium">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282C35]">
                  {sortedMovements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-[#232730]">
                      <td className="py-3 px-4 font-mono tabular-nums text-[#9CA3AF]">
                        {formatDateTimeBR(mov.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#F5F5F5]">{mov.materialName}</td>
                      <td className="py-3 px-4">
                        <StatusText
                          label={mov.type.replace('_', ' ')}
                          tone={
                            mov.type === 'entrada' || mov.type === 'devolucao'
                              ? 'positive'
                              : mov.type === 'consumo' || mov.type === 'desperdicio'
                                ? 'danger'
                                : mov.type === 'reserva'
                                  ? 'warning'
                                  : 'neutral'
                          }
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {formatGrams(mov.quantityGrams)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                        {mov.previousWeightGrams.toFixed(0)}g → {mov.newWeightGrams.toFixed(0)}g
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {formatBRL(mov.totalCost)}
                      </td>
                      <td className="py-3 px-4 text-[#9CA3AF] max-w-xs truncate">{mov.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'consumo' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">
                Consumo e desperdício por tipo de material
              </h3>
              <p className="text-xs text-[#9CA3AF]">
                Gramas efetivamente consumidas na produção e falhas no período
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#101114] border border-[#282C35]">
              {([30, 90, 365] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setChartDays(d)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    chartDays === d ? 'bg-[#F97316] text-white' : 'text-[#9CA3AF]'
                  }`}
                >
                  {d} dias
                </button>
              ))}
            </div>
          </div>

          {consumptionByMaterialChart.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] py-12 text-center">
              Ainda não há consumos registrados no período selecionado.
            </p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={consumptionByMaterialChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#282C35" vertical={false} />
                  <XAxis dataKey="material" stroke="#9CA3AF" fontSize={11} />
                  <YAxis stroke="#9CA3AF" fontSize={11} unit="g" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#17191E',
                      borderColor: '#282C35',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="consumo" name="Consumo (g)" fill="#F97316" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="desperdicio"
                    name="Desperdício (g)"
                    fill="#EF4444"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Material Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar filamento' : 'Cadastrar filamento'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nome do filamento *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: PLA+ Preto Fosco 3DLab"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Marca</label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="3DLab, Voolt3D, Creality..."
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Tipo de material</label>
              <div className="flex gap-2">
                <select
                  value={form.materialType}
                  onChange={(e) => {
                    const mat = e.target.value;
                    setForm({
                      ...form,
                      materialType: mat,
                      gramsPerMeter: getDefaultGpm(mat, form.diameterMm),
                    });
                  }}
                  className={inputClass}
                >
                  {materialTypes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newMaterialTypeInput}
                  onChange={(e) => setNewMaterialTypeInput(e.target.value)}
                  placeholder="Novo tipo (ex: PETG-CF)"
                  className={`${inputClass} py-1 text-xs`}
                />
                <LoadingButton
                  type="button"
                  loading={addingMaterialType}
                  onClick={handleAddCustomMaterialType}
                  className="px-3 py-1 rounded-lg bg-[#282C35] hover:bg-[#343A46] text-xs text-[#F5F5F5]"
                >
                  Adicionar
                </LoadingButton>
              </div>
            </div>

            <div>
              <label className={labelClass}>Diâmetro (mm)</label>
              <select
                value={form.diameterMm}
                onChange={(e) => {
                  const dia = Number(e.target.value) === 2.85 ? 2.85 : 1.75;
                  setForm({
                    ...form,
                    diameterMm: dia,
                    gramsPerMeter: getDefaultGpm(form.materialType, dia),
                  });
                }}
                className={inputClass}
              >
                <option value={1.75}>1,75 mm</option>
                <option value={2.85}>2,85 mm</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Cor</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.colorHex}
                  onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
                  className="h-9 w-12 rounded bg-transparent border border-[#282C35] cursor-pointer"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="Preto, Cinza Espacial..."
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Gramas por metro (g/m)</label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                value={form.gramsPerMeter}
                onChange={(e) => setForm({ ...form, gramsPerMeter: Number(e.target.value) })}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Peso inicial do rolo (g)</label>
              <input
                type="number"
                step="any"
                min="1"
                value={form.initialWeightGrams}
                onChange={(e) => {
                  const w = Number(e.target.value);
                  setForm((prev) => ({
                    ...prev,
                    initialWeightGrams: w,
                    currentWeightGrams: editing ? prev.currentWeightGrams : w,
                  }));
                }}
                className={inputClass}
              />
            </div>

            {!editing && (
              <div>
                <label className={labelClass}>Peso atual disponível (g)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={form.currentWeightGrams}
                  onChange={(e) =>
                    setForm({ ...form, currentWeightGrams: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>Peso da embalagem/carretel vazio (g)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={form.emptySpoolWeightGrams}
                onChange={(e) =>
                  setForm({ ...form, emptySpoolWeightGrams: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Preço de aquisição (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.acquisitionPrice}
                onChange={(e) => setForm({ ...form, acquisitionPrice: Number(e.target.value) })}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Fornecedor</label>
              <select
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className={inputClass}
              >
                <option value="">Selecionar fornecedor (opcional)</option>
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
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Estoque mínimo de alerta (g)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={form.minStockGrams}
                onChange={(e) => setForm({ ...form, minStockGrams: Number(e.target.value) })}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Local de armazenamento</label>
              <input
                type="text"
                value={form.storageLocation}
                onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                placeholder="Drybox 01, Prateleira B2..."
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
              {editing ? 'Salvar alterações' : 'Cadastrar filamento'}
            </LoadingButton>
          </div>
        </form>
      </Modal>

      {/* Inventory Movement Modal */}
      <Modal
        open={Boolean(moveModalMat)}
        onClose={() => setMoveModalMat(null)}
        title={`Movimentar estoque · ${moveModalMat?.name || ''}`}
        subtitle={`Saldo físico atual: ${formatGrams(moveModalMat?.currentWeightGrams || 0)}`}
        maxWidth="max-w-lg"
      >
        {moveModalMat && (
          <form onSubmit={handleSubmitMovement} className="space-y-4">
            <div>
              <label className={labelClass}>Tipo de movimentação</label>
              <select
                value={moveType}
                onChange={(e) => setMoveType(e.target.value as typeof moveType)}
                className={inputClass}
              >
                <option value="entrada">Entrada de material (+)</option>
                <option value="devolucao">Devolução ao estoque (+)</option>
                <option value="consumo">Consumo avulso (-)</option>
                <option value="desperdicio">Desperdício / descarte (-)</option>
                <option value="ajuste">Ajuste direto de saldo (definir peso final)</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>
                {moveType === 'ajuste' ? 'Novo peso físico exato (g)' : 'Quantidade (gramas)'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={moveGrams}
                onChange={(e) => setMoveGrams(Number(e.target.value))}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Motivo / observação</label>
              <input
                type="text"
                value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
                placeholder="Ex: Pesagem na balança, troca de rolo, perda por umidade..."
                className={inputClass}
              />
            </div>

            {(moveType === 'consumo' || moveType === 'desperdicio') &&
              moveGrams > moveModalMat.currentWeightGrams && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    A quantidade excede o saldo atual ({formatGrams(moveModalMat.currentWeightGrams)}).
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#F5F5F5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowNegativeAuth}
                      onChange={(e) => setAllowNegativeAuth(e.target.checked)}
                      className="accent-[#F97316]"
                    />
                    Autorizar explicitamente o ajuste para saldo zerado
                  </label>
                </div>
              )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMoveModalMat(null)}
                className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
              >
                Cancelar
              </button>
              <LoadingButton
                type="submit"
                loading={moving}
                className="px-5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
              >
                Confirmar movimentação
              </LoadingButton>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir filamento"
        description={`Tem certeza que deseja excluir "${deleteTarget?.name}" do cadastro de estoque?`}
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
