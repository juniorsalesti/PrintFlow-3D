import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  DollarSign,
  Edit2,
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
  deleteExpense,
  deleteTransaction,
  recordOrderPayment,
  saveExpense,
  saveTransaction,
} from '../../services/erpService';
import type { Expense, FinancialStatus, Transaction } from '../../types/erp';
import {
  diffDaysFromToday,
  formatBRL,
  formatDateBR,
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

export const FinancialModule: React.FC = () => {
  const {
    tenant,
    settings,
    transactions,
    expenses,
    orders,
    productionJobs,
    quickActionTrigger,
    triggerQuickAction,
    isSectionLoading,
    showToast,
  } = useErp();

  const [tab, setTab] = useState<'fluxo' | 'pagar' | 'receber' | 'categorias'>('fluxo');
  const [regime, setRegime] = useState<'caixa' | 'competencia'>('caixa');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Expense Modal
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [editingExp, setEditingExp] = useState<Expense | null>(null);
  const [expForm, setExpForm] = useState({
    description: '',
    category: 'Compra de Filamentos',
    amount: 0,
    dueDate: getTodayISO(),
    paymentDate: getTodayISO(),
    paymentMethod: 'PIX',
    status: 'pago' as FinancialStatus,
    notes: '',
  });
  const [savingExp, setSavingExp] = useState(false);

  // Other Revenue Modal
  const [revModalOpen, setRevModalOpen] = useState(false);
  const [revForm, setRevForm] = useState({
    description: '',
    category: 'Outras Receitas',
    amount: 0,
    dueDate: getTodayISO(),
    paymentDate: getTodayISO(),
    paymentMethod: 'PIX',
    status: 'pago' as FinancialStatus,
    notes: '',
  });
  const [savingRev, setSavingRev] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'exp' | 'trx'; id: string; label: string } | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (quickActionTrigger === 'new_expense') {
      openNewExpense();
      triggerQuickAction(null);
    }
  }, [quickActionTrigger]);

  const categories = settings?.expenseCategories || [
    'Compra de Filamentos',
    'Manutenção',
    'Energia Elétrica',
    'Equipamentos',
    'Embalagens',
    'Marketing',
    'Internet',
    'Aluguel',
    'Outras Despesas',
  ];

  // Financial Metrics (separating Production Costs vs Admin Expenses & Caixa vs Competência)
  const metrics = useMemo(() => {
    // Caixa (Efetivamente pago/recebido)
    const cashInflows = transactions
      .filter((t) => t.type === 'receita' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);

    // Competência (Pedidos válidos emitidos)
    const accrualRevenues = orders
      .filter((o) => o.status !== 'cancelado')
      .reduce((acc, o) => acc + o.totalValue, 0);

    // Custos diretos de produção reais (sem dupla contagem com despesas administrativas)
    const productionCosts = productionJobs
      .filter((j) => j.status === 'finalizado' || j.status === 'falha_impressao')
      .reduce((acc, j) => acc + (j.totalActualCost || 0), 0);

    // Despesas administrativas registradas (caixa vs competência)
    const adminExpensesPaid = expenses
      .filter((e) => e.status === 'pago')
      .reduce((acc, e) => acc + e.amount, 0);

    const adminExpensesAccrual = expenses
      .filter((e) => e.status !== 'cancelado')
      .reduce((acc, e) => acc + e.amount, 0);

    // Contas a receber (pedidos com saldo em aberto + transações pendentes de receita)
    const orderReceivables = orders
      .filter((o) => o.status !== 'cancelado' && o.paymentStatus !== 'pago')
      .reduce((acc, o) => acc + Math.max(0, o.totalValue - o.paidAmount), 0);

    // Contas a pagar (despesas pendentes ou atrasadas)
    const payables = expenses
      .filter((e) => e.status === 'pendente' || e.status === 'atrasado')
      .reduce((acc, e) => acc + e.amount, 0);

    const activeRevenue = regime === 'caixa' ? cashInflows : accrualRevenues;
    const activeAdminExp = regime === 'caixa' ? adminExpensesPaid : adminExpensesAccrual;

    const grossProfit = activeRevenue - productionCosts;
    const operatingProfit = grossProfit - activeAdminExp;
    const netResult = operatingProfit;

    return {
      activeRevenue,
      productionCosts,
      activeAdminExp,
      grossProfit,
      operatingProfit,
      netResult,
      orderReceivables,
      payables,
    };
  }, [transactions, orders, productionJobs, expenses, regime]);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses
      .filter((e) => e.status !== 'cancelado')
      .forEach((e) => {
        map.set(e.category, Number(((map.get(e.category) || 0) + e.amount).toFixed(2)));
      });
    return Array.from(map.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [expenses]);

  const sortedTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...transactions]
      .filter((t) => {
        if (statusFilter !== 'todos' && t.status !== statusFilter) return false;
        if (!term) return true;
        return (
          t.description.toLowerCase().includes(term) ||
          t.category.toLowerCase().includes(term) ||
          t.orderNumber.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const da = toDateObject(a.paymentDate || a.dueDate || a.createdAt)?.getTime() || 0;
        const db = toDateObject(b.paymentDate || b.dueDate || b.createdAt)?.getTime() || 0;
        return db - da;
      });
  }, [transactions, search, statusFilter]);

  const openReceivables = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== 'cancelado' &&
          o.paymentStatus !== 'pago' &&
          o.totalValue - o.paidAmount > 0.01
      ),
    [orders]
  );

  const openNewExpense = () => {
    setEditingExp(null);
    setExpForm({
      description: '',
      category: categories[0] || 'Outras Despesas',
      amount: 0,
      dueDate: getTodayISO(),
      paymentDate: getTodayISO(),
      paymentMethod: 'PIX',
      status: 'pago',
      notes: '',
    });
    setExpModalOpen(true);
  };

  const openEditExpense = (e: Expense) => {
    setEditingExp(e);
    setExpForm({
      description: e.description,
      category: e.category,
      amount: e.amount,
      dueDate: e.dueDate || getTodayISO(),
      paymentDate: e.paymentDate || getTodayISO(),
      paymentMethod: e.paymentMethod || 'PIX',
      status: e.status,
      notes: e.notes,
    });
    setExpModalOpen(true);
  };

  const handleSaveExpense = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!expForm.description.trim() || expForm.amount <= 0) {
      showToast('Informe descrição e valor maior que zero.', 'error');
      return;
    }
    setSavingExp(true);
    try {
      await saveExpense(
        tenant,
        {
          ...expForm,
          orderId: editingExp?.orderId || '',
          purchaseId: editingExp?.purchaseId || '',
          supplierId: editingExp?.supplierId || '',
        },
        editingExp?.id
      );
      showToast(editingExp ? 'Despesa atualizada.' : 'Despesa lançada no financeiro.');
      setExpModalOpen(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao salvar despesa.'), 'error');
    } finally {
      setSavingExp(false);
    }
  };

  const handleMarkExpensePaid = async (e: Expense) => {
    if (!tenant) {
      showToast('Sessão da empresa não inicializada.', 'error');
      return;
    }
    try {
      await saveExpense(
        tenant,
        {
          description: e.description,
          category: e.category,
          amount: e.amount,
          dueDate: e.dueDate,
          paymentDate: getTodayISO(),
          paymentMethod: e.paymentMethod,
          status: 'pago',
          orderId: e.orderId,
          purchaseId: e.purchaseId,
          supplierId: e.supplierId,
          notes: e.notes,
        },
        e.id
      );
      showToast('Conta marcada como paga.');
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao quitar conta.'), 'error');
    }
  };

  const handleSaveRevenue = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!revForm.description.trim() || revForm.amount <= 0) {
      showToast('Informe descrição e valor.', 'error');
      return;
    }
    setSavingRev(true);
    try {
      await saveTransaction(tenant, {
        type: 'receita',
        category: revForm.category,
        description: revForm.description,
        amount: revForm.amount,
        dueDate: revForm.dueDate,
        paymentDate: revForm.paymentDate,
        paymentMethod: revForm.paymentMethod,
        status: revForm.status,
        orderId: '',
        orderNumber: '',
        purchaseId: '',
        isProductionCost: false,
        notes: revForm.notes,
      });
      showToast('Receita registrada.');
      setRevModalOpen(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao registrar receita.'), 'error');
    } finally {
      setSavingRev(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'exp') await deleteExpense(deleteTarget.id);
      else await deleteTransaction(deleteTarget.id);
      showToast('Registro removido.');
      setDeleteTarget(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao remover.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Regime Toggle + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#17191E] border border-[#282C35]">
            <button
              type="button"
              onClick={() => setRegime('caixa')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                regime === 'caixa' ? 'bg-[#F97316] text-white' : 'text-[#9CA3AF]'
              }`}
            >
              Regime de Caixa
            </button>
            <button
              type="button"
              onClick={() => setRegime('competencia')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                regime === 'competencia' ? 'bg-[#F97316] text-white' : 'text-[#9CA3AF]'
              }`}
            >
              Regime de Competência
            </button>
          </div>
          <span className="text-xs text-[#9CA3AF] hidden md:inline">
            {regime === 'caixa'
              ? 'Considera valores efetivamente recebidos e pagos'
              : 'Considera todos os pedidos e contas lançadas no período'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRevForm({
                description: '',
                category: 'Outras Receitas',
                amount: 0,
                dueDate: getTodayISO(),
                paymentDate: getTodayISO(),
                paymentMethod: 'PIX',
                status: 'pago',
                notes: '',
              });
              setRevModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1D2027] border border-[#282C35] hover:border-emerald-500 text-xs font-medium text-[#F5F5F5] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            Nova receita
          </button>
          <button
            type="button"
            onClick={openNewExpense}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova despesa
          </button>
        </div>
      </div>

      {/* KPIs separating Production Costs and Admin Expenses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label={regime === 'caixa' ? 'Receitas recebidas' : 'Receita bruta (pedidos)'}
          value={formatBRL(metrics.activeRevenue)}
          tone="positive"
        />
        <KpiCard
          label="Custos de produção"
          value={formatBRL(metrics.productionCosts)}
          subtext="Material + energia + deprec."
        />
        <KpiCard
          label="Lucro bruto"
          value={formatBRL(metrics.grossProfit)}
          tone={metrics.grossProfit >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Despesas operacionais"
          value={formatBRL(metrics.activeAdminExp)}
          subtext="Separadas da produção"
          tone={metrics.activeAdminExp > 0 ? 'negative' : 'default'}
        />
        <KpiCard
          label="Resultado líquido"
          value={formatBRL(metrics.netResult)}
          tone={metrics.netResult >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="A Receber / A Pagar"
          value={`${formatBRL(metrics.orderReceivables)}`}
          subtext={`A pagar: ${formatBRL(metrics.payables)}`}
        />
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#17191E] border border-[#282C35] overflow-x-auto">
          {(
            [
              { id: 'fluxo', label: 'Fluxo de Caixa' },
              { id: 'pagar', label: `Contas a Pagar (${expenses.filter((e) => e.status !== 'pago' && e.status !== 'cancelado').length})` },
              { id: 'receber', label: `Contas a Receber (${openReceivables.length})` },
              { id: 'categorias', label: 'Despesas por Categoria' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                tab === t.id ? 'bg-[#F97316] text-white' : 'text-[#9CA3AF]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar lançamentos..."
              className="w-full bg-[#1D2027] border border-[#282C35] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#F5F5F5] outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#1D2027] border border-[#282C35] rounded-lg px-3 py-1.5 text-xs text-[#F5F5F5] outline-none"
          >
            <option value="todos">Todos os status</option>
            <option value="pago">Pago</option>
            <option value="pendente">Pendente</option>
            <option value="atrasado">Atrasado</option>
          </select>
        </div>
      </div>

      {tab === 'fluxo' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          {sortedTransactions.length === 0 ? (
            isSectionLoading && transactions.length === 0 ? (
              <LoadingState label="Carregando fluxo financeiro do banco de dados..." />
            ) : (
              <EmptyState
                icon={<DollarSign className="w-6 h-6" />}
                title="Nenhuma movimentação financeira"
                description="Recebimentos de pedidos, custos de produção e despesas lançadas aparecerão aqui automaticamente."
                actionLabel="Lançar despesa"
                onAction={openNewExpense}
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                    <th className="py-3 px-4 font-medium">Data</th>
                    <th className="py-3 px-4 font-medium">Descrição</th>
                    <th className="py-3 px-4 font-medium">Categoria</th>
                    <th className="py-3 px-4 font-medium">Natureza</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Valor</th>
                    <th className="py-3 px-4 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282C35]">
                  {sortedTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-[#232730]">
                      <td className="py-3 px-4 font-mono tabular-nums text-[#9CA3AF]">
                        {formatDateBR(t.paymentDate || t.dueDate || t.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#F5F5F5]">{t.description}</td>
                      <td className="py-3 px-4 text-[#9CA3AF]">{t.category}</td>
                      <td className="py-3 px-4 text-[#9CA3AF]">
                        {t.isProductionCost
                          ? 'Custo de produção'
                          : t.type === 'receita'
                            ? 'Receita'
                            : 'Despesa admin.'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText
                          label={t.status}
                          tone={
                            t.status === 'pago'
                              ? 'positive'
                              : t.status === 'atrasado'
                                ? 'danger'
                                : t.status === 'pendente'
                                  ? 'warning'
                                  : 'neutral'
                          }
                        />
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                          t.type === 'receita' ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {t.type === 'receita' ? '+' : '-'} {formatBRL(t.amount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!t.orderId && !t.isProductionCost && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({ kind: 'trx', id: t.id, label: t.description })
                            }
                            className="p-1 text-[#9CA3AF] hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'pagar' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          {expenses.length === 0 ? (
            isSectionLoading ? (
              <LoadingState label="Carregando despesas do banco de dados..." />
            ) : (
              <EmptyState
                icon={<DollarSign className="w-6 h-6" />}
                title="Nenhuma despesa cadastrada"
                description="Lance despesas fixas e variáveis como energia, aluguel, manutenção e embalagens."
                actionLabel="Cadastrar despesa"
                onAction={openNewExpense}
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                    <th className="py-3 px-4 font-medium">Vencimento</th>
                    <th className="py-3 px-4 font-medium">Descrição</th>
                    <th className="py-3 px-4 font-medium">Categoria</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Valor</th>
                    <th className="py-3 px-4 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282C35]">
                  {expenses.map((e) => {
                    const days = diffDaysFromToday(e.dueDate);
                    const overdue = e.status === 'pendente' && days !== null && days < 0;
                    return (
                      <tr key={e.id} className="hover:bg-[#232730]">
                        <td className="py-3 px-4 font-mono tabular-nums text-[#9CA3AF]">
                          {formatDateBR(e.dueDate)}
                        </td>
                        <td className="py-3 px-4 font-medium text-[#F5F5F5]">{e.description}</td>
                        <td className="py-3 px-4 text-[#9CA3AF]">{e.category}</td>
                        <td className="py-3 px-4">
                          <StatusText
                            label={overdue ? 'Atrasado' : e.status}
                            tone={
                              e.status === 'pago'
                                ? 'positive'
                                : overdue || e.status === 'atrasado'
                                  ? 'danger'
                                  : e.status === 'pendente'
                                    ? 'warning'
                                    : 'neutral'
                            }
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#F5F5F5]">
                          {formatBRL(e.amount)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            {(e.status === 'pendente' || e.status === 'atrasado') && (
                              <button
                                type="button"
                                onClick={() => handleMarkExpensePaid(e)}
                                title="Marcar como paga"
                                className="p-1.5 text-[#9CA3AF] hover:text-emerald-400 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditExpense(e)}
                              className="p-1.5 text-[#9CA3AF] hover:text-[#F97316] cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({ kind: 'exp', id: e.id, label: e.description })
                              }
                              className="p-1.5 text-[#9CA3AF] hover:text-red-400 cursor-pointer"
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
          )}
        </div>
      )}

      {tab === 'receber' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          {openReceivables.length === 0 ? (
            isSectionLoading && orders.length === 0 ? (
              <LoadingState label="Carregando contas a receber do banco de dados..." />
            ) : (
              <EmptyState
                icon={<CheckCircle2 className="w-6 h-6" />}
                title="Nenhum valor pendente a receber"
                description="Todos os pedidos ativos já estão quitados."
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                    <th className="py-3 px-4 font-medium">Pedido</th>
                    <th className="py-3 px-4 font-medium">Cliente</th>
                    <th className="py-3 px-4 font-medium text-right">Total</th>
                    <th className="py-3 px-4 font-medium text-right">Pago</th>
                    <th className="py-3 px-4 font-medium text-right">Saldo a Receber</th>
                    <th className="py-3 px-4 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282C35]">
                  {openReceivables.map((o) => {
                    const remaining = Math.max(0, o.totalValue - o.paidAmount);
                    return (
                      <tr key={o.id} className="hover:bg-[#232730]">
                        <td className="py-3 px-4 font-mono font-semibold text-[#F5F5F5]">
                          {o.orderNumber}
                        </td>
                        <td className="py-3 px-4 text-[#F5F5F5]">{o.customerName}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                          {formatBRL(o.totalValue)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">
                          {formatBRL(o.paidAmount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-amber-400">
                          {formatBRL(remaining)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!tenant) {
                                showToast('Sessão da empresa não inicializada.', 'error');
                                return;
                              }
                              try {
                                await recordOrderPayment(
                                  tenant,
                                  o.id,
                                  remaining,
                                  o.paymentMethod || 'PIX',
                                  getTodayISO()
                                );
                                showToast(`Saldo de ${o.orderNumber} quitado!`);
                              } catch (err) {
                                showToast(
                                  formatFirestoreErrorMessage(err, 'Erro ao quitar saldo.'),
                                  'error'
                                );
                              }
                            }}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer"
                          >
                            Quitar saldo
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'categorias' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 space-y-4">
          <h3 className="text-base font-semibold text-[#F5F5F5]">Despesas por categoria</h3>
          {expensesByCategory.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] py-8 text-center">
              Nenhuma despesa registrada ainda.
            </p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expensesByCategory} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#282C35" horizontal={false} />
                  <XAxis type="number" stroke="#9CA3AF" fontSize={11} />
                  <YAxis type="category" dataKey="categoria" stroke="#9CA3AF" fontSize={11} width={130} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#17191E',
                      borderColor: '#282C35',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(v: unknown) => formatBRL(Number(v))}
                  />
                  <Bar dataKey="valor" name="Total" fill="#F97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Expense Modal */}
      <Modal
        open={expModalOpen}
        onClose={() => setExpModalOpen(false)}
        title={editingExp ? 'Editar despesa' : 'Lançar despesa'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div>
            <label className={labelClass}>Descrição *</label>
            <input
              type="text"
              required
              value={expForm.description}
              onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
              placeholder="Ex: Conta de energia elétrica — Novembro"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Categoria</label>
              <select
                value={expForm.category}
                onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                className={inputClass}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Valor (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={expForm.amount}
                onChange={(e) => setExpForm({ ...expForm, amount: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Vencimento</label>
              <input
                type="date"
                value={expForm.dueDate}
                onChange={(e) => setExpForm({ ...expForm, dueDate: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={expForm.status}
                onChange={(e) =>
                  setExpForm({ ...expForm, status: e.target.value as FinancialStatus })
                }
                className={inputClass}
              >
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="atrasado">Atrasado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Forma de pagamento</label>
              <select
                value={expForm.paymentMethod}
                onChange={(e) => setExpForm({ ...expForm, paymentMethod: e.target.value })}
                className={inputClass}
              >
                <option value="PIX">PIX</option>
                <option value="Boleto">Boleto</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Débito Automático">Débito Automático</option>
                <option value="Transferência">Transferência</option>
              </select>
            </div>
            {expForm.status === 'pago' && (
              <div>
                <label className={labelClass}>Data pagamento</label>
                <input
                  type="date"
                  value={expForm.paymentDate}
                  onChange={(e) => setExpForm({ ...expForm, paymentDate: e.target.value })}
                  className={inputClass}
                />
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>Observações</label>
            <textarea
              rows={2}
              value={expForm.notes}
              onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setExpModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={savingExp}
              className="px-5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              Salvar despesa
            </LoadingButton>
          </div>
        </form>
      </Modal>

      {/* Other Revenue Modal */}
      <Modal
        open={revModalOpen}
        onClose={() => setRevModalOpen(false)}
        title="Registrar outra receita"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveRevenue} className="space-y-4">
          <div>
            <label className={labelClass}>Descrição *</label>
            <input
              type="text"
              required
              value={revForm.description}
              onChange={(e) => setRevForm({ ...revForm, description: e.target.value })}
              placeholder="Ex: Serviço de modelagem 3D avulso"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Categoria</label>
              <select
                value={revForm.category}
                onChange={(e) => setRevForm({ ...revForm, category: e.target.value })}
                className={inputClass}
              >
                <option value="Outras Receitas">Outras Receitas</option>
                <option value="Modelagem 3D">Modelagem 3D</option>
                <option value="Consultoria">Consultoria</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Valor (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={revForm.amount}
                onChange={(e) => setRevForm({ ...revForm, amount: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Data do recebimento</label>
              <input
                type="date"
                value={revForm.paymentDate}
                onChange={(e) => setRevForm({ ...revForm, paymentDate: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Forma de pagamento</label>
              <select
                value={revForm.paymentMethod}
                onChange={(e) => setRevForm({ ...revForm, paymentMethod: e.target.value })}
                className={inputClass}
              >
                <option value="PIX">PIX</option>
                <option value="Cartão">Cartão</option>
                <option value="Transferência">Transferência</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRevModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={savingRev}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              Salvar receita
            </LoadingButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir lançamento"
        description={`Tem certeza que deseja excluir "${deleteTarget?.label}"?`}
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
