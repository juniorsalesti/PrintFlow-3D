import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X, Loader2 } from 'lucide-react';
import type { ToastMessage } from '../../context/ErpContext';

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidth = 'max-w-2xl', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidth} bg-[#1D2027] border border-[#2C313D] rounded-xl shadow-2xl max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#282C35]">
          <div>
            <h3 className="text-lg font-semibold text-[#F5F5F5]">{title}</h3>
            {subtitle && <p className="text-xs text-[#9CA3AF] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#262A34] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) => (
  <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
    <div className="space-y-5">
      <p className="text-sm text-[#9CA3AF] leading-relaxed">{description}</p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm font-medium text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-[#252932] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#F97316] hover:bg-[#EA580C]'
          } disabled:opacity-60`}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  </Modal>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, description, actionLabel, onAction }) => (
  <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-10 text-center flex flex-col items-center justify-center max-w-xl mx-auto my-6">
    <div className="w-12 h-12 rounded-xl bg-[#17191E] border border-[#282C35] flex items-center justify-center text-[#F97316] mb-4">
      {icon}
    </div>
    <h3 className="text-base font-semibold text-[#F5F5F5]">{title}</h3>
    <p className="text-sm text-[#9CA3AF] mt-1.5 max-w-md leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-5 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const KpiCard: React.FC<{
  label: string;
  value: string;
  subtext?: string;
  tone?: 'default' | 'positive' | 'negative' | 'accent';
  onClick?: () => void;
}> = ({ label, value, subtext, tone = 'default', onClick }) => {
  const valueColor =
    tone === 'positive'
      ? 'text-emerald-400'
      : tone === 'negative'
        ? 'text-red-400'
        : tone === 'accent'
          ? 'text-[#F97316]'
          : 'text-[#F5F5F5]';

  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left bg-[#1D2027] border border-[#282C35] rounded-xl p-4 transition-colors ${
        onClick ? 'hover:border-[#3A404D] cursor-pointer' : ''
      }`}
    >
      <p className="text-xs font-medium text-[#9CA3AF] truncate">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold font-mono tabular-nums tracking-tight ${valueColor}`}>
        {value}
      </p>
      {subtext && <p className="mt-1 text-xs text-[#9CA3AF] truncate">{subtext}</p>}
    </Wrapper>
  );
};

// Clean unboxed semantic status label (Zero-Pill discipline)
export const StatusText: React.FC<{
  label: string;
  tone: 'positive' | 'warning' | 'danger' | 'accent' | 'neutral';
}> = ({ label, tone }) => {
  const styles: Record<typeof tone, string> = {
    positive: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-red-400',
    accent: 'text-[#F97316]',
    neutral: 'text-[#9CA3AF]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${styles[tone]}`}>
      <span className="w-1.5 h-1.5 rounded-xs bg-current shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
};

export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl bg-[#1D2027] border border-[#2F3542] shadow-xl text-sm"
        >
          {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
          {t.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
          {t.type === 'info' && <Info className="w-4 h-4 text-[#F97316] shrink-0 mt-0.5" />}
          <span className="flex-1 text-[#F5F5F5] leading-snug">{t.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-[#9CA3AF] hover:text-[#F5F5F5] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export const LoadingButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }
> = ({ loading, children, className = '', disabled, ...rest }) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
  >
    {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
    {children}
  </button>
);

export const inputClass =
  'w-full bg-[#101114] border border-[#282C35] focus:border-[#F97316] rounded-lg px-3 py-2 text-sm text-[#F5F5F5] placeholder-[#6B7280] outline-none transition-colors';

export const labelClass = 'block text-xs font-medium text-[#9CA3AF] mb-1.5';

export const DurationInput: React.FC<{
  label: string;
  totalMinutes: number;
  onChangeMinutes: (minutes: number) => void;
  minMinutes?: number;
  required?: boolean;
  defaultUnit?: 'minutos' | 'horas';
}> = ({
  label,
  totalMinutes,
  onChangeMinutes,
  minMinutes = 0,
  required = false,
  defaultUnit = 'minutos',
}) => {
  const [unit, setUnit] = React.useState<'minutos' | 'horas'>(defaultUnit);
  const [rawValue, setRawValue] = React.useState<string>(() =>
    defaultUnit === 'horas'
      ? String(Number(((totalMinutes || 0) / 60).toFixed(2)))
      : String(Math.round(totalMinutes || 0))
  );

  React.useEffect(() => {
    const parsed = Number(rawValue.replace(',', '.'));
    const currentEquivalent =
      unit === 'horas'
        ? Math.round((Number.isFinite(parsed) ? parsed : 0) * 60)
        : Math.round(Number.isFinite(parsed) ? parsed : 0);

    if (currentEquivalent !== Math.round(totalMinutes || 0)) {
      setRawValue(
        unit === 'horas'
          ? String(Number(((totalMinutes || 0) / 60).toFixed(2)))
          : String(Math.round(totalMinutes || 0))
      );
    }
  }, [totalMinutes, unit]);

  const switchUnit = (nextUnit: 'minutos' | 'horas') => {
    if (nextUnit === unit) return;
    setUnit(nextUnit);
    setRawValue(
      nextUnit === 'horas'
        ? String(Number(((totalMinutes || 0) / 60).toFixed(2)))
        : String(Math.round(totalMinutes || 0))
    );
  };

  const handleChange = (val: string) => {
    setRawValue(val);
    const num = Number(val.replace(',', '.'));
    if (!Number.isFinite(num)) {
      onChangeMinutes(minMinutes);
      return;
    }
    const mins = unit === 'horas' ? Math.round(num * 60) : Math.round(num);
    onChangeMinutes(Math.max(minMinutes, mins));
  };

  const minsRounded = Math.max(0, Math.round(totalMinutes || 0));
  const h = Math.floor(minsRounded / 60);
  const m = minsRounded % 60;
  const helperText =
    unit === 'horas'
      ? `${minsRounded} min`
      : minsRounded >= 60
        ? `${h}h ${String(m).padStart(2, '0')}min`
        : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="block text-xs font-medium text-[#9CA3AF]">
          {label}
          {helperText && (
            <span className="ml-1.5 text-[11px] font-mono text-[#6B7280]">({helperText})</span>
          )}
        </label>
        <div className="inline-flex rounded-md bg-[#101114] border border-[#282C35] p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => switchUnit('minutos')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              unit === 'minutos'
                ? 'bg-[#F97316] text-white'
                : 'text-[#9CA3AF] hover:text-[#F5F5F5]'
            }`}
          >
            Min
          </button>
          <button
            type="button"
            onClick={() => switchUnit('horas')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              unit === 'horas'
                ? 'bg-[#F97316] text-white'
                : 'text-[#9CA3AF] hover:text-[#F5F5F5]'
            }`}
          >
            Horas
          </button>
        </div>
      </div>
      <input
        type="number"
        step={unit === 'horas' ? '0.1' : '1'}
        min={unit === 'horas' ? (minMinutes > 0 ? '0.02' : '0') : String(minMinutes)}
        required={required}
        value={rawValue}
        onChange={(e) => handleChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
};

