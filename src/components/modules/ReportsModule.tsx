import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Layers,
  Package,
  Printer as PrinterIcon,
  TrendingUp,
  Users,
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
} from 'recharts';
import { useErp } from '../../context/ErpContext';
import {
  exportReportPDF,
  exportToCSV,
} from '../../utils/exporters';
import {
  addDaysISO,
  formatBRL,
  formatDateBR,
  formatGrams,
  formatMinutesToHours,
  formatNumber,
  getTodayISO,
  toISODateString,
} from '../../utils/formatters';
import { EmptyState, KpiCard, StatusText } from '../common/UiPrimitives';

type ReportTab =
  | 'financeiro'
  | 'produtos'
  | 'clientes'
  | 'materiais'
  | 'pedidos'
  | 'impressoras';

export const ReportsModule: React.FC = () => {
  const {
    company,
    orders,
    transactions,
    expenses,
    productionJobs,
    materials,
    inventoryMovements,
    printers,
    products,
    customers,
    showToast,
  } = useErp();

  const today = getTodayISO();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [activeTab, setActiveTab] = useState<ReportTab>('financeiro');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [preset, setPreset] = useState<'mes' | '30d' | '90d' | 'tudo' | 'custom'>('mes');

  const applyPreset = (p: 'mes' | '30d' | '90d' | 'tudo') => {
    setPreset(p);
    if (p === 'mes') {
      setStartDate(`${today.slice(0, 7)}-01`);
      setEndDate(today);
    } else if (p === '30d') {
      setStartDate(addDaysISO(-30));
      setEndDate(today);
    } else if (p === '90d') {
      setStartDate(addDaysISO(-90));
      setEndDate(today);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const inRange = (rawDate: unknown): boolean => {
    const iso = toISODateString(rawDate as Parameters<typeof toISODateString>[0]);
    if (!iso) return preset === 'tudo' || (!startDate && !endDate);
    if (startDate && iso < startDate) return false;
    if (endDate && iso > endDate) return false;
    return true;
  };

  const periodLabel = useMemo(() => {
    if (!startDate && !endDate) return 'Todo o período';
    const startLabel = startDate ? formatDateBR(startDate) : 'Início';
    const endLabel = endDate ? formatDateBR(endDate) : 'Hoje';
    return `${startLabel} a ${endLabel}`;
  }, [startDate, endDate]);

  // Filtered datasets
  const filteredOrders = useMemo(
    () => orders.filter((o) => o.status !== 'cancelado' && inRange(o.createdAt)),
    [orders, startDate, endDate, preset]
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.status !== 'cancelado' &&
          inRange(t.paymentDate || t.dueDate || t.createdAt)
      ),
    [transactions, startDate, endDate, preset]
  );

  const filteredExpenses = useMemo(
    () =>
      expenses.filter(
        (e) =>
          e.status !== 'cancelado' &&
          inRange(e.paymentDate || e.dueDate || e.createdAt)
      ),
    [expenses, startDate, endDate, preset]
  );

  const filteredJobs = useMemo(
    () =>
      productionJobs.filter((j) =>
        inRange(j.finishedAt || j.startedAt || j.createdAt)
      ),
    [productionJobs, startDate, endDate, preset]
  );

  const filteredMovements = useMemo(
    () => inventoryMovements.filter((m) => inRange(m.createdAt)),
    [inventoryMovements, startDate, endDate, preset]
  );

  // 1. Financial & Monthly summary
  const financialReport = useMemo(() => {
    const totalRevenueCash = filteredTransactions
      .filter((t) => t.type === 'receita' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);

    const totalOrdersValue = filteredOrders.reduce((acc, o) => acc + o.totalValue, 0);

    const totalAdminExpenses = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);

    const totalProductionCosts = filteredJobs
      .filter((j) => j.status === 'finalizado' || j.status === 'falha_impressao')
      .reduce((acc, j) => acc + (j.totalActualCost || 0), 0);

    const netProfit = totalRevenueCash - totalProductionCosts - totalAdminExpenses;

    const monthlyMap = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        faturamento: number;
        custoProducao: number;
        despesas: number;
        lucro: number;
      }
    >();

    const ensureMonth = (key: string) => {
      if (!monthlyMap.has(key)) {
        const [y, m] = key.split('-');
        monthlyMap.set(key, {
          monthKey: key,
          monthLabel: `${m}/${y}`,
          faturamento: 0,
          custoProducao: 0,
          despesas: 0,
          lucro: 0,
        });
      }
      return monthlyMap.get(key)!;
    };

    filteredTransactions
      .filter((t) => t.type === 'receita' && t.status === 'pago')
      .forEach((t) => {
        const iso = toISODateString(t.paymentDate || t.dueDate || t.createdAt);
        if (!iso) return;
        const row = ensureMonth(iso.slice(0, 7));
        row.faturamento += t.amount;
      });

    filteredExpenses.forEach((e) => {
      const iso = toISODateString(e.paymentDate || e.dueDate || e.createdAt);
      if (!iso) return;
      const row = ensureMonth(iso.slice(0, 7));
      row.despesas += e.amount;
    });

    filteredJobs
      .filter((j) => j.status === 'finalizado' || j.status === 'falha_impressao')
      .forEach((j) => {
        const iso = toISODateString(j.finishedAt || j.startedAt || j.createdAt);
        if (!iso) return;
        const row = ensureMonth(iso.slice(0, 7));
        row.custoProducao += j.totalActualCost || 0;
      });

    const monthlyRows = Array.from(monthlyMap.values())
      .map((r) => ({
        ...r,
        faturamento: Number(r.faturamento.toFixed(2)),
        custoProducao: Number(r.custoProducao.toFixed(2)),
        despesas: Number(r.despesas.toFixed(2)),
        lucro: Number((r.faturamento - r.custoProducao - r.despesas).toFixed(2)),
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    const completedPrints = filteredJobs.filter((j) => j.status === 'finalizado');
    const avgPrintCost =
      completedPrints.length > 0
        ? completedPrints.reduce((acc, j) => acc + (j.totalActualCost || 0), 0) /
          completedPrints.length
        : 0;

    return {
      totalRevenueCash,
      totalOrdersValue,
      totalAdminExpenses,
      totalProductionCosts,
      netProfit,
      avgPrintCost,
      monthlyRows,
    };
  }, [filteredTransactions, filteredOrders, filteredExpenses, filteredJobs]);

  // 2. Top Products & Profitability
  const productReport = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        sku: string;
        quantity: number;
        revenue: number;
        cost: number;
        profit: number;
        marginPercent: number;
      }
    >();

    const prodMap = new Map(products.map((p) => [p.id, p]));

    filteredOrders.forEach((order) => {
      order.items.forEach((item) => {
        const key = item.productId || item.productName;
        const prod = item.productId ? prodMap.get(item.productId) : undefined;
        const existing = map.get(key) || {
          key,
          name: item.productName,
          sku: prod?.sku || (item.isCustom ? 'Personalizado' : '—'),
          quantity: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          marginPercent: 0,
        };
        const itemCost = (item.unitCost || 0) * item.quantity;
        existing.quantity += item.quantity;
        existing.revenue += item.totalPrice;
        existing.cost += itemCost;
        map.set(key, existing);
      });
    });

    return Array.from(map.values())
      .map((row) => {
        const profit = row.revenue - row.cost;
        const marginPercent = row.revenue > 0 ? (profit / row.revenue) * 100 : 0;
        return {
          ...row,
          revenue: Number(row.revenue.toFixed(2)),
          cost: Number(row.cost.toFixed(2)),
          profit: Number(profit.toFixed(2)),
          marginPercent: Number(marginPercent.toFixed(1)),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, products]);

  // 3. Top Customers
  const customerReport = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        contact: string;
        ordersCount: number;
        totalSpent: number;
        totalPaid: number;
        pendingAmount: number;
        avgTicket: number;
      }
    >();

    const custMap = new Map(customers.map((c) => [c.id, c]));

    filteredOrders.forEach((order) => {
      const key = order.customerId || order.customerName || 'avulso';
      const cust = order.customerId ? custMap.get(order.customerId) : undefined;
      const existing = map.get(key) || {
        key,
        name: cust?.fullName || order.customerName || 'Cliente Avulso',
        contact: cust?.phone || cust?.whatsapp || cust?.email || '—',
        ordersCount: 0,
        totalSpent: 0,
        totalPaid: 0,
        pendingAmount: 0,
        avgTicket: 0,
      };
      existing.ordersCount += 1;
      existing.totalSpent += order.totalValue;
      existing.totalPaid += order.paidAmount;
      existing.pendingAmount += Math.max(0, order.totalValue - order.paidAmount);
      map.set(key, existing);
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        totalSpent: Number(row.totalSpent.toFixed(2)),
        totalPaid: Number(row.totalPaid.toFixed(2)),
        pendingAmount: Number(row.pendingAmount.toFixed(2)),
        avgTicket: row.ordersCount > 0 ? Number((row.totalSpent / row.ordersCount).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [filteredOrders, customers]);

  // 4. Material Usage & Filament Consumption
  const materialReport = useMemo(() => {
    const matMap = new Map(materials.map((m) => [m.id, m]));
    const usageMap = new Map<
      string,
      {
        materialId: string;
        name: string;
        materialType: string;
        color: string;
        consumedGrams: number;
        wasteGrams: number;
        totalUsedGrams: number;
        totalCost: number;
        currentStockGrams: number;
      }
    >();

    filteredMovements
      .filter((m) => m.type === 'consumo' || m.type === 'desperdicio')
      .forEach((mov) => {
        const mat = matMap.get(mov.materialId);
        const existing = usageMap.get(mov.materialId) || {
          materialId: mov.materialId,
          name: mat?.name || mov.materialName,
          materialType: mat?.materialType || '—',
          color: mat?.color || '—',
          consumedGrams: 0,
          wasteGrams: 0,
          totalUsedGrams: 0,
          totalCost: 0,
          currentStockGrams: mat?.currentWeightGrams ?? 0,
        };
        if (mov.type === 'consumo') existing.consumedGrams += mov.quantityGrams;
        if (mov.type === 'desperdicio') existing.wasteGrams += mov.quantityGrams;
        existing.totalUsedGrams += mov.quantityGrams;
        existing.totalCost += mov.totalCost;
        usageMap.set(mov.materialId, existing);
      });

    // Include materials with zero movements if in inventory so user sees complete picture
    const rows = Array.from(usageMap.values())
      .map((r) => ({
        ...r,
        consumedGrams: Number(r.consumedGrams.toFixed(1)),
        wasteGrams: Number(r.wasteGrams.toFixed(1)),
        totalUsedGrams: Number(r.totalUsedGrams.toFixed(1)),
        totalCost: Number(r.totalCost.toFixed(2)),
      }))
      .sort((a, b) => b.totalUsedGrams - a.totalUsedGrams);

    const totalConsumedGrams = rows.reduce((acc, r) => acc + r.consumedGrams, 0);
    const totalWasteGrams = rows.reduce((acc, r) => acc + r.wasteGrams, 0);
    const totalMaterialCost = rows.reduce((acc, r) => acc + r.totalCost, 0);

    return { rows, totalConsumedGrams, totalWasteGrams, totalMaterialCost };
  }, [filteredMovements, materials]);

  // 5. Profitability by Order
  const orderProfitReport = useMemo(() => {
    return filteredOrders
      .map((order) => {
        const linkedJobs = productionJobs.filter((j) => j.orderId === order.id);
        const actualJobsCost = linkedJobs.reduce((acc, j) => acc + (j.totalActualCost || 0), 0);
        const hasActualCost = linkedJobs.some((j) => j.costRecorded);
        const resolvedCost = hasActualCost ? actualJobsCost : order.totalCost;
        const profit = order.totalValue - resolvedCost;
        const marginPercent = order.totalValue > 0 ? (profit / order.totalValue) * 100 : 0;

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          date: formatDateBR(order.createdAt),
          status: order.status,
          revenue: Number(order.totalValue.toFixed(2)),
          cost: Number(resolvedCost.toFixed(2)),
          costSource: hasActualCost ? 'Real (Produção)' : 'Estimado',
          profit: Number(profit.toFixed(2)),
          marginPercent: Number(marginPercent.toFixed(1)),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, productionJobs]);

  // 6. Printer Performance, Hours, Failures & Waste
  const printerReport = useMemo(() => {
    return printers
      .map((printer) => {
        const pJobs = filteredJobs.filter((j) => j.printerId === printer.id);
        const completed = pJobs.filter((j) => j.status === 'finalizado');
        const failed = pJobs.filter((j) => j.status === 'falha_impressao');
        const periodMinutes = pJobs.reduce((acc, j) => acc + (j.actualMinutes || 0), 0);
        const wasteGrams = pJobs.reduce((acc, j) => acc + (j.wasteWeightGrams || 0), 0);
        const totalCost = pJobs.reduce((acc, j) => acc + (j.totalActualCost || 0), 0);
        const attempts = completed.length + failed.length;
        const successRate = attempts > 0 ? (completed.length / attempts) * 100 : 100;

        return {
          id: printer.id,
          name: printer.name,
          model: `${printer.manufacturer} ${printer.model}`.trim(),
          status: printer.status,
          periodHours: Number((periodMinutes / 60).toFixed(2)),
          accumulatedHours: Number(printer.accumulatedHours.toFixed(2)),
          completedCount: completed.length,
          failedCount: failed.length,
          wasteGrams: Number(wasteGrams.toFixed(1)),
          totalCost: Number(totalCost.toFixed(2)),
          successRate: Number(successRate.toFixed(1)),
        };
      })
      .sort((a, b) => b.periodHours - a.periodHours);
  }, [printers, filteredJobs]);

  // Exports for the active tab
  const handleExportCSV = () => {
    if (activeTab === 'financeiro') {
      exportToCSV(
        `relatorio_financeiro_${today}`,
        ['Mês', 'Faturamento (R$)', 'Custo Produção (R$)', 'Despesas Operacionais (R$)', 'Lucro Líquido (R$)'],
        financialReport.monthlyRows.map((r) => [
          r.monthLabel,
          r.faturamento.toFixed(2),
          r.custoProducao.toFixed(2),
          r.despesas.toFixed(2),
          r.lucro.toFixed(2),
        ])
      );
    } else if (activeTab === 'produtos') {
      exportToCSV(
        `relatorio_produtos_${today}`,
        ['Produto', 'SKU', 'Qtd Vendida', 'Receita (R$)', 'Custo (R$)', 'Lucro (R$)', 'Margem (%)'],
        productReport.map((p) => [
          p.name,
          p.sku,
          p.quantity,
          p.revenue.toFixed(2),
          p.cost.toFixed(2),
          p.profit.toFixed(2),
          p.marginPercent.toFixed(1),
        ])
      );
    } else if (activeTab === 'clientes') {
      exportToCSV(
        `relatorio_clientes_${today}`,
        ['Cliente', 'Contato', 'Pedidos', 'Total Gasto (R$)', 'Pago (R$)', 'Pendente (R$)', 'Ticket Médio (R$)'],
        customerReport.map((c) => [
          c.name,
          c.contact,
          c.ordersCount,
          c.totalSpent.toFixed(2),
          c.totalPaid.toFixed(2),
          c.pendingAmount.toFixed(2),
          c.avgTicket.toFixed(2),
        ])
      );
    } else if (activeTab === 'materiais') {
      exportToCSV(
        `relatorio_materiais_${today}`,
        ['Material', 'Tipo', 'Cor', 'Consumo (g)', 'Desperdício (g)', 'Total Utilizado (g)', 'Custo (R$)'],
        materialReport.rows.map((m) => [
          m.name,
          m.materialType,
          m.color,
          m.consumedGrams,
          m.wasteGrams,
          m.totalUsedGrams,
          m.totalCost.toFixed(2),
        ])
      );
    } else if (activeTab === 'pedidos') {
      exportToCSV(
        `relatorio_lucratividade_pedidos_${today}`,
        ['Pedido', 'Cliente', 'Data', 'Base de Custo', 'Valor Total (R$)', 'Custo (R$)', 'Lucro (R$)', 'Margem (%)'],
        orderProfitReport.map((o) => [
          o.orderNumber,
          o.customerName,
          o.date,
          o.costSource,
          o.revenue.toFixed(2),
          o.cost.toFixed(2),
          o.profit.toFixed(2),
          o.marginPercent.toFixed(1),
        ])
      );
    } else {
      exportToCSV(
        `relatorio_impressoras_${today}`,
        ['Impressora', 'Modelo', 'Horas no Período', 'Horas Totais', 'Concluídas', 'Falhas', 'Desperdício (g)', 'Taxa Sucesso (%)'],
        printerReport.map((p) => [
          p.name,
          p.model,
          p.periodHours,
          p.accumulatedHours,
          p.completedCount,
          p.failedCount,
          p.wasteGrams,
          p.successRate,
        ])
      );
    }
    showToast('Arquivo CSV exportado com sucesso.');
  };

  const handleExportPDF = () => {
    const companyName = company?.name || 'PrintFlow 3D';
    if (activeTab === 'financeiro') {
      exportReportPDF(
        'Relatório Financeiro e Resultados',
        periodLabel,
        companyName,
        [
          { label: 'Receita recebida', value: formatBRL(financialReport.totalRevenueCash) },
          { label: 'Custos de produção', value: formatBRL(financialReport.totalProductionCosts) },
          { label: 'Despesas admin.', value: formatBRL(financialReport.totalAdminExpenses) },
          { label: 'Lucro líquido', value: formatBRL(financialReport.netProfit) },
        ],
        ['Mês', 'Faturamento', 'Custo Produção', 'Despesas', 'Lucro Líquido'],
        financialReport.monthlyRows.map((r) => [
          r.monthLabel,
          formatBRL(r.faturamento),
          formatBRL(r.custoProducao),
          formatBRL(r.despesas),
          formatBRL(r.lucro),
        ]),
        `relatorio_financeiro_${today}.pdf`
      );
    } else if (activeTab === 'produtos') {
      exportReportPDF(
        'Relatório de Produtos e Lucratividade',
        periodLabel,
        companyName,
        [
          { label: 'Produtos vendidos', value: String(productReport.length) },
          {
            label: 'Unidades totais',
            value: String(productReport.reduce((a, b) => a + b.quantity, 0)),
          },
          {
            label: 'Receita em produtos',
            value: formatBRL(productReport.reduce((a, b) => a + b.revenue, 0)),
          },
          {
            label: 'Lucro bruto',
            value: formatBRL(productReport.reduce((a, b) => a + b.profit, 0)),
          },
        ],
        ['Produto', 'SKU', 'Qtd', 'Receita', 'Custo', 'Lucro', 'Margem'],
        productReport.map((p) => [
          p.name,
          p.sku,
          String(p.quantity),
          formatBRL(p.revenue),
          formatBRL(p.cost),
          formatBRL(p.profit),
          `${p.marginPercent}%`,
        ]),
        `relatorio_produtos_${today}.pdf`
      );
    } else if (activeTab === 'clientes') {
      exportReportPDF(
        'Ranking de Clientes por Faturamento',
        periodLabel,
        companyName,
        [
          { label: 'Clientes ativos no período', value: String(customerReport.length) },
          {
            label: 'Total em pedidos',
            value: formatBRL(customerReport.reduce((a, b) => a + b.totalSpent, 0)),
          },
          {
            label: 'Saldo a receber',
            value: formatBRL(customerReport.reduce((a, b) => a + b.pendingAmount, 0)),
          },
        ],
        ['Cliente', 'Contato', 'Pedidos', 'Total Gasto', 'Pendente', 'Ticket Médio'],
        customerReport.map((c) => [
          c.name,
          c.contact,
          String(c.ordersCount),
          formatBRL(c.totalSpent),
          formatBRL(c.pendingAmount),
          formatBRL(c.avgTicket),
        ]),
        `relatorio_clientes_${today}.pdf`
      );
    } else if (activeTab === 'materiais') {
      exportReportPDF(
        'Relatório de Consumo de Filamentos',
        periodLabel,
        companyName,
        [
          { label: 'Consumo útil', value: formatGrams(materialReport.totalConsumedGrams) },
          { label: 'Desperdício / falhas', value: formatGrams(materialReport.totalWasteGrams) },
          { label: 'Custo de material', value: formatBRL(materialReport.totalMaterialCost) },
        ],
        ['Material', 'Tipo', 'Cor', 'Consumo', 'Desperdício', 'Total', 'Custo'],
        materialReport.rows.map((m) => [
          m.name,
          m.materialType,
          m.color,
          formatGrams(m.consumedGrams),
          formatGrams(m.wasteGrams),
          formatGrams(m.totalUsedGrams),
          formatBRL(m.totalCost),
        ]),
        `relatorio_materiais_${today}.pdf`
      );
    } else if (activeTab === 'pedidos') {
      const totalRev = orderProfitReport.reduce((a, b) => a + b.revenue, 0);
      const totalProfit = orderProfitReport.reduce((a, b) => a + b.profit, 0);
      exportReportPDF(
        'Lucratividade por Pedido',
        periodLabel,
        companyName,
        [
          { label: 'Pedidos analisados', value: String(orderProfitReport.length) },
          { label: 'Faturamento total', value: formatBRL(totalRev) },
          { label: 'Lucro líquido est.', value: formatBRL(totalProfit) },
          {
            label: 'Margem média',
            value: `${totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : '0.0'}%`,
          },
        ],
        ['Pedido', 'Cliente', 'Data', 'Base Custo', 'Total', 'Custo', 'Lucro', 'Margem'],
        orderProfitReport.map((o) => [
          o.orderNumber,
          o.customerName,
          o.date,
          o.costSource,
          formatBRL(o.revenue),
          formatBRL(o.cost),
          formatBRL(o.profit),
          `${o.marginPercent}%`,
        ]),
        `relatorio_pedidos_${today}.pdf`
      );
    } else {
      const totalHrs = printerReport.reduce((a, b) => a + b.periodHours, 0);
      const totalFails = printerReport.reduce((a, b) => a + b.failedCount, 0);
      const totalWaste = printerReport.reduce((a, b) => a + b.wasteGrams, 0);
      exportReportPDF(
        'Desempenho de Impressoras e Falhas',
        periodLabel,
        companyName,
        [
          { label: 'Máquinas cadastradas', value: String(printerReport.length) },
          { label: 'Horas no período', value: `${formatNumber(totalHrs, 1)} h` },
          { label: 'Falhas registradas', value: String(totalFails) },
          { label: 'Desperdício total', value: formatGrams(totalWaste) },
        ],
        ['Impressora', 'Horas Período', 'Horas Totais', 'Concluídas', 'Falhas', 'Desperdício', 'Sucesso'],
        printerReport.map((p) => [
          p.name,
          `${p.periodHours} h`,
          `${p.accumulatedHours} h`,
          String(p.completedCount),
          String(p.failedCount),
          formatGrams(p.wasteGrams),
          `${p.successRate}%`,
        ]),
        `relatorio_impressoras_${today}.pdf`
      );
    }
    showToast('Relatório PDF gerado.');
  };

  const tabs: { id: ReportTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'financeiro', label: 'Financeiro Mensal', icon: TrendingUp },
    { id: 'produtos', label: 'Produtos', icon: Package },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'materiais', label: 'Materiais e Consumo', icon: Layers },
    { id: 'pedidos', label: 'Lucratividade / Pedido', icon: BarChart3 },
    { id: 'impressoras', label: 'Impressoras e Falhas', icon: PrinterIcon },
  ];

  return (
    <div className="space-y-6">
      {/* Period Filters & Export Actions */}
      <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#17191E] border border-[#282C35]">
            {(
              [
                { id: 'mes', label: 'Mês atual' },
                { id: '30d', label: '30 dias' },
                { id: '90d', label: '90 dias' },
                { id: 'tudo', label: 'Tudo' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                  preset === p.id ? 'bg-[#F97316] text-white' : 'text-[#9CA3AF] hover:text-[#F5F5F5]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPreset('custom');
                setStartDate(e.target.value);
              }}
              className="bg-[#101114] border border-[#282C35] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5] outline-none"
            />
            <span className="text-[#9CA3AF]">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPreset('custom');
                setEndDate(e.target.value);
              }}
              className="bg-[#101114] border border-[#282C35] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5] outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#17191E] border border-[#282C35] hover:border-[#F97316] text-xs font-medium text-[#F5F5F5] cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Report Sub-tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-[#17191E] border border-[#282C35] overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-[#F97316] text-white'
                  : 'text-[#9CA3AF] hover:text-[#F5F5F5]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 1. FINANCIAL REPORT */}
      {activeTab === 'financeiro' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Receita recebida (Caixa)"
              value={formatBRL(financialReport.totalRevenueCash)}
              tone="positive"
              subtext={`Pedidos no período: ${formatBRL(financialReport.totalOrdersValue)}`}
            />
            <KpiCard
              label="Custos de produção"
              value={formatBRL(financialReport.totalProductionCosts)}
              subtext="Material + energia + deprec."
            />
            <KpiCard
              label="Despesas operacionais"
              value={formatBRL(financialReport.totalAdminExpenses)}
              tone={financialReport.totalAdminExpenses > 0 ? 'negative' : 'default'}
            />
            <KpiCard
              label="Lucro líquido no período"
              value={formatBRL(financialReport.netProfit)}
              tone={financialReport.netProfit >= 0 ? 'positive' : 'negative'}
            />
            <KpiCard
              label="Custo médio por impressão"
              value={formatBRL(financialReport.avgPrintCost)}
              subtext={`${filteredJobs.filter((j) => j.status === 'finalizado').length} impressões finalizadas`}
            />
          </div>

          <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#F5F5F5]">
                Evolução mensal ({periodLabel})
              </h3>
            </div>
            {financialReport.monthlyRows.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="w-6 h-6" />}
                title="Sem movimentações no período"
                description="Ajuste o filtro de datas ou registre vendas, produções e despesas para acompanhar o desempenho mensal."
              />
            ) : (
              <>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={financialReport.monthlyRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#282C35" vertical={false} />
                      <XAxis dataKey="monthLabel" stroke="#9CA3AF" fontSize={11} />
                      <YAxis stroke="#9CA3AF" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#17191E',
                          borderColor: '#282C35',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(v: unknown) => formatBRL(Number(v))}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="faturamento" name="Faturamento" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="custoProducao" name="Custo Produção" fill="#F97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="despesas" name="Despesas Admin." fill="#EF4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="lucro" name="Lucro Líquido" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto border-t border-[#282C35] pt-4">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#282C35] text-[#9CA3AF]">
                        <th className="py-2.5 px-3 font-medium">Mês</th>
                        <th className="py-2.5 px-3 font-medium text-right">Faturamento</th>
                        <th className="py-2.5 px-3 font-medium text-right">Custo Produção</th>
                        <th className="py-2.5 px-3 font-medium text-right">Despesas Admin.</th>
                        <th className="py-2.5 px-3 font-medium text-right">Lucro Líquido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#282C35]">
                      {financialReport.monthlyRows.map((row) => (
                        <tr key={row.monthKey} className="hover:bg-[#232730]">
                          <td className="py-2.5 px-3 font-mono font-semibold text-[#F5F5F5]">
                            {row.monthLabel}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-400">
                            {formatBRL(row.faturamento)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#F97316]">
                            {formatBRL(row.custoProducao)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-400">
                            {formatBRL(row.despesas)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                              row.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {formatBRL(row.lucro)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. PRODUCTS REPORT */}
      {activeTab === 'produtos' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          {productReport.length === 0 ? (
            <EmptyState
              icon={<Package className="w-6 h-6" />}
              title="Nenhuma venda de produto no período"
              description="Quando houver pedidos emitidos no período selecionado, o ranking de produtos mais vendidos e lucrativos será exibido aqui."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                    <th className="py-3 px-4 font-medium">Produto / Peça</th>
                    <th className="py-3 px-4 font-medium">SKU</th>
                    <th className="py-3 px-4 font-medium text-right">Qtd Vendida</th>
                    <th className="py-3 px-4 font-medium text-right">Faturamento</th>
                    <th className="py-3 px-4 font-medium text-right">Custo Est.</th>
                    <th className="py-3 px-4 font-medium text-right">Lucro</th>
                    <th className="py-3 px-4 font-medium text-right">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282C35]">
                  {productReport.map((p) => (
                    <tr key={p.key} className="hover:bg-[#232730]">
                      <td className="py-3 px-4 font-medium text-[#F5F5F5]">{p.name}</td>
                      <td className="py-3 px-4 font-mono text-[#9CA3AF]">{p.sku}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {p.quantity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {formatBRL(p.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                        {formatBRL(p.cost)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                          p.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {formatBRL(p.profit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F97316]">
                        {formatNumber(p.marginPercent, 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. CUSTOMERS REPORT */}
      {activeTab === 'clientes' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          {customerReport.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="Sem compras de clientes no período"
              description="Os clientes com pedidos registrados no período selecionado aparecerão ranqueados aqui."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                    <th className="py-3 px-4 font-medium">Cliente</th>
                    <th className="py-3 px-4 font-medium">Contato</th>
                    <th className="py-3 px-4 font-medium text-right">Pedidos</th>
                    <th className="py-3 px-4 font-medium text-right">Total Gasto</th>
                    <th className="py-3 px-4 font-medium text-right">Valor Pago</th>
                    <th className="py-3 px-4 font-medium text-right">Pendente</th>
                    <th className="py-3 px-4 font-medium text-right">Ticket Médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282C35]">
                  {customerReport.map((c) => (
                    <tr key={c.key} className="hover:bg-[#232730]">
                      <td className="py-3 px-4 font-medium text-[#F5F5F5]">{c.name}</td>
                      <td className="py-3 px-4 text-[#9CA3AF]">{c.contact}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {c.ordersCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-400">
                        {formatBRL(c.totalSpent)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                        {formatBRL(c.totalPaid)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          c.pendingAmount > 0 ? 'text-amber-400' : 'text-[#9CA3AF]'
                        }`}
                      >
                        {formatBRL(c.pendingAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {formatBRL(c.avgTicket)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. MATERIALS REPORT */}
      {activeTab === 'materiais' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Consumo útil de filamento"
              value={formatGrams(materialReport.totalConsumedGrams)}
              tone="accent"
            />
            <KpiCard
              label="Desperdício / falhas"
              value={formatGrams(materialReport.totalWasteGrams)}
              tone={materialReport.totalWasteGrams > 0 ? 'negative' : 'default'}
            />
            <KpiCard
              label="Custo de material consumido"
              value={formatBRL(materialReport.totalMaterialCost)}
            />
          </div>

          <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
            {materialReport.rows.length === 0 ? (
              <EmptyState
                icon={<Layers className="w-6 h-6" />}
                title="Sem consumo de filamentos no período"
                description="Baixas automáticas de produção e movimentações de consumo ou desperdício aparecerão aqui."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                      <th className="py-3 px-4 font-medium">Material / Filamento</th>
                      <th className="py-3 px-4 font-medium">Tipo</th>
                      <th className="py-3 px-4 font-medium">Cor</th>
                      <th className="py-3 px-4 font-medium text-right">Consumo Útil</th>
                      <th className="py-3 px-4 font-medium text-right">Desperdício</th>
                      <th className="py-3 px-4 font-medium text-right">Total Baixado</th>
                      <th className="py-3 px-4 font-medium text-right">Saldo Atual</th>
                      <th className="py-3 px-4 font-medium text-right">Custo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#282C35]">
                    {materialReport.rows.map((m) => (
                      <tr key={m.materialId} className="hover:bg-[#232730]">
                        <td className="py-3 px-4 font-medium text-[#F5F5F5]">{m.name}</td>
                        <td className="py-3 px-4 text-[#9CA3AF]">{m.materialType}</td>
                        <td className="py-3 px-4 text-[#9CA3AF]">{m.color}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                          {formatGrams(m.consumedGrams)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-400">
                          {formatGrams(m.wasteGrams)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#F97316]">
                          {formatGrams(m.totalUsedGrams)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                          {formatGrams(m.currentStockGrams)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                          {formatBRL(m.totalCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. PROFITABILITY PER ORDER */}
      {activeTab === 'pedidos' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          {orderProfitReport.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="w-6 h-6" />}
              title="Nenhum pedido encontrado no período"
              description="A lucratividade individual de cada pedido é calculada comparando o valor vendido com o custo real de produção (ou custo estimado antes da impressão)."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                    <th className="py-3 px-4 font-medium">Pedido</th>
                    <th className="py-3 px-4 font-medium">Cliente</th>
                    <th className="py-3 px-4 font-medium">Data</th>
                    <th className="py-3 px-4 font-medium">Base de Custo</th>
                    <th className="py-3 px-4 font-medium text-right">Valor Venda</th>
                    <th className="py-3 px-4 font-medium text-right">Custo</th>
                    <th className="py-3 px-4 font-medium text-right">Lucro</th>
                    <th className="py-3 px-4 font-medium text-right">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282C35]">
                  {orderProfitReport.map((o) => (
                    <tr key={o.id} className="hover:bg-[#232730]">
                      <td className="py-3 px-4 font-mono font-semibold text-[#F5F5F5]">
                        {o.orderNumber}
                      </td>
                      <td className="py-3 px-4 text-[#F5F5F5]">{o.customerName}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#9CA3AF]">{o.date}</td>
                      <td className="py-3 px-4">
                        <StatusText
                          label={o.costSource}
                          tone={o.costSource === 'Real (Produção)' ? 'positive' : 'neutral'}
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {formatBRL(o.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                        {formatBRL(o.cost)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                          o.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {formatBRL(o.profit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F97316]">
                        {formatNumber(o.marginPercent, 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 6. PRINTERS & FAILURES REPORT */}
      {activeTab === 'impressoras' && (
        <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
          {printerReport.length === 0 ? (
            <EmptyState
              icon={<PrinterIcon className="w-6 h-6" />}
              title="Nenhuma impressora cadastrada"
              description="Cadastre suas impressoras 3D para acompanhar horas de uso, taxa de sucesso e desperdícios."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                    <th className="py-3 px-4 font-medium">Impressora</th>
                    <th className="py-3 px-4 font-medium">Modelo</th>
                    <th className="py-3 px-4 font-medium text-right">Horas (Período)</th>
                    <th className="py-3 px-4 font-medium text-right">Horas Acumuladas</th>
                    <th className="py-3 px-4 font-medium text-right">Concluídas</th>
                    <th className="py-3 px-4 font-medium text-right">Falhas</th>
                    <th className="py-3 px-4 font-medium text-right">Desperdício</th>
                    <th className="py-3 px-4 font-medium text-right">Taxa Sucesso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282C35]">
                  {printerReport.map((p) => (
                    <tr key={p.id} className="hover:bg-[#232730]">
                      <td className="py-3 px-4 font-medium text-[#F5F5F5]">{p.name}</td>
                      <td className="py-3 px-4 text-[#9CA3AF]">{p.model || '—'}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {formatMinutesToHours(p.periodHours * 60)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                        {formatNumber(p.accumulatedHours, 1)} h
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">
                        {p.completedCount}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          p.failedCount > 0 ? 'text-red-400 font-semibold' : 'text-[#9CA3AF]'
                        }`}
                      >
                        {p.failedCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-red-400">
                        {formatGrams(p.wasteGrams)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#F97316]">
                        {formatNumber(p.successRate, 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
