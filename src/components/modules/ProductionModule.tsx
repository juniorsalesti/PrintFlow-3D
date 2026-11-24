import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  FileDown,
  Kanban,
  Layers,
  List,
  Play,
  Plus,
  Search,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { formatFirestoreErrorMessage } from '../../lib/firebase';
import {
  createStandaloneProductionJob,
  failProductionJobAndOptionalReprint,
  finishProductionJob,
  moveProductionJobStage,
  startProductionJob,
} from '../../services/erpService';
import type { ProductionJob, ProductionStatus } from '../../types/erp';
import { exportProductionOrderPDF } from '../../utils/exporters';
import {
  formatBRL,
  formatDateTimeBR,
  formatGrams,
  formatMinutesToHours,
  toDateObject,
} from '../../utils/formatters';
import {
  DurationInput,
  EmptyState,
  LoadingButton,
  LoadingState,
  Modal,
  StatusText,
  inputClass,
  labelClass,
} from '../common/UiPrimitives';

const STAGES: { id: ProductionStatus; label: string }[] = [
  { id: 'aguardando_producao', label: 'Aguardando produção' },
  { id: 'na_fila', label: 'Na fila' },
  { id: 'preparando_impressao', label: 'Preparando impressão' },
  { id: 'imprimindo', label: 'Imprimindo' },
  { id: 'pausado', label: 'Pausado' },
  { id: 'falha_impressao', label: 'Falha na impressão' },
  { id: 'finalizado', label: 'Finalizado' },
  { id: 'cancelado', label: 'Cancelado' },
];

