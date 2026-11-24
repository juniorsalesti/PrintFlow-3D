import type { PricingInput, PricingResult } from '../types/erp';

export function calculate3DPrintPricing(input: PricingInput): PricingResult {
  const quantity = Math.max(1, Math.round(input.quantity || 1));
  const gramsPerMeter = Math.max(0.1, input.gramsPerMeter || 2.98);

  const resolvedWeightGrams =
    input.inputMode === 'meters'
      ? Number(((input.lengthMeters || 0) * gramsPerMeter).toFixed(2))
      : Number((input.weightGrams || 0).toFixed(2));

  const resolvedLengthMeters =
    input.inputMode === 'grams'
      ? Number((resolvedWeightGrams / gramsPerMeter).toFixed(2))
      : Number((input.lengthMeters || 0).toFixed(2));

  const totalHours = Math.max(
    0,
    (Number(input.printHours) || 0) + (Number(input.printMinutes) || 0) / 60
  );

  // A. Custo de filamento: preço por kg / 1000 * peso utilizado
  const filamentPricePerGram = Math.max(0, Number(input.filamentPricePerKg) || 0) / 1000;
  const materialCost = Number((resolvedWeightGrams * filamentPricePerGram).toFixed(2));

  // B. Custo de energia: (watts / 1000) * horas * tarifa kWh
  const powerKw = Math.max(0, Number(input.printerPowerWatts) || 0) / 1000;
  const tariff = Math.max(0, Number(input.energyTariffPerKwh) || 0);
  const energyCost = Number((powerKw * totalHours * tariff).toFixed(2));

  // C. Depreciação da impressora: (valor aquisição / vida útil em horas) * horas de impressão
  const lifespan = Math.max(1, Number(input.printerLifespanHours) || 1);
  const acquisitionValue = Math.max(0, Number(input.printerAcquisitionValue) || 0);
  const depreciationPerHour = acquisitionValue / lifespan;
  const depreciationCost = Number((depreciationPerHour * totalHours).toFixed(2));

  // D. Outros custos
  const laborCost = Math.max(0, Number(input.laborCost) || 0);
  const packagingCost = Math.max(0, Number(input.packagingCost) || 0);
  const extraCosts = Math.max(0, Number(input.extraCosts) || 0);

  const totalCost = Number(
    (materialCost + energyCost + depreciationCost + laborCost + packagingCost + extraCosts).toFixed(2)
  );
  const costPerUnit = Number((totalCost / quantity).toFixed(2));

  // E. Formação do preço de venda (margem sobre o preço de venda + taxa percentual de pagamento)
  const marginRate = Math.min(0.95, Math.max(0, (Number(input.desiredMarginPercent) || 0) / 100));
  const feeRate = Math.min(0.45, Math.max(0, (Number(input.paymentFeePercent) || 0) / 100));
  const denominator = Math.max(0.05, 1 - marginRate - feeRate);

  const suggestedPrice = Number((totalCost / denominator).toFixed(2));
  const suggestedUnitPrice = Number((suggestedPrice / quantity).toFixed(2));

  const activeSalePrice =
    input.simulatedSalePrice !== undefined &&
    input.simulatedSalePrice !== null &&
    input.simulatedSalePrice > 0
      ? Number(input.simulatedSalePrice.toFixed(2))
      : suggestedPrice;

  const activeUnitPrice = Number((activeSalePrice / quantity).toFixed(2));
  const paymentFeeAmount = Number((activeSalePrice * feeRate).toFixed(2));
  const estimatedProfit = Number((activeSalePrice - paymentFeeAmount - totalCost).toFixed(2));
  const effectiveMarginPercent =
    activeSalePrice > 0 ? Number(((estimatedProfit / activeSalePrice) * 100).toFixed(2)) : 0;

  return {
    resolvedWeightGrams,
    resolvedLengthMeters,
    totalHours: Number(totalHours.toFixed(2)),
    filamentPricePerGram,
    materialCost,
    energyCost,
    depreciationCost,
    laborCost,
    packagingCost,
    extraCosts,
    totalCost,
    costPerUnit,
    suggestedPrice,
    suggestedUnitPrice,
    activeSalePrice,
    activeUnitPrice,
    paymentFeeAmount,
    estimatedProfit,
    effectiveMarginPercent,
  };
}
