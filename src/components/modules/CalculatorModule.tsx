import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { convertQuoteToOrder, saveQuote } from '../../services/erpService';
import type { QuoteItem } from '../../types/erp';
import {
  addDaysISO,
  computeGramsPerMeter,
  createEntityId,
  DEFAULT_MATERIAL_DENSITIES,
  formatBRL,
  formatDateBR,
  formatNumber,
  getTodayISO,
} from '../../utils/formatters';
import { calculate3DPrintPricing } from '../../utils/pricing';
import { LoadingButton, inputClass, labelClass } from '../common/UiPrimitives';

export const CalculatorModule: React.FC = () => {
  const {
    tenant,
    printers,
    materials,
    customers,
    quotes,
    settings,
    setActiveSection,
    showToast,
  } = useErp();

  const [partName, setPartName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedPrinterId, setSelectedPrinterId] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materialType, setMaterialType] = useState('PLA');
  const [diameterMm, setDiameterMm] = useState<1.75 | 2.85>(1.75);
  const [gramsPerMeter, setGramsPerMeter] = useState(2.98);
  const [filamentPricePerKg, setFilamentPricePerKg] = useState(110);

  const [printerAcquisitionValue, setPrinterAcquisitionValue] = useState(1650);
  const [printerLifespanHours, setPrinterLifespanHours] = useState(3000);
  const [printerPowerWatts, setPrinterPowerWatts] = useState(150);
  const [energyTariffPerKwh, setEnergyTariffPerKwh] = useState(0.92);

  const [inputMode, setInputMode] = useState<'grams' | 'meters'>('grams');
  const [weightGrams, setWeightGrams] = useState(50);
  const [lengthMeters, setLengthMeters] = useState(16.78);
  const [printHours, setPrintHours] = useState(2);
  const [printMinutes, setPrintMinutes] = useState(30);
  const [quantity, setQuantity] = useState(1);

  const [laborCost, setLaborCost] = useState(10);
  const [packagingCost, setPackagingCost] = useState(4.5);
  const [extraCosts, setExtraCosts] = useState(0);
  const [desiredMarginPercent, setDesiredMarginPercent] = useState(45);
  const [paymentFeePercent, setPaymentFeePercent] = useState(3.5);
  const [simulatedSalePrice, setSimulatedSalePrice] = useState<string>('');

  const [savingSim, setSavingSim] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [convertingOrder, setConvertingOrder] = useState(false);

  // Sync defaults when settings or printers load
  useEffect(() => {
    if (settings) {
      setEnergyTariffPerKwh(settings.energyTariffPerKwh ?? 0.92);
      setDesiredMarginPercent(settings.defaultProfitMargin ?? 45);
      setPaymentFeePercent(settings.defaultPaymentFeePercent ?? 3.5);
      setPackagingCost(settings.defaultPackagingCost ?? 4.5);
    }
  }, [settings]);

  useEffect(() => {
    if (!selectedPrinterId && printers.length > 0) {
      const p = printers[0];
      setSelectedPrinterId(p.id);
      setPrinterAcquisitionValue(p.acquisitionValue);
      setPrinterLifespanHours(p.estimatedLifespanHours);
      setPrinterPowerWatts(p.averagePowerWatts);
      setDiameterMm(p.filamentDiameterMm);
    }
  }, [printers, selectedPrinterId]);

  const resolveGramsPerMeter = (mat: string, dia: 1.75 | 2.85) => {
    const cfg = settings?.materialDensities?.[mat] || DEFAULT_MATERIAL_DENSITIES[mat];
    if (cfg) return dia === 2.85 ? cfg.gramsPerMeter285 : cfg.gramsPerMeter175;
    return computeGramsPerMeter(1.24, dia);
  };

  const handlePrinterChange = (printerId: string) => {
    setSelectedPrinterId(printerId);
    const p = printers.find((item) => item.id === printerId);
    if (p) {
      setPrinterAcquisitionValue(p.acquisitionValue);
      setPrinterLifespanHours(p.estimatedLifespanHours);
      setPrinterPowerWatts(p.averagePowerWatts);
      setDiameterMm(p.filamentDiameterMm);
      setGramsPerMeter(resolveGramsPerMeter(materialType, p.filamentDiameterMm));
    }
  };

  const handleMaterialStockChange = (matId: string) => {
    setSelectedMaterialId(matId);
    const mat = materials.find((m) => m.id === matId);
    if (mat) {
      setMaterialType(mat.materialType);
      setDiameterMm(mat.diameterMm);
      setGramsPerMeter(mat.gramsPerMeter || resolveGramsPerMeter(mat.materialType, mat.diameterMm));
      const kgPrice =
        mat.initialWeightGrams > 0
          ? (mat.acquisitionPrice / mat.initialWeightGrams) * 1000
          : mat.acquisitionPrice;
      setFilamentPricePerKg(Number(kgPrice.toFixed(2)));
    }
  };

  const handleMaterialTypeChange = (matType: string) => {
    setMaterialType(matType);
    setGramsPerMeter(resolveGramsPerMeter(matType, diameterMm));
  };

  const result = useMemo(() => {
    const parsedSim = simulatedSalePrice.trim() ? Number(simulatedSalePrice) : null;
    return calculate3DPrintPricing({
      partName,
      printerAcquisitionValue,
      printerLifespanHours,
      printerPowerWatts,
      energyTariffPerKwh,
      filamentPricePerKg,
      inputMode,
      weightGrams,
      lengthMeters,
      gramsPerMeter,
      printHours,
      printMinutes,
      quantity,
      laborCost,
      packagingCost,
      extraCosts,
      desiredMarginPercent,
      paymentFeePercent,
      simulatedSalePrice: parsedSim,
    });
  }, [
    partName,
    printerAcquisitionValue,
    printerLifespanHours,
    printerPowerWatts,
    energyTariffPerKwh,
    filamentPricePerKg,
    inputMode,
    weightGrams,
    lengthMeters,
    gramsPerMeter,
    printHours,
    printMinutes,
    quantity,
    laborCost,
    packagingCost,
    extraCosts,
    desiredMarginPercent,
    paymentFeePercent,
    simulatedSalePrice,
  ]);

  const buildQuoteItem = (): QuoteItem => {
    const printer = printers.find((p) => p.id === selectedPrinterId);
    const mat = materials.find((m) => m.id === selectedMaterialId);
    const qty = Math.max(1, quantity);
    return {
      id: createEntityId('qi'),
      productId: '',
      productName: partName.trim() || 'Peça Impressa 3D',
      materialId: selectedMaterialId,
      materialName: mat ? mat.name : materialType,
      color: mat?.color || '',
      printerId: selectedPrinterId,
      printerName: printer?.name || '',
      quantity: qty,
      weightGrams: result.resolvedWeightGrams,
      lengthMeters: result.resolvedLengthMeters,
      printTimeMinutes: Math.round(result.totalHours * 60),
      materialCost: result.materialCost,
      energyCost: result.energyCost,
      depreciationCost: result.depreciationCost,
      laborCost: result.laborCost,
      packagingCost: result.packagingCost,
      extraCost: result.extraCosts,
      totalUnitCost: result.costPerUnit,
      desiredMarginPercent,
      paymentFeePercent,
      unitPrice: result.activeUnitPrice,
      totalPrice: result.activeSalePrice,
    };
  };

  const handleSaveSimulationOrQuote = async (isSimulation: boolean) => {
    if (!tenant) return;
    if (!partName.trim()) {
      showToast('Informe o nome da peça antes de salvar.', 'error');
      return;
    }
    if (isSimulation) setSavingSim(true);
    else setSavingQuote(true);

    try {
      const cust = customers.find((c) => c.id === selectedCustomerId);
      const item = buildQuoteItem();
      await saveQuote(tenant, {
        isSimulation,
        customerId: cust?.id || '',
        customerName: cust?.fullName || (isSimulation ? 'Simulação Interna' : 'Cliente Avulso'),
        title: partName.trim(),
        items: [item],
        discount: 0,
        shipping: 0,
        totalCost: result.totalCost,
        totalPrice: result.activeSalePrice,
        estimatedProfit: result.estimatedProfit,
        profitMarginPercent: result.effectiveMarginPercent,
        validUntil: addDaysISO(15),
        status: isSimulation ? 'rascunho' : 'novo_orcamento',
        notes: `Calculado em ${formatDateBR(new Date())} · ${result.resolvedWeightGrams}g · ${formatNumber(result.totalHours, 2)}h`,
      });
      showToast(
        isSimulation
          ? 'Simulação salva no histórico de precificação.'
          : 'Orçamento salvo com sucesso.'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao salvar.', 'error');
    } finally {
      setSavingSim(false);
      setSavingQuote(false);
    }
  };

  const handleTransformIntoOrder = async () => {
    if (!tenant) return;
    if (!partName.trim()) {
      showToast('Informe o nome da peça para gerar o pedido.', 'error');
      return;
    }
    setConvertingOrder(true);
    try {
      const cust = customers.find((c) => c.id === selectedCustomerId);
      const item = buildQuoteItem();
      const quoteId = await saveQuote(tenant, {
        isSimulation: false,
        customerId: cust?.id || '',
        customerName: cust?.fullName || 'Cliente Avulso',
        title: partName.trim(),
        items: [item],
        discount: 0,
        shipping: 0,
        totalCost: result.totalCost,
        totalPrice: result.activeSalePrice,
        estimatedProfit: result.estimatedProfit,
        profitMarginPercent: result.effectiveMarginPercent,
        validUntil: addDaysISO(15),
        status: 'aprovado',
        notes: 'Gerado diretamente pela Calculadora de Custos',
      });

      await convertQuoteToOrder(
        tenant,
        {
          id: quoteId,
          companyId: tenant.companyId,
          ownerUid: tenant.ownerUid,
          quoteNumber: 'ORC-AUTO',
          isSimulation: false,
          customerId: cust?.id || '',
          customerName: cust?.fullName || 'Cliente Avulso',
          title: partName.trim(),
          items: [item],
          discount: 0,
          shipping: 0,
          totalCost: result.totalCost,
          totalPrice: result.activeSalePrice,
          estimatedProfit: result.estimatedProfit,
          profitMarginPercent: result.effectiveMarginPercent,
          validUntil: addDaysISO(15),
          status: 'aprovado',
          convertedOrderId: '',
          notes: 'Gerado pela Calculadora de Custos',
        },
        addDaysISO(5),
        'PIX',
        true
      );

      showToast('Pedido e tarefa de produção gerados com sucesso!');
      setActiveSection('orders');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao gerar pedido.', 'error');
    } finally {
      setConvertingOrder(false);
    }
  };

  const savedSimulations = useMemo(
    () => quotes.filter((q) => q.isSimulation),
    [quotes]
  );

  const loadSimulationIntoForm = (q: (typeof quotes)[number]) => {
    const first = q.items[0];
    if (!first) return;
    setPartName(first.productName);
    setSelectedCustomerId(q.customerId || '');
    if (first.printerId) handlePrinterChange(first.printerId);
    if (first.materialId) handleMaterialStockChange(first.materialId);
    setInputMode('grams');
    setWeightGrams(first.weightGrams);
    setPrintHours(Math.floor((first.printTimeMinutes || 0) / 60));
    setPrintMinutes((first.printTimeMinutes || 0) % 60);
    setQuantity(first.quantity);
    setLaborCost(first.laborCost);
    setPackagingCost(first.packagingCost);
    setExtraCosts(first.extraCost);
    setDesiredMarginPercent(first.desiredMarginPercent);
    setPaymentFeePercent(first.paymentFeePercent);
    setSimulatedSalePrice('');
    showToast(`Simulação ${q.quoteNumber} carregada.`);
  };

  const materialOptions = settings?.materialTypes || ['PLA', 'PLA+', 'PETG', 'ABS', 'TPU'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Inputs (7 cols) */}
        <div className="xl:col-span-7 bg-[#1D2027] border border-[#282C35] rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#282C35] pb-4">
            <div className="flex items-center gap-2.5">
              <Calculator className="w-5 h-5 text-[#F97316]" />
              <div>
                <h2 className="text-base font-semibold text-[#F5F5F5]">
                  Calculadora de Custos e Precificação 3D
                </h2>
                <p className="text-xs text-[#9CA3AF]">
                  Cálculo real de material por densidade, energia, depreciação, taxas e margem
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSimulatedSalePrice('')}
              className="text-xs text-[#9CA3AF] hover:text-[#F5F5F5] inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar simulação
            </button>
          </div>

          {/* Identification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nome da peça / projeto *</label>
              <input
                type="text"
                value={partName}
                onChange={(e) => setPartName(e.target.value)}
                placeholder="Ex: Engrenagem Planetária PETG"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Cliente (opcional)</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecionar cliente</option>
                {customers
                  .filter((c) => !c.isArchived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Printer & Energy */}
          <div className="pt-4 border-t border-[#282C35] space-y-3">
            <h3 className="text-xs font-semibold text-[#F5F5F5]">
              1. Impressora, Energia e Depreciação
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className={labelClass}>Impressora utilizada</label>
                <select
                  value={selectedPrinterId}
                  onChange={(e) => handlePrinterChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Configuração manual</option>
                  {printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.averagePowerWatts}W)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Consumo (Watts)</label>
                <input
                  type="number"
                  min="0"
                  value={printerPowerWatts}
                  onChange={(e) => setPrinterPowerWatts(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Tarifa (R$/kWh)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={energyTariffPerKwh}
                  onChange={(e) => setEnergyTariffPerKwh(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Valor impressora (R$)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={printerAcquisitionValue}
                  onChange={(e) => setPrinterAcquisitionValue(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Vida útil (horas)</label>
                <input
                  type="number"
                  min="1"
                  value={printerLifespanHours}
                  onChange={(e) => setPrinterLifespanHours(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Tempo (horas)</label>
                <input
                  type="number"
                  min="0"
                  value={printHours}
                  onChange={(e) => setPrintHours(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Tempo (minutos)</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={printMinutes}
                  onChange={(e) => setPrintMinutes(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Material & Filament */}
          <div className="pt-4 border-t border-[#282C35] space-y-3">
            <h3 className="text-xs font-semibold text-[#F5F5F5]">
              2. Material e Filamento (conversão por densidade real)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className={labelClass}>Filamento do estoque (opcional)</label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => handleMaterialStockChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Informar manualmente</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.materialType} · {m.diameterMm}mm)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Material</label>
                <select
                  value={materialType}
                  onChange={(e) => handleMaterialTypeChange(e.target.value)}
                  className={inputClass}
                >
                  {materialOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Preço por kg (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={filamentPricePerKg}
                  onChange={(e) => setFilamentPricePerKg(Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Modo de entrada</label>
                <select
                  value={inputMode}
                  onChange={(e) => setInputMode(e.target.value as 'grams' | 'meters')}
                  className={inputClass}
                >
                  <option value="grams">Peso em gramas (g)</option>
                  <option value="meters">Comprimento em metros (m)</option>
                </select>
              </div>

              {inputMode === 'grams' ? (
                <div>
                  <label className={labelClass}>Peso total (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              ) : (
                <div>
                  <label className={labelClass}>Comprimento (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={lengthMeters}
                    onChange={(e) => setLengthMeters(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className={labelClass}>Relação g/m ({diameterMm}mm)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={gramsPerMeter}
                  onChange={(e) => setGramsPerMeter(Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Quantidade de peças</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Labor, Packaging, Margin, Fees */}
          <div className="pt-4 border-t border-[#282C35] space-y-3">
            <h3 className="text-xs font-semibold text-[#F5F5F5]">
              3. Custos Complementares, Margem e Taxas
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className={labelClass}>Mão de obra (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={laborCost}
                  onChange={(e) => setLaborCost(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Embalagem (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={packagingCost}
                  onChange={(e) => setPackagingCost(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Outros custos (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={extraCosts}
                  onChange={(e) => setExtraCosts(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Margem desejada (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="90"
                  value={desiredMarginPercent}
                  onChange={(e) => setDesiredMarginPercent(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Taxa pagto. (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="40"
                  value={paymentFeePercent}
                  onChange={(e) => setPaymentFeePercent(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Result Panel (5 cols) */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-[#282C35] pb-4">
              <div>
                <p className="text-xs text-[#9CA3AF]">Preço de venda sugerido (total)</p>
                <p className="text-3xl font-bold font-mono tabular-nums text-[#F97316] mt-1">
                  {formatBRL(result.suggestedPrice)}
                </p>
                <p className="text-xs text-[#9CA3AF] mt-1 font-mono tabular-nums">
                  {formatBRL(result.suggestedUnitPrice)} por unidade · {result.resolvedWeightGrams}g
                  ({result.resolvedLengthMeters}m)
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#9CA3AF]">Margem efetiva</p>
                <p
                  className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                    result.effectiveMarginPercent >= 25
                      ? 'text-emerald-400'
                      : result.effectiveMarginPercent > 0
                        ? 'text-amber-400'
                        : 'text-red-400'
                  }`}
                >
                  {formatNumber(result.effectiveMarginPercent, 1)}%
                </p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#282C35]/50">
                <span className="text-[#9CA3AF]">
                  Custo de material ({formatBRL(result.filamentPricePerGram)}/g)
                </span>
                <span className="font-mono tabular-nums text-[#F5F5F5]">
                  {formatBRL(result.materialCost)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#282C35]/50">
                <span className="text-[#9CA3AF]">
                  Custo de energia ({formatNumber(result.totalHours, 2)}h)
                </span>
                <span className="font-mono tabular-nums text-[#F5F5F5]">
                  {formatBRL(result.energyCost)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#282C35]/50">
                <span className="text-[#9CA3AF]">Depreciação da impressora</span>
                <span className="font-mono tabular-nums text-[#F5F5F5]">
                  {formatBRL(result.depreciationCost)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#282C35]/50">
                <span className="text-[#9CA3AF]">Mão de obra</span>
                <span className="font-mono tabular-nums text-[#F5F5F5]">
                  {formatBRL(result.laborCost)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#282C35]/50">
                <span className="text-[#9CA3AF]">Embalagem e outros custos</span>
                <span className="font-mono tabular-nums text-[#F5F5F5]">
                  {formatBRL(result.packagingCost + result.extraCosts)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 font-semibold text-sm">
                <span className="text-[#F5F5F5]">Custo total de fabricação</span>
                <span className="font-mono tabular-nums text-[#F5F5F5]">
                  {formatBRL(result.totalCost)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-t border-[#282C35]/50">
                <span className="text-[#9CA3AF]">
                  Taxa de pagamento ({formatNumber(paymentFeePercent, 1)}%)
                </span>
                <span className="font-mono tabular-nums text-amber-400">
                  {formatBRL(result.paymentFeeAmount)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 font-semibold text-sm">
                <span className="text-[#F5F5F5]">Lucro líquido estimado</span>
                <span
                  className={`font-mono tabular-nums ${
                    result.estimatedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {formatBRL(result.estimatedProfit)}
                </span>
              </div>
            </div>

            {/* Price Simulator */}
            <div className="p-3.5 rounded-lg bg-[#17191E] border border-[#282C35] space-y-2">
              <label className="block text-xs font-medium text-[#F5F5F5]">
                Simular outro preço de venda (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={simulatedSalePrice}
                onChange={(e) => setSimulatedSalePrice(e.target.value)}
                placeholder={`Sugerido: ${result.suggestedPrice.toFixed(2)}`}
                className={inputClass}
              />
              <p className="text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                Preço ativo por unidade: {formatBRL(result.activeUnitPrice)} · Preço ativo total:{' '}
                {formatBRL(result.activeSalePrice)}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <LoadingButton
                type="button"
                loading={savingSim}
                onClick={() => handleSaveSimulationOrQuote(true)}
                className="px-3 py-2.5 rounded-lg bg-[#17191E] border border-[#2C313D] hover:border-[#F97316] text-xs font-medium text-[#F5F5F5]"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar simulação
              </LoadingButton>
              <LoadingButton
                type="button"
                loading={savingQuote}
                onClick={() => handleSaveSimulationOrQuote(false)}
                className="px-3 py-2.5 rounded-lg bg-[#17191E] border border-[#2C313D] hover:border-[#F97316] text-xs font-medium text-[#F5F5F5]"
              >
                <FileText className="w-3.5 h-3.5 text-[#F97316]" />
                Salvar orçamento
              </LoadingButton>
              <LoadingButton
                type="button"
                loading={convertingOrder}
                onClick={handleTransformIntoOrder}
                className="px-3 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Transformar em pedido
              </LoadingButton>
            </div>
          </div>

          {/* Saved Pricing Simulations History */}
          <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#F97316]" />
              <h3 className="text-sm font-semibold text-[#F5F5F5]">
                Histórico de simulações salvas
              </h3>
            </div>
            {savedSimulations.length === 0 ? (
              <p className="text-xs text-[#9CA3AF]">
                Nenhuma simulação salva ainda. Clique em "Salvar simulação" para registrar.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {savedSimulations.map((sim) => (
                  <button
                    key={sim.id}
                    type="button"
                    onClick={() => loadSimulationIntoForm(sim)}
                    className="w-full text-left p-2.5 rounded-lg bg-[#17191E] border border-[#282C35] hover:border-[#F97316] flex items-center justify-between text-xs cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#F5F5F5] truncate">
                        {sim.quoteNumber} · {sim.title}
                      </p>
                      <p className="text-[#9CA3AF]">
                        Custo: {formatBRL(sim.totalCost)} · Margem:{' '}
                        {formatNumber(sim.profitMarginPercent, 1)}%
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-[#F97316] ml-3 shrink-0">
                      {formatBRL(sim.totalPrice)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
