import type { Timestamp } from 'firebase/firestore';
import type { MaterialDensityConfig } from '../types/erp';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatBRL(value: number | undefined | null): string {
  return currencyFormatter.format(Number.isFinite(value) ? Number(value) : 0);
}

export function formatNumber(value: number | undefined | null, decimals = 2): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(Number(value));
}

export function formatGrams(grams: number | undefined | null): string {
  const val = Number.isFinite(grams) ? Number(grams) : 0;
  if (val >= 1000) {
    return `${formatNumber(val / 1000, 2)} kg (${formatNumber(val, 0)} g)`;
  }
  return `${formatNumber(val, 1)} g`;
}

export function formatMinutesToHours(minutes: number | undefined | null): string {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

export function toDateObject(value: Timestamp | Date | string | undefined | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return null;
}

export function formatDateBR(value: Timestamp | Date | string | undefined | null): string {
  const d = toDateObject(value);
  if (!d) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTimeBR(value: Timestamp | Date | string | undefined | null): string {
  const d = toDateObject(value);
  if (!d) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toISODateString(value: Timestamp | Date | string | undefined | null): string {
  const d = toDateObject(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function diffDaysFromToday(isoDate: string | undefined | null): number | null {
  if (!isoDate) return null;
  const target = toDateObject(isoDate);
  if (!target) return null;
  const today = toDateObject(getTodayISO())!;
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function computeGramsPerMeter(densityGcm3: number, diameterMm: 1.75 | 2.85): number {
  const radiusCm = diameterMm / 20;
  const areaCm2 = Math.PI * radiusCm * radiusCm;
  const volumePerMeterCm3 = areaCm2 * 100;
  return Number((volumePerMeterCm3 * densityGcm3).toFixed(3));
}

export const DEFAULT_MATERIAL_DENSITIES: Record<string, MaterialDensityConfig> = {
  PLA: {
    densityGcm3: 1.24,
    gramsPerMeter175: computeGramsPerMeter(1.24, 1.75),
    gramsPerMeter285: computeGramsPerMeter(1.24, 2.85),
  },
  'PLA+': {
    densityGcm3: 1.24,
    gramsPerMeter175: computeGramsPerMeter(1.24, 1.75),
    gramsPerMeter285: computeGramsPerMeter(1.24, 2.85),
  },
  PETG: {
    densityGcm3: 1.27,
    gramsPerMeter175: computeGramsPerMeter(1.27, 1.75),
    gramsPerMeter285: computeGramsPerMeter(1.27, 2.85),
  },
  ABS: {
    densityGcm3: 1.04,
    gramsPerMeter175: computeGramsPerMeter(1.04, 1.75),
    gramsPerMeter285: computeGramsPerMeter(1.04, 2.85),
  },
  TPU: {
    densityGcm3: 1.21,
    gramsPerMeter175: computeGramsPerMeter(1.21, 1.75),
    gramsPerMeter285: computeGramsPerMeter(1.21, 2.85),
  },
  ASA: {
    densityGcm3: 1.07,
    gramsPerMeter175: computeGramsPerMeter(1.07, 1.75),
    gramsPerMeter285: computeGramsPerMeter(1.07, 2.85),
  },
  Nylon: {
    densityGcm3: 1.14,
    gramsPerMeter175: computeGramsPerMeter(1.14, 1.75),
    gramsPerMeter285: computeGramsPerMeter(1.14, 2.85),
  },
  Resina: {
    densityGcm3: 1.12,
    gramsPerMeter175: computeGramsPerMeter(1.12, 1.75),
    gramsPerMeter285: computeGramsPerMeter(1.12, 2.85),
  },
};

export function createEntityId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export { numberFormatter };
