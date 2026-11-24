import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit2,
  Eye,
  Plus,
  Printer as PrinterIcon,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { formatFirestoreErrorMessage } from '../../lib/firebase';
import {
  completeMaintenanceRecord,
  deletePrinter,
  recordMaintenance,
  savePrinter,
} from '../../services/erpService';
import type { Printer, PrinterStatus } from '../../types/erp';
import {
  formatBRL,
  formatDateBR,
  formatMinutesToHours,
  formatNumber,
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

const emptyPrinterForm = {
  name: '',
  manufacturer: '',
  model: '',
  technology: 'FDM',
  filamentDiameterMm: 1.75 as 1.75 | 2.85,
  serialNumber: '',
  acquisitionDate: getTodayISO(),
  acquisitionValue: 1800,
  estimatedLifespanHours: 3000,
  averagePowerWatts: 150,
  status: 'disponivel' as PrinterStatus,
  lastMaintenanceDate: '',
  nextMaintenanceDate: '',
  notes: '',
};

export const PrintersModule: React.FC = () => {
  const { tenant, printers, productionJobs, maintenanceRecords, isSectionLoading, showToast } =
    useErp();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Printer | null>(null);
  const [form, setForm] = useState(emptyPrinterForm);
  const [saving, setSaving] = useState(false);

  const [detailPrinter, setDetailPrinter] = useState<Printer | null>(null);
  const [maintPrinter, setMaintPrinter] = useState<Printer | null>(null);
  const [maintForm, setMaintForm] = useState({
    type: 'preventiva' as 'preventiva' | 'corretiva' | 'calibracao' | 'falha',
    description: '',
    cost: 0,
    date: getTodayISO(),
    nextDueDate: '',
    status: 'concluida' as 'pendente' | 'concluida',
    putInMaintenance: false,
  });
  const [savingMaint, setSavingMaint] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Printer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const printerAnalytics = useMemo(() => {
    const map = new Map<
      string,
      { jobsCount: number; failedCount: number; totalCost: number; totalHours: number }
    >();
    printers.forEach((p) => {
      map.set(p.id, { jobsCount: 0, failedCount: 0, totalCost: 0, totalHours: p.accumulatedHours });
    });
    productionJobs.forEach((j) => {
      if (!j.printerId) return;
      const entry = map.get(j.printerId);
      if (!entry) return;
      if (j.status === 'finalizado') entry.jobsCount += 1;
      if (j.status === 'falha_impressao') entry.failedCount += 1;
      entry.totalCost += j.totalActualCost || 0;
    });
    return map;
  }, [printers, productionJobs]);

  const fleetSummary = useMemo(() => {
    const available = printers.filter((p) => p.status === 'disponivel').length;
    const printing = printers.filter((p) => p.status === 'imprimindo').length;
    const totalHours = printers.reduce((acc, p) => acc + (p.accumulatedHours || 0), 0);
    const pendingMaint = maintenanceRecords.filter((m) => m.status === 'pendente').length;
    return { available, printing, totalHours, pendingMaint };
  }, [printers, maintenanceRecords]);

  const sortedPrinters = useMemo(() => {
    return [...printers].sort((a, b) => {
      const ta = toDateObject(a.createdAt)?.getTime() || 0;
      const tb = toDateObject(b.createdAt)?.getTime() || 0;
      return tb - ta;
    });
  }, [printers]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPrinterForm);
    setModalOpen(true);
  };

  const openEdit = (p: Printer) => {
    setEditing(p);
    setForm({
      name: p.name,
      manufacturer: p.manufacturer,
      model: p.model,
      technology: p.technology,
      filamentDiameterMm: p.filamentDiameterMm,
      serialNumber: p.serialNumber,
      acquisitionDate: p.acquisitionDate,
      acquisitionValue: p.acquisitionValue,
      estimatedLifespanHours: p.estimatedLifespanHours,
      averagePowerWatts: p.averagePowerWatts,
      status: p.status,
      lastMaintenanceDate: p.lastMaintenanceDate,
      nextMaintenanceDate: p.nextMaintenanceDate,
      notes: p.notes,
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
      showToast('Informe o nome de identificação da impressora.', 'error');
      return;
    }
    setSaving(true);
    try {
      await savePrinter(tenant, form, editing?.id);
      showToast(editing ? 'Impressora atualizada.' : 'Impressora adicionada ao parque.');
      setModalOpen(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao salvar impressora.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !maintPrinter) {
      showToast('Sessão da empresa não inicializada.', 'error');
      return;
    }
    if (!maintForm.description.trim()) {
      showToast('Descreva a manutenção ou falha.', 'error');
      return;
    }
    setSavingMaint(true);
    try {
      const nextStatus: PrinterStatus | undefined =
        maintForm.status === 'pendente' && maintForm.putInMaintenance
          ? 'em_manutencao'
          : maintForm.status === 'concluida' && maintPrinter.status === 'em_manutencao'
            ? 'disponivel'
            : undefined;

      await recordMaintenance(
        tenant,
        {
          printerId: maintPrinter.id,
          printerName: maintPrinter.name,
          type: maintForm.type,
          description: maintForm.description,
          cost: maintForm.cost,
          date: maintForm.date,
          nextDueDate: maintForm.nextDueDate,
          status: maintForm.status,
        },
        nextStatus
      );
      showToast('Registro de manutenção salvo.');
      setMaintPrinter(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao registrar manutenção.'), 'error');
    } finally {
      setSavingMaint(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePrinter(deleteTarget.id);
      showToast('Impressora removida.');
      setDeleteTarget(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao remover impressora.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const statusMeta: Record<
    PrinterStatus,
    { label: string; tone: 'positive' | 'accent' | 'warning' | 'neutral' }
  > = {
    disponivel: { label: 'Disponível', tone: 'positive' },
    imprimindo: { label: 'Imprimindo', tone: 'accent' },
    em_manutencao: { label: 'Em manutenção', tone: 'warning' },
    inativa: { label: 'Inativa', tone: 'neutral' },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total de impressoras"
          value={String(printers.length)}
          subtext={`${fleetSummary.available} disponível(eis) agora`}
        />
        <KpiCard
          label="Em impressão"
          value={String(fleetSummary.printing)}
          subtext="Máquinas ativas no momento"
          tone="accent"
        />
        <KpiCard
          label="Horas acumuladas"
          value={`${formatNumber(fleetSummary.totalHours, 1)} h`}
          subtext="Soma operacional do parque"
        />
        <KpiCard
          label="Manutenções pendentes"
          value={String(fleetSummary.pendingMaint)}
          subtext="Chamados abertos"
          tone={fleetSummary.pendingMaint > 0 ? 'negative' : 'default'}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#F5F5F5]">Parque de Impressoras 3D</h2>
          <p className="text-xs text-[#9CA3AF]">
            Acompanhamento de disponibilidade, consumo elétrico, depreciação e manutenções
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nova impressora
        </button>
      </div>

      {sortedPrinters.length === 0 ? (
        isSectionLoading ? (
          <LoadingState label="Carregando impressoras do Firestore..." />
        ) : (
          <EmptyState
            icon={<PrinterIcon className="w-6 h-6" />}
            title="Nenhuma impressora cadastrada"
            description="Adicione suas impressoras 3D para vincular cálculos de depreciação, consumo de energia e ordens de produção."
            actionLabel="Adicionar impressora"
            onAction={openCreate}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedPrinters.map((p) => {
            const analytics = printerAnalytics.get(p.id) || {
              jobsCount: 0,
              failedCount: 0,
              totalCost: 0,
              totalHours: 0,
            };
            const lifePercent = Math.min(
              100,
              (p.accumulatedHours / Math.max(1, p.estimatedLifespanHours)) * 100
            );
            const depPerHour = p.acquisitionValue / Math.max(1, p.estimatedLifespanHours);
            const st = statusMeta[p.status];

            return (
              <div
                key={p.id}
                className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-base text-[#F5F5F5]">{p.name}</h3>
                      <p className="text-xs text-[#9CA3AF]">
                        {[p.manufacturer, p.model, p.technology, `${p.filamentDiameterMm}mm`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <StatusText label={st.label} tone={st.tone} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                    <div className="p-2.5 rounded-lg bg-[#17191E] border border-[#282C35]">
                      <p className="text-[#9CA3AF]">Horas acumuladas</p>
                      <p className="font-mono tabular-nums font-semibold text-[#F5F5F5] mt-0.5">
                        {formatNumber(p.accumulatedHours, 1)} h / {p.estimatedLifespanHours} h
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#17191E] border border-[#282C35]">
                      <p className="text-[#9CA3AF]">Consumo / Deprec.</p>
                      <p className="font-mono tabular-nums font-semibold text-[#F5F5F5] mt-0.5">
                        {p.averagePowerWatts}W · {formatBRL(depPerHour)}/h
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-[#9CA3AF] mb-1">
                      <span>Utilização da vida útil</span>
                      <span className="font-mono tabular-nums">{formatNumber(lifePercent, 1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#101114] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#F97316]"
                        style={{ width: `${lifePercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#282C35] flex items-center justify-between text-xs">
                  <span className="text-[#9CA3AF] font-mono tabular-nums">
                    {p.totalPrintCount} imp. · {p.totalFailureCount} falhas ·{' '}
                    {formatBRL(analytics.totalCost)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMaintPrinter(p);
                        setMaintForm({
                          type: 'preventiva',
                          description: '',
                          cost: 0,
                          date: getTodayISO(),
                          nextDueDate: '',
                          status: 'concluida',
                          putInMaintenance: false,
                        });
                      }}
                      title="Registrar manutenção ou falha"
                      className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-amber-400 hover:bg-[#252A34] cursor-pointer"
                    >
                      <Wrench className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailPrinter(p)}
                      title="Histórico e custos"
                      className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#252A34] cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      title="Editar impressora"
                      className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F97316] hover:bg-[#252A34] cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(p)}
                      title="Excluir impressora"
                      className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-400 hover:bg-[#252A34] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending Maintenance Table */}
      {maintenanceRecords.length > 0 && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#F5F5F5]">
            Histórico de manutenções e falhas
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#282C35] text-[#9CA3AF]">
                  <th className="py-2 pr-4 font-medium">Data</th>
                  <th className="py-2 pr-4 font-medium">Impressora</th>
                  <th className="py-2 pr-4 font-medium">Tipo</th>
                  <th className="py-2 pr-4 font-medium">Descrição</th>
                  <th className="py-2 pr-4 font-medium text-right">Custo</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#282C35]/70">
                {maintenanceRecords.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-[#9CA3AF]">
                      {formatDateBR(m.date)}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-[#F5F5F5]">{m.printerName}</td>
                    <td className="py-2.5 pr-4 text-[#F5F5F5] capitalize">{m.type}</td>
                    <td className="py-2.5 pr-4 text-[#9CA3AF] max-w-xs truncate">
                      {m.description}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                      {formatBRL(m.cost)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <StatusText
                        label={m.status === 'concluida' ? 'Concluída' : 'Pendente'}
                        tone={m.status === 'concluida' ? 'positive' : 'warning'}
                      />
                    </td>
                    <td className="py-2.5 text-right">
                      {m.status === 'pendente' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await completeMaintenanceRecord(m.id, m.printerId);
                            showToast('Manutenção concluída e impressora liberada.');
                          }}
                          className="inline-flex items-center gap-1 text-emerald-400 hover:underline cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Concluir
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

      {/* Printer Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar impressora' : 'Cadastrar impressora'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nome de identificação *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Ender 3 V2 #02"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Fabricante</label>
              <input
                type="text"
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                placeholder="Creality, Bambu Lab, Prusa..."
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Modelo</label>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="Ender 3 V2, A1 Mini..."
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Tecnologia</label>
              <select
                value={form.technology}
                onChange={(e) => setForm({ ...form, technology: e.target.value })}
                className={inputClass}
              >
                <option value="FDM">FDM (Filamento)</option>
                <option value="SLA/MSLA">SLA / MSLA (Resina)</option>
                <option value="SLS">SLS</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Diâmetro do filamento</label>
              <select
                value={form.filamentDiameterMm}
                onChange={(e) =>
                  setForm({
                    ...form,
                    filamentDiameterMm: Number(e.target.value) === 2.85 ? 2.85 : 1.75,
                  })
                }
                className={inputClass}
              >
                <option value={1.75}>1,75 mm</option>
                <option value={2.85}>2,85 mm</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Status operacional</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as PrinterStatus })}
                className={inputClass}
              >
                <option value="disponivel">Disponível</option>
                <option value="imprimindo">Imprimindo</option>
                <option value="em_manutencao">Em manutenção</option>
                <option value="inativa">Inativa</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Número de série (opcional)</label>
              <input
                type="text"
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Data de aquisição</label>
              <input
                type="date"
                value={form.acquisitionDate}
                onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Valor de aquisição (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.acquisitionValue}
                onChange={(e) => setForm({ ...form, acquisitionValue: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Vida útil estimada (horas)</label>
              <input
                type="number"
                min="1"
                value={form.estimatedLifespanHours}
                onChange={(e) =>
                  setForm({ ...form, estimatedLifespanHours: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Consumo médio (Watts)</label>
              <input
                type="number"
                min="0"
                value={form.averagePowerWatts}
                onChange={(e) => setForm({ ...form, averagePowerWatts: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Próxima manutenção</label>
              <input
                type="date"
                value={form.nextMaintenanceDate}
                onChange={(e) => setForm({ ...form, nextMaintenanceDate: e.target.value })}
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
              {editing ? 'Salvar impressora' : 'Adicionar impressora'}
            </LoadingButton>
          </div>
        </form>
      </Modal>

      {/* Register Maintenance Modal */}
      <Modal
        open={Boolean(maintPrinter)}
        onClose={() => setMaintPrinter(null)}
        title={`Manutenção / Falha · ${maintPrinter?.name || ''}`}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveMaintenance} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tipo</label>
              <select
                value={maintForm.type}
                onChange={(e) =>
                  setMaintForm({ ...maintForm, type: e.target.value as typeof maintForm.type })
                }
                className={inputClass}
              >
                <option value="preventiva">Preventiva</option>
                <option value="corretiva">Corretiva</option>
                <option value="calibracao">Calibração</option>
                <option value="falha">Falha mecânica/elétrica</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={maintForm.status}
                onChange={(e) =>
                  setMaintForm({
                    ...maintForm,
                    status: e.target.value as 'pendente' | 'concluida',
                  })
                }
                className={inputClass}
              >
                <option value="concluida">Concluída</option>
                <option value="pendente">Pendente</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Data</label>
              <input
                type="date"
                value={maintForm.date}
                onChange={(e) => setMaintForm({ ...maintForm, date: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Custo (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={maintForm.cost}
                onChange={(e) => setMaintForm({ ...maintForm, cost: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Descrição do serviço / falha *</label>
            <textarea
              rows={3}
              required
              value={maintForm.description}
              onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })}
              placeholder="Ex: Troca de bico 0.4mm, nivelamento de mesa, lubrificação eixo Z..."
              className={inputClass}
            />
          </div>

          {maintForm.status === 'pendente' && (
            <label className="flex items-center gap-2 text-xs text-[#F5F5F5] cursor-pointer">
              <input
                type="checkbox"
                checked={maintForm.putInMaintenance}
                onChange={(e) => setMaintForm({ ...maintForm, putInMaintenance: e.target.checked })}
                className="accent-[#F97316]"
              />
              Alterar status da impressora para "Em manutenção"
            </label>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMaintPrinter(null)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={savingMaint}
              className="px-5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              Registrar
            </LoadingButton>
          </div>
        </form>
      </Modal>

      {/* Printer Detail Modal */}
      <Modal
        open={Boolean(detailPrinter)}
        onClose={() => setDetailPrinter(null)}
        title={`Histórico de impressões · ${detailPrinter?.name || ''}`}
      >
        {detailPrinter && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-[#17191E] border border-[#282C35]">
                <p className="text-[#9CA3AF]">Tempo total</p>
                <p className="font-mono font-bold text-[#F5F5F5] mt-1">
                  {formatNumber(detailPrinter.accumulatedHours, 1)} h
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#17191E] border border-[#282C35]">
                <p className="text-[#9CA3AF]">Impressões / Falhas</p>
                <p className="font-mono font-bold text-[#F5F5F5] mt-1">
                  {detailPrinter.totalPrintCount} / {detailPrinter.totalFailureCount}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#17191E] border border-[#282C35]">
                <p className="text-[#9CA3AF]">Custo acumulado</p>
                <p className="font-mono font-bold text-[#F97316] mt-1">
                  {formatBRL(printerAnalytics.get(detailPrinter.id)?.totalCost || 0)}
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {productionJobs.filter((j) => j.printerId === detailPrinter.id).length === 0 ? (
                <p className="text-[#9CA3AF] text-center py-6">
                  Nenhuma impressão vinculada a esta máquina ainda.
                </p>
              ) : (
                productionJobs
                  .filter((j) => j.printerId === detailPrinter.id)
                  .map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center justify-between py-2 border-b border-[#282C35]"
                    >
                      <div>
                        <p className="text-[#F5F5F5] font-medium">
                          {j.productName} ({j.orderNumber || 'Avulsa'})
                        </p>
                        <p className="text-[#9CA3AF]">
                          {j.materialName} · {formatMinutesToHours(j.actualMinutes || j.estimatedMinutes)}
                        </p>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <p className="text-[#F5F5F5]">{formatBRL(j.totalActualCost)}</p>
                        <p className="text-[#9CA3AF]">{j.status.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir impressora"
        description={`Deseja excluir "${deleteTarget?.name}" do parque de impressoras?`}
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
