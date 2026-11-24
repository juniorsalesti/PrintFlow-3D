import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Company, Order, ProductionJob, Quote } from '../types/erp';
import { formatBRL, formatDateBR, formatGrams, formatMinutesToHours } from './formatters';

export function exportToCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const escapeCell = (val: string | number): string => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(';'), ...rows.map((row) => row.map(escapeCell).join(';'))].join(
      '\n'
    );

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportReportPDF(
  title: string,
  periodLabel: string,
  companyName: string,
  summaryItems: { label: string; value: string }[],
  tableHeaders: string[],
  tableRows: (string | number)[][],
  filename: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(16, 17, 20);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(249, 115, 22);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PrintFlow 3D', 14, 13);

  doc.setTextColor(245, 245, 245);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(companyName || 'Empresa de Impressão 3D', 14, 20);

  doc.setTextColor(156, 163, 175);
  doc.setFontSize(9);
  doc.text(`Emitido em ${formatDateBR(new Date())}`, 196, 13, { align: 'right' });
  doc.text(periodLabel, 196, 20, { align: 'right' });

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 38);

  let yPos = 45;
  if (summaryItems.length > 0) {
    const colWidth = 182 / Math.min(summaryItems.length, 4);
    summaryItems.slice(0, 4).forEach((item, idx) => {
      const x = 14 + idx * colWidth;
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(x, yPos, colWidth - 3, 16, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text(item.label, x + 3, yPos + 6);
      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.text(item.value, x + 3, yPos + 12.5);
    });
    yPos += 24;
  }

  autoTable(doc, {
    startY: yPos,
    head: [tableHeaders],
    body: tableRows.map((r) => r.map((c) => String(c ?? ''))),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [29, 32, 39], textColor: [245, 245, 245], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function exportOrderPDF(order: Order, company: Company | null): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(16, 17, 20);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(249, 115, 22);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text(company?.name || 'PrintFlow 3D', 14, 14);

  doc.setTextColor(229, 231, 235);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const contactLine = [company?.cnpj, company?.phone, company?.email].filter(Boolean).join(' · ');
  if (contactLine) doc.text(contactLine, 14, 21);
  if (company?.address) doc.text(company.address, 14, 26);

  doc.setTextColor(245, 245, 245);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`Pedido ${order.orderNumber}`, 196, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data: ${formatDateBR(order.createdAt)}`, 196, 21, { align: 'right' });
  doc.text(
    `Previsão: ${order.expectedDeliveryDate ? formatDateBR(order.expectedDeliveryDate) : 'A definir'}`,
    196,
    26,
    { align: 'right' }
  );

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Dados do Cliente', 14, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Cliente: ${order.customerName || 'Cliente Avulso'}`, 14, 48);
  doc.text(`Forma de pagamento: ${order.paymentMethod || 'A combinar'}`, 14, 53);
  doc.text(`Status do pedido: ${order.status.replace(/_/g, ' ')}`, 120, 48);
  doc.text(`Status pagamento: ${order.paymentStatus}`, 120, 53);

  autoTable(doc, {
    startY: 60,
    head: [['Item / Peça', 'Material / Cor', 'Qtd', 'Peso Est.', 'Unitário', 'Total']],
    body: order.items.map((item) => [
      item.productName,
      `${item.materialName || '-'} ${item.color ? `(${item.color})` : ''}`,
      String(item.quantity),
      formatGrams(item.weightGrams),
      formatBRL(item.unitPrice),
      formatBRL(item.totalPrice),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [29, 32, 39], textColor: [245, 245, 245] },
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 120) + 10;
  doc.setFontSize(10);
  doc.text(`Subtotal: ${formatBRL(order.subtotal)}`, 196, finalY, { align: 'right' });
  doc.text(`Desconto: ${formatBRL(order.discount)}`, 196, finalY + 6, { align: 'right' });
  doc.text(`Frete: ${formatBRL(order.shipping)}`, 196, finalY + 12, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total: ${formatBRL(order.totalValue)}`, 196, finalY + 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Valor Pago: ${formatBRL(order.paidAmount)}`, 196, finalY + 27, { align: 'right' });
  doc.text(
    `Saldo Restante: ${formatBRL(Math.max(0, order.totalValue - order.paidAmount))}`,
    196,
    finalY + 33,
    { align: 'right' }
  );

  if (order.notes) {
    doc.setFontSize(9);
    doc.text('Observações:', 14, finalY + 6);
    doc.text(order.notes, 14, finalY + 12, { maxWidth: 110 });
  }

  doc.save(`${order.orderNumber}.pdf`);
}

export function exportQuotePDF(quote: Quote, company: Company | null): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFillColor(16, 17, 20);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(249, 115, 22);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(company?.name || 'PrintFlow 3D', 14, 14);
  doc.setTextColor(245, 245, 245);
  doc.setFontSize(12);
  doc.text(`Orçamento ${quote.quoteNumber}`, 196, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Validade: ${quote.validUntil ? formatDateBR(quote.validUntil) : '15 dias'}`,
    196,
    21,
    { align: 'right' }
  );

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(10);
  doc.text(`Cliente: ${quote.customerName || 'Não informado'}`, 14, 40);
  doc.text(`Título: ${quote.title || 'Proposta de Impressão 3D'}`, 14, 46);

  autoTable(doc, {
    startY: 54,
    head: [['Peça / Serviço', 'Material', 'Impressora', 'Qtd', 'Unitário', 'Total']],
    body: quote.items.map((item) => [
      item.productName,
      `${item.materialName || '-'} ${item.color || ''}`,
      item.printerName || '-',
      String(item.quantity),
      formatBRL(item.unitPrice),
      formatBRL(item.totalPrice),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [29, 32, 39], textColor: [245, 245, 245] },
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 110) + 10;
  doc.setFontSize(10);
  doc.text(`Desconto: ${formatBRL(quote.discount)}`, 196, finalY, { align: 'right' });
  doc.text(`Frete: ${formatBRL(quote.shipping)}`, 196, finalY + 6, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total Proposto: ${formatBRL(quote.totalPrice)}`, 196, finalY + 14, { align: 'right' });

  doc.save(`${quote.quoteNumber}.pdf`);
}

export function exportProductionOrderPDF(job: ProductionJob, company: Company | null): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFillColor(16, 17, 20);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(249, 115, 22);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(company?.name || 'PrintFlow 3D', 14, 13);
  doc.setTextColor(245, 245, 245);
  doc.setFontSize(12);
  doc.text(`Ordem de Produção · ${job.orderNumber || job.id}`, 196, 13, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tentativa #${job.attemptNumber}`, 196, 20, { align: 'right' });

  autoTable(doc, {
    startY: 38,
    head: [['Campo', 'Especificação']],
    body: [
      ['Produto / Peça', job.productName],
      ['Cliente', job.customerName || 'Estoque interno'],
      ['Impressora', job.printerName || 'Não definida'],
      ['Filamento', `${job.materialName || '-'} (${job.color || '-'})`],
      ['Quantidade', `${job.quantity} un.`],
      ...(job.plannedWeightGrams > 0
        ? [['Peso Estimado', formatGrams(job.plannedWeightGrams)]]
        : job.actualWeightGrams > 0
          ? [['Peso Real', formatGrams(job.actualWeightGrams)]]
          : []),
      ['Tempo Estimado', formatMinutesToHours(job.estimatedMinutes)],
      ['Operador', job.operatorName || 'Não atribuído'],
      ['Status Atual', job.status.replace(/_/g, ' ')],
      ['Observações', job.notes || 'Sem observações'],
    ],
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [29, 32, 39], textColor: [245, 245, 245] },
  });

  doc.save(`OP_${job.orderNumber || job.id}.pdf`);
}