export const ProductionModule: React.FC = () => {
  const {
    tenant,
    company,
    settings,
    productionJobs,
    printers,
    materials,
    orders,
    quickActionTrigger,
    triggerQuickAction,
    isSectionLoading,
    showToast,
  } = useErp();

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');

  // Standalone new job modal
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    orderId: '',
    productName: '',
    printerId: '',
    materialId: '',
    quantity: 1,
    plannedWeightGrams: 0,
    estimatedMinutes: 120,
    operatorName: '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  // Start print modal
  const [startJob, setStartJob] = useState<ProductionJob | null>(null);
  const [startForm, setStartForm] = useState({
    printerId: '',
    materialId: '',
    operatorName: '',
    reserveMaterial: true,
  });
  const [starting, setStarting] = useState(false);

  // Finish print modal
  const [finishJob, setFinishJob] = useState<ProductionJob | null>(null);
  const [finishForm, setFinishForm] = useState({
    actualWeightGrams: 0,
    wasteWeightGrams: 0,
    actualMinutes: 0,
    notes: '',
  });
  const [finishing, setFinishing] = useState(false);

  // Fail & Reprint modal
  const [failJob, setFailJob] = useState<ProductionJob | null>(null);
  const [failForm, setFailForm] = useState({
    wasteWeightGrams: 0,
    actualMinutes: 0,
    failureReason: '',
    createReprint: true,
  });
  const [failing, setFailing] = useState(false);

  useEffect(() => {
    if (quickActionTrigger === 'new_job') {
      setNewForm({
        orderId: '',
        productName: '',
        printerId: printers[0]?.id || '',
        materialId: materials[0]?.id || '',
        quantity: 1,
        plannedWeightGrams: 0,
        estimatedMinutes: 120,
        operatorName: '',
        notes: '',
      });
      setNewModalOpen(true);
      triggerQuickAction(null);
    }
  }, [quickActionTrigger, printers, materials, triggerQuickAction]);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...productionJobs]
      .filter(
        (j) =>
          !term ||
          j.productName.toLowerCase().includes(term) ||
          j.orderNumber.toLowerCase().includes(term) ||
          j.customerName.toLowerCase().includes(term) ||
          j.printerName.toLowerCase().includes(term)
      )
      .sort((a, b) => {
        const ta = toDateObject(a.createdAt)?.getTime() || 0;
        const tb = toDateObject(b.createdAt)?.getTime() || 0;
        return tb - ta;
      });
  }, [productionJobs, search]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!newForm.productName.trim()) {
      showToast('Informe o nome da peça para produção.', 'error');
      return;
    }
    setCreating(true);
    try {
      const ord = orders.find((o) => o.id === newForm.orderId);
      const prt = printers.find((p) => p.id === newForm.printerId);
      const mat = materials.find((m) => m.id === newForm.materialId);
      await createStandaloneProductionJob(tenant, {
        orderId: ord?.id || '',
        orderNumber: ord?.orderNumber || '',
        productName: newForm.productName,
        customerId: ord?.customerId || '',
        customerName: ord?.customerName || 'Produção Interna',
        printerId: prt?.id || '',
        printerName: prt?.name || '',
        materialId: mat?.id || '',
        materialName: mat?.name || '',
        color: mat?.color || '',
        quantity: newForm.quantity,
        plannedWeightGrams: newForm.plannedWeightGrams,
        estimatedMinutes: newForm.estimatedMinutes,
        operatorName: newForm.operatorName,
        notes: newForm.notes,
      });
      showToast('Tarefa de produção adicionada.');
      setNewModalOpen(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao criar tarefa.'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const openStartModal = (job: ProductionJob) => {
    const defaultPrinter =
      printers.find((p) => p.id === job.printerId && p.status === 'disponivel') ||
      printers.find((p) => p.status === 'disponivel') ||
      printers[0];
    const defaultMat =
      materials.find((m) => m.id === job.materialId) || materials[0];

    setStartJob(job);
    setStartForm({
      printerId: defaultPrinter?.id || '',
      materialId: defaultMat?.id || '',
      operatorName: job.operatorName || '',
      reserveMaterial: true,
    });
  };

  const handleStartPrint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !startJob) {
      showToast('Sessão da empresa não inicializada.', 'error');
      return;
    }
    if (!startForm.printerId) {
      showToast('Selecione uma impressora disponível.', 'error');
      return;
    }
    setStarting(true);
    try {
      const prt = printers.find((p) => p.id === startForm.printerId);
      const mat = materials.find((m) => m.id === startForm.materialId);
      await startProductionJob(tenant, startJob.id, {
        printerId: startForm.printerId,
        printerName: prt?.name || startJob.printerName,
        materialId: startForm.materialId,
        materialName: mat?.name || startJob.materialName,
        color: mat?.color || startJob.color,
        operatorName: startForm.operatorName,
        reserveMaterial: startForm.reserveMaterial,
      });
      showToast(`Impressão iniciada em ${prt?.name || 'impressora'}.`);
      setStartJob(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao iniciar impressão.'), 'error');
    } finally {
      setStarting(false);
    }
  };

  const openFinishModal = (job: ProductionJob) => {
    setFinishJob(job);
    setFinishForm({
      actualWeightGrams: job.plannedWeightGrams,
      wasteWeightGrams: 0,
      actualMinutes: job.estimatedMinutes,
      notes: job.notes || '',
    });
  };

  const handleFinishPrint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !finishJob || !settings) {
      showToast('Sessão da empresa não inicializada.', 'error');
      return;
    }
    setFinishing(true);
    try {
      await finishProductionJob(tenant, finishJob, settings, finishForm);
      showToast('Impressão finalizada! Estoque atualizado e custo registrado.');
      setFinishJob(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao finalizar impressão.'), 'error');
    } finally {
      setFinishing(false);
    }
  };

  const openFailModal = (job: ProductionJob) => {
    setFailJob(job);
    setFailForm({
      wasteWeightGrams: Math.round(job.plannedWeightGrams * 0.5),
      actualMinutes: Math.round(job.estimatedMinutes * 0.5),
      failureReason: '',
      createReprint: true,
    });
  };

  const handleFailPrint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !failJob || !settings) {
      showToast('Sessão da empresa não inicializada.', 'error');
      return;
    }
    if (!failForm.failureReason.trim()) {
      showToast('Informe o motivo da falha na impressão.', 'error');
      return;
    }
    setFailing(true);
    try {
      const reprintId = await failProductionJobAndOptionalReprint(
        tenant,
        failJob,
        settings,
        failForm
      );
      showToast(
        reprintId
          ? 'Falha registrada e nova tarefa de reimpressão criada!'
          : 'Falha e desperdício registrados.',
        'info'
      );
      setFailJob(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao registrar falha.'), 'error');
    } finally {
      setFailing(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text/plain', jobId);
  };

  const handleDropOnStage = async (e: React.DragEvent, targetStage: ProductionStatus) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/plain');
    const job = productionJobs.find((j) => j.id === jobId);
    if (!job || job.status === targetStage) return;

    if (job.status === 'finalizado' || job.status === 'cancelado') {
      showToast('Tarefas finalizadas ou canceladas não podem ser movidas.', 'error');
      return;
    }
    if (targetStage === 'imprimindo') {
      openStartModal(job);
      return;
    }
    if (targetStage === 'finalizado') {
      openFinishModal(job);
      return;
    }
    if (targetStage === 'falha_impressao') {
      openFailModal(job);
      return;
    }
    try {
      await moveProductionJobStage(job.id, targetStage);
      showToast(`Tarefa movida para "${STAGES.find((s) => s.id === targetStage)?.label}".`);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao mover tarefa.'), 'error');
    }
  };

  const stageTone = (st: ProductionStatus) => {
    if (st === 'finalizado') return 'positive';
    if (st === 'imprimindo') return 'accent';
    if (st === 'falha_impressao') return 'danger';
    if (st === 'pausado' || st === 'preparando_impressao') return 'warning';
    return 'neutral';
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar peça, pedido, impressora..."
              className="w-full bg-[#1D2027] border border-[#282C35] focus:border-[#F97316] rounded-lg pl-9 pr-3 py-2 text-sm text-[#F5F5F5] outline-none"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#17191E] border border-[#282C35]">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                viewMode === 'kanban' ? 'bg-[#F97316] text-white' : 'text-[#9CA3AF]'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                viewMode === 'list' ? 'bg-[#F97316] text-white' : 'text-[#9CA3AF]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Lista
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewForm({
              orderId: '',
              productName: '',
              printerId: printers[0]?.id || '',
              materialId: materials[0]?.id || '',
              quantity: 1,
              plannedWeightGrams: 0,
              estimatedMinutes: 120,
              operatorName: '',
              notes: '',
            });
            setNewModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nova tarefa de produção
        </button>
      </div>

      {filteredJobs.length === 0 ? (
        isSectionLoading && productionJobs.length === 0 ? (
          <LoadingState label="Carregando fila de produção do banco de dados..." />
        ) : (
          <EmptyState
            icon={<Layers className="w-6 h-6" />}
            title="Nenhuma tarefa na produção"
            description="Aprove um pedido para gerar tarefas automaticamente ou crie uma impressão avulsa para iniciar o acompanhamento no Kanban."
            actionLabel="Nova tarefa de produção"
            onAction={() => setNewModalOpen(true)}
          />
        )
      ) : viewMode === 'kanban' ? (
        /* Horizontal Kanban Board */
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {STAGES.map((stage) => {
            const stageJobs = filteredJobs.filter((j) => j.status === stage.id);
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnStage(e, stage.id)}
                className="w-72 shrink-0 bg-[#17191E] border border-[#282C35] rounded-xl flex flex-col max-h-[72vh]"
              >
                <div className="px-3.5 py-3 border-b border-[#282C35] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#F5F5F5]">{stage.label}</span>
                  <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                    {stageJobs.length}
                  </span>
                </div>

                <div className="p-2.5 space-y-2.5 overflow-y-auto flex-1">
                  {stageJobs.map((job) => {
                    const isTerminal =
                      job.status === 'finalizado' || job.status === 'cancelado';
                    return (
                      <div
                        key={job.id}
                        draggable={!isTerminal}
                        onDragStart={(e) => handleDragStart(e, job.id)}
                        className={`p-3 rounded-lg bg-[#1D2027] border border-[#282C35] space-y-2 ${
                          !isTerminal ? 'cursor-grab active:cursor-grabbing hover:border-[#3B4252]' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#F5F5F5] truncate">
                              {job.productName}
                            </p>
                            <p className="text-[11px] text-[#9CA3AF] truncate">
                              {job.orderNumber || 'Avulsa'} · {job.customerName}
                            </p>
                          </div>
                          {job.attemptNumber > 1 && (
                            <span className="text-[10px] font-mono text-amber-400 shrink-0">
                              #{job.attemptNumber}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-[#9CA3AF] space-y-0.5">
                          <p>
                            {job.printerName || 'Sem impressora'} · {job.materialName || 'Sem fil.'}
                          </p>
                          <p className="font-mono tabular-nums">
                            {job.quantity} un.
                            {job.plannedWeightGrams > 0
                              ? ` · ${formatGrams(job.plannedWeightGrams)}`
                              : ''}{' '}
                            · {formatMinutesToHours(job.estimatedMinutes)}
                          </p>
                          {job.materialReserved && (
                            <p className="text-amber-400">
                              Reservado: {formatGrams(job.reservedWeightGrams)}
                            </p>
                          )}
                          {job.status === 'finalizado' && (
                            <p className="text-emerald-400 font-mono">
                              Real: {formatGrams(job.actualWeightGrams)} ·{' '}
                              {formatBRL(job.totalActualCost)}
                            </p>
                          )}
                        </div>

                        {/* Card Actions */}
                        <div className="pt-2 border-t border-[#282C35] flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1">
                            {job.status !== 'imprimindo' &&
                              job.status !== 'finalizado' &&
                              job.status !== 'cancelado' &&
                              job.status !== 'falha_impressao' && (
                                <button
                                  type="button"
                                  onClick={() => openStartModal(job)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F97316] hover:bg-[#EA580C] text-white text-[11px] font-medium cursor-pointer"
                                >
                                  <Play className="w-3 h-3" />
                                  Iniciar
                                </button>
                              )}
                            {(job.status === 'imprimindo' || job.status === 'pausado') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openFinishModal(job)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Finalizar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openFailModal(job)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-600/80 hover:bg-red-600 text-white text-[11px] font-medium cursor-pointer"
                                >
                                  <AlertOctagon className="w-3 h-3" />
                                  Falha
                                </button>
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => exportProductionOrderPDF(job, company)}
                            title="Ordem de Produção PDF"
                            className="p-1 text-[#9CA3AF] hover:text-[#F5F5F5] cursor-pointer"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                  <th className="py-3 px-4 font-medium">Pedido / Produto</th>
                  <th className="py-3 px-4 font-medium">Impressora</th>
                  <th className="py-3 px-4 font-medium">Material</th>
                  <th className="py-3 px-4 font-medium text-right">Peso</th>
                  <th className="py-3 px-4 font-medium text-right">Tempo Est. / Real</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#282C35]">
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-[#232730]">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-[#F5F5F5]">
                        {job.productName}{' '}
                        {job.attemptNumber > 1 ? `(Tentativa #${job.attemptNumber})` : ''}
                      </p>
                      <p className="text-[#9CA3AF]">
                        {job.orderNumber || 'Avulsa'} · {job.customerName}
                        {job.startedAt ? ` · Início ${formatDateTimeBR(job.startedAt)}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-[#F5F5F5]">{job.printerName || '—'}</td>
                    <td className="py-3 px-4 text-[#9CA3AF]">
                      {job.materialName || '—'} {job.color ? `(${job.color})` : ''}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                      {job.actualWeightGrams > 0
                        ? formatGrams(job.actualWeightGrams)
                        : job.plannedWeightGrams > 0
                          ? formatGrams(job.plannedWeightGrams)
                          : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                      {formatMinutesToHours(job.estimatedMinutes)} /{' '}
                      {job.actualMinutes > 0 ? formatMinutesToHours(job.actualMinutes) : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText
                        label={
                          STAGES.find((s) => s.id === job.status)?.label || job.status
                        }
                        tone={stageTone(job.status)}
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {job.status !== 'imprimindo' &&
                          job.status !== 'finalizado' &&
                          job.status !== 'cancelado' &&
                          job.status !== 'falha_impressao' && (
                            <button
                              type="button"
                              onClick={() => openStartModal(job)}
                              className="px-2 py-1 rounded bg-[#F97316] text-white font-medium cursor-pointer"
                            >
                              Iniciar
                            </button>
                          )}
                        {(job.status === 'imprimindo' || job.status === 'pausado') && (
                          <>
                            <button
                              type="button"
                              onClick={() => openFinishModal(job)}
                              className="px-2 py-1 rounded bg-emerald-600 text-white font-medium cursor-pointer"
                            >
                              Finalizar
                            </button>
                            <button
                              type="button"
                              onClick={() => openFailModal(job)}
                              className="px-2 py-1 rounded bg-red-600 text-white font-medium cursor-pointer"
                            >
                              Falha
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => exportProductionOrderPDF(job, company)}
                          className="p-1 text-[#9CA3AF] hover:text-[#F5F5F5] cursor-pointer"
                        >
                          <FileDown className="w-4 h-4" />
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

      {/* Create Standalone Production Job Modal */}
      <Modal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        title="Nova tarefa de produção"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleCreateJob} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Produto / Peça *</label>
              <input
                type="text"
                required
                value={newForm.productName}
                onChange={(e) => setNewForm({ ...newForm, productName: e.target.value })}
                placeholder="Ex: Suporte de parede para roteador"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Vincular pedido (opcional)</label>
              <select
                value={newForm.orderId}
                onChange={(e) => setNewForm({ ...newForm, orderId: e.target.value })}
                className={inputClass}
              >
                <option value="">Produção avulsa / estoque</option>
                {orders
                  .filter((o) => o.status !== 'cancelado')
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} — {o.customerName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Quantidade</label>
              <input
                type="number"
                min="1"
                value={newForm.quantity}
                onChange={(e) =>
                  setNewForm({ ...newForm, quantity: Math.max(1, Number(e.target.value)) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Impressora</label>
              <select
                value={newForm.printerId}
                onChange={(e) => setNewForm({ ...newForm, printerId: e.target.value })}
                className={inputClass}
              >
                <option value="">Selecionar depois</option>
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Filamento</label>
              <select
                value={newForm.materialId}
                onChange={(e) => setNewForm({ ...newForm, materialId: e.target.value })}
                className={inputClass}
              >
                <option value="">Selecionar depois</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({formatGrams(m.currentWeightGrams - m.reservedWeightGrams)} livre)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <DurationInput
                label="Tempo estimado"
                totalMinutes={newForm.estimatedMinutes}
                onChangeMinutes={(mins) =>
                  setNewForm({ ...newForm, estimatedMinutes: mins })
                }
                minMinutes={1}
                defaultUnit="horas"
              />
            </div>
            <div>
              <label className={labelClass}>Operador</label>
              <input
                type="text"
                value={newForm.operatorName}
                onChange={(e) => setNewForm({ ...newForm, operatorName: e.target.value })}
                placeholder="Nome do operador responsável"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setNewModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={creating}
              className="px-5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              Criar tarefa
            </LoadingButton>
          </div>
        </form>
      </Modal>

      {/* Start Print Modal */}
      <Modal
        open={Boolean(startJob)}
        onClose={() => setStartJob(null)}
        title={`Iniciar impressão · ${startJob?.productName || ''}`}
        subtitle={
          (startJob?.plannedWeightGrams || 0) > 0
            ? `Peso estimado: ${formatGrams(startJob?.plannedWeightGrams || 0)} · Tempo est.: ${formatMinutesToHours(startJob?.estimatedMinutes || 0)}`
            : `Tempo estimado: ${formatMinutesToHours(startJob?.estimatedMinutes || 0)}`
        }
        maxWidth="max-w-md"
      >
        <form onSubmit={handleStartPrint} className="space-y-4">
          <div>
            <label className={labelClass}>Impressora *</label>
            <select
              required
              value={startForm.printerId}
              onChange={(e) => setStartForm({ ...startForm, printerId: e.target.value })}
              className={inputClass}
            >
              <option value="">Selecionar impressora</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id} disabled={p.status !== 'disponivel'}>
                  {p.name} — {p.status.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Filamento em estoque</label>
            <select
              value={startForm.materialId}
              onChange={(e) => setStartForm({ ...startForm, materialId: e.target.value })}
              className={inputClass}
            >
              <option value="">Sem vínculo de rolo</option>
              {materials.map((m) => {
                const free = Math.max(0, m.currentWeightGrams - m.reservedWeightGrams);
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} ({formatGrams(free)} livre)
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className={labelClass}>Operador</label>
            <input
              type="text"
              value={startForm.operatorName}
              onChange={(e) => setStartForm({ ...startForm, operatorName: e.target.value })}
              placeholder="Nome de quem iniciou a impressão"
              className={inputClass}
            />
          </div>

          {(startJob?.plannedWeightGrams || 0) > 0 && (
            <label className="flex items-center gap-2 text-xs text-[#F5F5F5] cursor-pointer">
              <input
                type="checkbox"
                checked={startForm.reserveMaterial}
                onChange={(e) =>
                  setStartForm({ ...startForm, reserveMaterial: e.target.checked })
                }
                className="accent-[#F97316]"
              />
              Reservar filamento estimado até a conclusão
            </label>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStartJob(null)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={starting}
              className="px-5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              Iniciar impressão
            </LoadingButton>
          </div>
        </form>
      </Modal>

      {/* Finish Print Modal */}
      <Modal
        open={Boolean(finishJob)}
        onClose={() => setFinishJob(null)}
        title={`Finalizar impressão · ${finishJob?.productName || ''}`}
        subtitle="Informe os valores reais para baixar o estoque e liberar a impressora."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleFinishPrint} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Peso real consumido (g) *</label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={finishForm.actualWeightGrams}
                onChange={(e) =>
                  setFinishForm({ ...finishForm, actualWeightGrams: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Desperdício / suportes (g)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={finishForm.wasteWeightGrams}
                onChange={(e) =>
                  setFinishForm({ ...finishForm, wasteWeightGrams: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
          </div>

          <DurationInput
            label="Tempo real de impressão *"
            totalMinutes={finishForm.actualMinutes}
            onChangeMinutes={(mins) =>
              setFinishForm({ ...finishForm, actualMinutes: mins })
            }
            minMinutes={1}
            required
          />

          <div>
            <label className={labelClass}>Observações de acabamento</label>
            <textarea
              rows={2}
              value={finishForm.notes}
              onChange={(e) => setFinishForm({ ...finishForm, notes: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFinishJob(null)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={finishing}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              Concluir e dar baixa
            </LoadingButton>
          </div>
        </form>
      </Modal>

      {/* Failure & Reprint Modal */}
      <Modal
        open={Boolean(failJob)}
        onClose={() => setFailJob(null)}
        title={`Registrar falha · ${failJob?.productName || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleFailPrint} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Filamento perdido (g)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={failForm.wasteWeightGrams}
                onChange={(e) =>
                  setFailForm({ ...failForm, wasteWeightGrams: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <DurationInput
                label="Tempo decorrido"
                totalMinutes={failForm.actualMinutes}
                onChangeMinutes={(mins) =>
                  setFailForm({ ...failForm, actualMinutes: mins })
                }
                minMinutes={0}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Motivo da falha *</label>
            <textarea
              rows={2}
              required
              value={failForm.failureReason}
              onChange={(e) => setFailForm({ ...failForm, failureReason: e.target.value })}
              placeholder="Ex: Descolamento da mesa, entupimento de bico, queda de energia..."
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-[#F5F5F5] cursor-pointer">
            <input
              type="checkbox"
              checked={failForm.createReprint}
              onChange={(e) => setFailForm({ ...failForm, createReprint: e.target.checked })}
              className="accent-[#F97316]"
            />
            Gerar nova tarefa de reimpressão mantendo histórico desta tentativa
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFailJob(null)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={failing}
              className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
            >
              Registrar falha
            </LoadingButton>
          </div>
        </form>
      </Modal>
    </div>
  );
};
