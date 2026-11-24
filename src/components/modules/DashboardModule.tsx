import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  DollarSign,
  FileText,
  Layers,
  Plus,
  UserPlus,
  ArrowUpRight,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
  Area,
} from 'recharts';
import { useErp } from '../../context/ErpContext';
import { KpiCard, StatusText } from '../common/UiPrimitives';
import {
  formatBRL,
  formatDateBR,
  formatNumber,
  toDateObject,
  toISODateString,
} from '../../utils/formatters';

type PeriodFilter = '7d' | '30d' | '90d' | 'mes_atual';

export const DashboardModule: React.FC = () => {
  const {
    orders,
    transactions,
    expenses,
    productionJobs,
    printers,
    smartAlerts,
    setActiveSection,
    triggerQuickAction,
  } = useErp();

  const [period, setPeriod] = useState<PeriodFilter>('30d');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const isCurrentMonth = (dateVal: unknown) => {
    const d = toDateObject(dateVal as string);
    if (!d) return false;
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  };

  // 8 Real KPI Calculations
  const kpis = useMemo(() => {
    const monthPaidRevenues = transactions
      .filter(
        (t) =>
          t.type === 'receita' &&
          t.status === 'pago' &&
          isCurrentMonth(t.paymentDate || t.createdAt)
      )
      .reduce((acc, t) => acc + t.amount, 0);

    const monthAdminExpenses = expenses
      .filter(
        (e) =>
          e.status !== 'cancelado' &&
          isCurrentMonth(e.paymentDate || e.dueDate || e.createdAt)
      )
      .reduce((acc, e) => acc + e.amount, 0);

    const monthProductionCost = productionJobs
      .filter(
        (j) =>
          (j.status === 'finalizado' || j.status === 'falha_impressao') &&
          isCurrentMonth(j.finishedAt || j.createdAt)
      )
      .reduce((acc, j) => acc + (j.totalActualCost || 0), 0);

    const monthValidOrders = orders.filter(
      (o) => o.status !== 'cancelado' && isCurrentMonth(o.createdAt)
    );
    const totalSalesMonth = monthValidOrders.reduce((acc, o) => acc + o.totalValue, 0);

    const ordersInProgress = orders.filter((o) =>
      ['aprovado', 'em_producao', 'finalizado', 'pronto_retirada', 'enviado'].includes(o.status)
    ).length;

    const ordersWaitingProduction = orders.filter(
      (o) => o.status === 'aguardando_producao'
    ).length;

    const netProfitMonth = monthPaidRevenues - monthAdminExpenses - monthProductionCost;

    const marginsFromOrders = monthValidOrders
      .filter((o) => o.totalValue > 0)
      .map((o) => ((o.totalValue - o.totalCost) / o.totalValue) * 100);
    const avgMargin =
      marginsFromOrders.length > 0
        ? marginsFromOrders.reduce((a, b) => a + b, 0) / marginsFromOrders.length
        : monthPaidRevenues > 0
          ? (netProfitMonth / monthPaidRevenues) * 100
          : 0;

    return {
      monthPaidRevenues,
      netProfitMonth,
      totalSalesMonth,
      monthOrderCount: monthValidOrders.length,
      ordersInProgress,
      ordersWaitingProduction,
      monthAdminExpenses,
      monthProductionCost,
      avgMargin,
    };
  }, [transactions, expenses, productionJobs, orders, currentMonth, currentYear]);

  // Financial Chart Data by Day
  const financialChartData = useMemo(() => {
    const daysCount =
      period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : now.getDate();

    const dayMap = new Map<
      string,
      { iso: string; label: string; faturamento: number; despesas: number; lucro: number }
    >();

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const iso = toISODateString(d);
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      dayMap.set(iso, { iso, label, faturamento: 0, despesas: 0, lucro: 0 });
    }

    transactions.forEach((t) => {
      if (t.status === 'cancelado') return;
      const iso = toISODateString(t.paymentDate || t.dueDate || t.createdAt);
      const entry = dayMap.get(iso);
      if (!entry) return;
      if (t.type === 'receita' && t.status === 'pago') {
        entry.faturamento = Number((entry.faturamento + t.amount).toFixed(2));
      } else if (t.type === 'despesa') {
        entry.despesas = Number((entry.despesas + t.amount).toFixed(2));
      }
    });

    dayMap.forEach((entry) => {
      entry.lucro = Number((entry.faturamento - entry.despesas).toFixed(2));
    });

    return Array.from(dayMap.values());
  }, [transactions, period]);

  // Orders Status Chart Data
  const ordersChartData = useMemo(() => {
    const novos = orders.filter((o) =>
      ['novo_orcamento', 'aguardando_aprovacao', 'aprovado', 'aguardando_producao'].includes(
        o.status
      )
    ).length;
    const emProducao = orders.filter((o) => o.status === 'em_producao').length;
    const finalizados = orders.filter((o) =>
      ['finalizado', 'pronto_retirada', 'enviado'].includes(o.status)
    ).length;
    const entregues = orders.filter((o) => o.status === 'entregue').length;

    return [
      { etapa: 'Novos / Fila', quantidade: novos },
      { etapa: 'Em produção', quantidade: emProducao },
      { etapa: 'Finalizados', quantidade: finalizados },
      { etapa: 'Entregues', quantidade: entregues },
    ];
  }, [orders]);

  // Production Summary & Utilization
  const productionSummary = useMemo(() => {
    const activePrints = productionJobs.filter((j) => j.status === 'imprimindo');
    const printingMinutes = activePrints.reduce((acc, j) => acc + (j.estimatedMinutes || 0), 0);
    const totalPrintedHours = productionJobs
      .filter((j) => j.status === 'finalizado')
      .reduce((acc, j) => acc + (j.actualMinutes || 0) / 60, 0);

    const activePrinters = printers.filter((p) => p.status !== 'inativa');
    const printingPrinters = printers.filter((p) => p.status === 'imprimindo');
    const monthlyCapacityHours = activePrinters.length * 24 * 30;
    const monthPrintedHours = productionJobs
      .filter(
        (j) =>
          (j.status === 'finalizado' || j.status === 'falha_impressao') &&
          isCurrentMonth(j.finishedAt || j.createdAt)
      )
      .reduce((acc, j) => acc + (j.actualMinutes || 0) / 60, 0);

    const availableHours = Math.max(0, monthlyCapacityHours - monthPrintedHours);
    const utilizationRate =
      activePrinters.length > 0
        ? Math.min(100, (monthPrintedHours / Math.max(1, activePrinters.length * 200)) * 100)
        : 0;

    return {
      activeCount: activePrints.length,
      printingPrintersCount: printingPrinters.length,
      totalPrintersCount: activePrinters.length,
      printingHoursEst: printingMinutes / 60,
      totalPrintedHours,
      monthPrintedHours,
      availableHours,
      utilizationRate,
    };
  }, [productionJobs, printers]);

  const handleQuick = (section: Parameters<typeof setActiveSection>[0], action: string) => {
    triggerQuickAction(action);
    setActiveSection(section);
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions Bar */}
      <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#F5F5F5]">Ações rápidas</h2>
          <p className="text-xs text-[#9CA3AF]">
            Atalhos operacionais para iniciar novos lançamentos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleQuick('orders', 'new_order')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo pedido
          </button>
          <button
            type="button"
            onClick={() => handleQuick('quotes', 'new_quote')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#17191E] border border-[#2C313D] hover:border-[#F97316] text-[#F5F5F5] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-[#F97316]" />
            Novo orçamento
          </button>
          <button
            type="button"
            onClick={() => handleQuick('customers', 'new_customer')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#17191E] border border-[#2C313D] hover:border-[#F97316] text-[#F5F5F5] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#F97316]" />
            Novo cliente
          </button>
          <button
            type="button"
            onClick={() => handleQuick('production', 'new_job')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#17191E] border border-[#2C313D] hover:border-[#F97316] text-[#F5F5F5] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-[#F97316]" />
            Nova impressão
          </button>
          <button
            type="button"
            onClick={() => handleQuick('inventory', 'new_material')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#17191E] border border-[#2C313D] hover:border-[#F97316] text-[#F5F5F5] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Boxes className="w-3.5 h-3.5 text-[#F97316]" />
            Entrada de estoque
          </button>
          <button
            type="button"
            onClick={() => handleQuick('financial', 'new_expense')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#17191E] border border-[#2C313D] hover:border-[#F97316] text-[#F5F5F5] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <DollarSign className="w-3.5 h-3.5 text-[#F97316]" />
            Nova despesa
          </button>
        </div>
      </div>

      {/* 8 Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Faturamento do mês"
          value={formatBRL(kpis.monthPaidRevenues)}
          subtext="Receitas efetivamente recebidas"
          tone={kpis.monthPaidRevenues > 0 ? 'positive' : 'default'}
          onClick={() => setActiveSection('financial')}
        />
        <KpiCard
          label="Lucro líquido do mês"
          value={formatBRL(kpis.netProfitMonth)}
          subtext="Receitas menos despesas e produção"
          tone={kpis.netProfitMonth > 0 ? 'positive' : kpis.netProfitMonth < 0 ? 'negative' : 'default'}
          onClick={() => setActiveSection('financial')}
        />
        <KpiCard
          label="Total de vendas"
          value={formatBRL(kpis.totalSalesMonth)}
          subtext={`${kpis.monthOrderCount} pedido(s) no mês`}
          tone="accent"
          onClick={() => setActiveSection('orders')}
        />
        <KpiCard
          label="Pedidos em andamento"
          value={String(kpis.ordersInProgress)}
          subtext="Aprovados até envio"
          onClick={() => setActiveSection('orders')}
        />
        <KpiCard
          label="Aguardando produção"
          value={String(kpis.ordersWaitingProduction)}
          subtext="Pedidos na fila de impressão"
          onClick={() => setActiveSection('production')}
        />
        <KpiCard
          label="Despesas do mês"
          value={formatBRL(kpis.monthAdminExpenses)}
          subtext="Contas, insumos e operacionais"
          tone={kpis.monthAdminExpenses > 0 ? 'negative' : 'default'}
          onClick={() => setActiveSection('financial')}
        />
        <KpiCard
          label="Custo de produção"
          value={formatBRL(kpis.monthProductionCost)}
          subtext="Material + energia + depreciação"
          onClick={() => setActiveSection('production')}
        />
        <KpiCard
          label="Margem de lucro média"
          value={`${formatNumber(kpis.avgMargin, 1)}%`}
          subtext="Média sobre pedidos do mês"
          tone={kpis.avgMargin >= 30 ? 'positive' : kpis.avgMargin > 0 ? 'default' : 'default'}
          onClick={() => setActiveSection('reports')}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Financial Chart (2 cols) */}
        <div className="xl:col-span-2 bg-[#1D2027] border border-[#282C35] rounded-xl p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">Desempenho financeiro diário</h3>
              <p className="text-xs text-[#9CA3AF]">
                Faturamento, despesas e lucro apurado por dia
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#101114] border border-[#282C35]">
              {(
                [
                  { id: '7d', label: '7 dias' },
                  { id: '30d', label: '30 dias' },
                  { id: '90d', label: '90 dias' },
                  { id: 'mes_atual', label: 'Mês atual' },
                ] as { id: PeriodFilter; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPeriod(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    period === opt.id
                      ? 'bg-[#F97316] text-white'
                      : 'text-[#9CA3AF] hover:text-[#F5F5F5]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financialChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDesp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradLucro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#282C35" vertical={false} />
                <XAxis dataKey="label" stroke="#9CA3AF" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#9CA3AF"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `R$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#17191E',
                    borderColor: '#282C35',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F5F5F5',
                  }}
                  formatter={(value: unknown) => formatBRL(Number(value))}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="faturamento"
                  name="Faturamento"
                  stroke="#22C55E"
                  strokeWidth={2}
                  fill="url(#gradFat)"
                />
                <Area
                  type="monotone"
                  dataKey="despesas"
                  name="Despesas"
                  stroke="#EF4444"
                  strokeWidth={2}
                  fill="url(#gradDesp)"
                />
                <Area
                  type="monotone"
                  dataKey="lucro"
                  name="Lucro"
                  stroke="#F97316"
                  strokeWidth={2}
                  fill="url(#gradLucro)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Orders Pipeline Chart */}
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 flex flex-col">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">Status dos pedidos</h3>
              <p className="text-xs text-[#9CA3AF]">Distribuição atual por etapa</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('orders')}
              className="text-xs text-[#F97316] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ordersChartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#282C35" vertical={false} />
                <XAxis dataKey="etapa" stroke="#9CA3AF" fontSize={11} tickLine={false} />
                <YAxis stroke="#9CA3AF" fontSize={11} allowDecimals={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#17191E',
                    borderColor: '#282C35',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F5F5F5',
                  }}
                />
                <Bar dataKey="quantidade" name="Pedidos" fill="#F97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Production Summary & Smart Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Production Summary */}
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">Resumo da produção</h3>
              <p className="text-xs text-[#9CA3AF]">
                Capacidade e utilização real das impressoras
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('production')}
              className="text-xs text-[#F97316] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Painel Kanban <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 rounded-lg bg-[#17191E] border border-[#282C35]">
              <p className="text-xs text-[#9CA3AF]">Impressões em andamento</p>
              <p className="text-xl font-bold font-mono tabular-nums text-[#F5F5F5] mt-1">
                {productionSummary.activeCount}
              </p>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                {productionSummary.printingPrintersCount} de {productionSummary.totalPrintersCount}{' '}
                máquina(s) ocupada(s)
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#17191E] border border-[#282C35]">
              <p className="text-xs text-[#9CA3AF]">Horas de impressão (mês)</p>
              <p className="text-xl font-bold font-mono tabular-nums text-[#F5F5F5] mt-1">
                {formatNumber(productionSummary.monthPrintedHours, 1)} h
              </p>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                Total histórico: {formatNumber(productionSummary.totalPrintedHours, 1)} h
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#17191E] border border-[#282C35]">
              <p className="text-xs text-[#9CA3AF]">Horas disponíveis (mês)</p>
              <p className="text-xl font-bold font-mono tabular-nums text-[#F5F5F5] mt-1">
                {formatNumber(productionSummary.availableHours, 0)} h
              </p>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                Capacidade contínua estimada
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#17191E] border border-[#282C35]">
              <p className="text-xs text-[#9CA3AF]">Taxa de utilização</p>
              <p className="text-xl font-bold font-mono tabular-nums text-[#F97316] mt-1">
                {formatNumber(productionSummary.utilizationRate, 1)}%
              </p>
              <div className="mt-2 h-1.5 w-full bg-[#101114] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#F97316] transition-all"
                  style={{ width: `${Math.min(100, productionSummary.utilizationRate)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Live Printers List */}
          <div className="pt-2 border-t border-[#282C35]">
            <p className="text-xs font-medium text-[#9CA3AF] mb-2.5">Parque de impressoras</p>
            <div className="space-y-2">
              {printers.map((prt) => (
                <div
                  key={prt.id}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-[#282C35]/60 last:border-b-0"
                >
                  <div>
                    <span className="font-medium text-[#F5F5F5]">{prt.name}</span>
                    <span className="text-[#9CA3AF] ml-2">
                      {prt.manufacturer} {prt.model} · {prt.filamentDiameterMm}mm
                    </span>
                  </div>
                  <StatusText
                    label={
                      prt.status === 'disponivel'
                        ? 'Disponível'
                        : prt.status === 'imprimindo'
                          ? 'Imprimindo'
                          : prt.status === 'em_manutencao'
                            ? 'Em manutenção'
                            : 'Inativa'
                    }
                    tone={
                      prt.status === 'disponivel'
                        ? 'positive'
                        : prt.status === 'imprimindo'
                          ? 'accent'
                          : prt.status === 'em_manutencao'
                            ? 'warning'
                            : 'neutral'
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Smart Operational Alerts */}
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">Alertas inteligentes</h3>
              <p className="text-xs text-[#9CA3AF]">
                Monitoramento em tempo real de estoque, prazos, falhas e contas
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
              {smartAlerts.length} alerta(s)
            </span>
          </div>

          {smartAlerts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <ClipboardList className="w-8 h-8 text-emerald-400 mb-2" />
              <p className="text-sm font-medium text-[#F5F5F5]">Operação em dia</p>
              <p className="text-xs text-[#9CA3AF] mt-1 max-w-xs">
                Nenhum filamento abaixo do mínimo, pedido atrasado, conta vencida ou manutenção
                pendente foi detectado.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#282C35] max-h-80 overflow-y-auto">
              {smartAlerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => setActiveSection(alert.targetSection)}
                  className="w-full text-left py-3 px-2 hover:bg-[#232730] rounded-lg transition-colors flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        alert.severity === 'danger' ? 'text-red-400' : 'text-amber-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F5F5F5] truncate">{alert.title}</p>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">{alert.message}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[#9CA3AF] shrink-0 mt-0.5" />
                </button>
              ))}
            </div>
          )}

          {/* Recent Orders quick strip */}
          {orders.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#282C35]">
              <p className="text-xs font-medium text-[#9CA3AF] mb-2">Últimos pedidos</p>
              <div className="space-y-1.5">
                {orders.slice(0, 3).map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between text-xs text-[#9CA3AF]"
                  >
                    <span className="truncate text-[#F5F5F5]">
                      {o.orderNumber} · {o.customerName}
                    </span>
                    <span className="font-mono tabular-nums shrink-0 ml-2">
                      {formatDateBR(o.createdAt)} · {formatBRL(o.totalValue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
