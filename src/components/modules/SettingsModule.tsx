import React, { useEffect, useState } from 'react';
import {
  Building2,
  Edit2,
  Plus,
  Save,
  Shield,
  Sliders,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { formatFirestoreErrorMessage } from '../../lib/firebase';
import {
  deleteCompanyMember,
  saveCompanyMember,
  updateCompanyInfo,
  updateCompanySettings,
} from '../../services/erpService';
import { uploadCompanyFile } from '../../services/storageService';
import type { CompanyMember, MaterialDensityConfig, UserRole } from '../../types/erp';
import { computeGramsPerMeter, DEFAULT_MATERIAL_DENSITIES } from '../../utils/formatters';
import {
  ConfirmModal,
  EmptyState,
  LoadingButton,
  LoadingState,
  Modal,
  StatusText,
  inputClass,
  labelClass,
} from '../common/UiPrimitives';

const MODULE_PERMISSION_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'quotes', label: 'Orçamentos' },
  { id: 'customers', label: 'Clientes' },
  { id: 'products', label: 'Produtos' },
  { id: 'production', label: 'Produção' },
  { id: 'printers', label: 'Impressoras' },
  { id: 'inventory', label: 'Estoque' },
  { id: 'calculator', label: 'Calculadora' },
  { id: 'financial', label: 'Financeiro' },
  { id: 'purchases', label: 'Compras' },
  { id: 'suppliers', label: 'Fornecedores' },
  { id: 'reports', label: 'Relatórios' },
  { id: 'settings', label: 'Configurações' },
];

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Proprietário',
  manager: 'Gerente',
  operator: 'Operador de Produção',
  viewer: 'Visualizador',
};

export const SettingsModule: React.FC = () => {
  const { tenant, company, settings, members, isSectionLoading, showToast } = useErp();

  const [tab, setTab] = useState<'empresa' | 'operacional' | 'materiais' | 'equipe'>('empresa');

  // Company form
  const [companyForm, setCompanyForm] = useState({
    name: '',
    cnpj: '',
    phone: '',
    email: '',
    address: '',
    logoUrl: '',
  });
  const [savingCompany, setSavingCompany] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Operational defaults form
  const [opForm, setOpForm] = useState({
    energyTariffPerKwh: 0.92,
    defaultProfitMargin: 45,
    defaultPaymentFeePercent: 3.5,
    defaultHourlyLaborRate: 25,
    defaultPackagingCost: 4.5,
    lowStockThresholdGrams: 250,
    currency: 'BRL',
  });
  const [savingOp, setSavingOp] = useState(false);

  // Material types, densities & expense categories
  const [materialTypes, setMaterialTypes] = useState<string[]>([]);
  const [materialDensities, setMaterialDensities] = useState<
    Record<string, MaterialDensityConfig>
  >(DEFAULT_MATERIAL_DENSITIES);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialDensity, setNewMaterialDensity] = useState(1.24);

  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingLists, setSavingLists] = useState(false);

  // Team members CRUD
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<CompanyMember | null>(null);
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    role: 'operator' as UserRole,
    status: 'ativo' as CompanyMember['status'],
    permissions: ['production', 'printers', 'inventory'] as string[],
  });
  const [savingMember, setSavingMember] = useState(false);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<CompanyMember | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);

  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name || '',
        cnpj: company.cnpj || '',
        phone: company.phone || '',
        email: company.email || '',
        address: company.address || '',
        logoUrl: company.logoUrl || '',
      });
    }
  }, [company]);

  useEffect(() => {
    if (settings) {
      setOpForm({
        energyTariffPerKwh: settings.energyTariffPerKwh ?? 0.92,
        defaultProfitMargin: settings.defaultProfitMargin ?? 45,
        defaultPaymentFeePercent: settings.defaultPaymentFeePercent ?? 3.5,
        defaultHourlyLaborRate: settings.defaultHourlyLaborRate ?? 25,
        defaultPackagingCost: settings.defaultPackagingCost ?? 4.5,
        lowStockThresholdGrams: settings.lowStockThresholdGrams ?? 250,
        currency: settings.currency || 'BRL',
      });
      setMaterialTypes(settings.materialTypes || ['PLA', 'PETG', 'ABS', 'TPU']);
      setExpenseCategories(settings.expenseCategories || ['Compra de Filamentos', 'Manutenção']);
      setMaterialDensities(settings.materialDensities || DEFAULT_MATERIAL_DENSITIES);
    }
  }, [settings]);

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    setUploadingLogo(true);
    try {
      const { url } = await uploadCompanyFile(tenant.companyId, 'company', file);
      setCompanyForm((prev) => ({ ...prev, logoUrl: url }));
      await updateCompanyInfo(tenant.companyId, { logoUrl: url });
      showToast('Logotipo enviado e atualizado com sucesso.');
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao enviar arquivo para o Storage.'), 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!companyForm.name.trim()) {
      showToast('O nome da empresa é obrigatório.', 'error');
      return;
    }
    setSavingCompany(true);
    try {
      await updateCompanyInfo(tenant.companyId, {
        name: companyForm.name.trim(),
        cnpj: companyForm.cnpj.trim(),
        phone: companyForm.phone.trim(),
        email: companyForm.email.trim(),
        address: companyForm.address.trim(),
        logoUrl: companyForm.logoUrl.trim(),
      });
      showToast('Dados da empresa atualizados.');
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao salvar empresa.'), 'error');
    } finally {
      setSavingCompany(false);
    }
  };

  const handleSaveOperational = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (opForm.defaultProfitMargin >= 100 || opForm.defaultPaymentFeePercent >= 100) {
      showToast('Margem padrão e taxa de pagamento devem ser menores que 100%.', 'error');
      return;
    }
    setSavingOp(true);
    try {
      await updateCompanySettings(tenant.companyId, {
        energyTariffPerKwh: Math.max(0, Number(opForm.energyTariffPerKwh) || 0),
        defaultProfitMargin: Math.max(0, Number(opForm.defaultProfitMargin) || 0),
        defaultPaymentFeePercent: Math.max(0, Number(opForm.defaultPaymentFeePercent) || 0),
        defaultHourlyLaborRate: Math.max(0, Number(opForm.defaultHourlyLaborRate) || 0),
        defaultPackagingCost: Math.max(0, Number(opForm.defaultPackagingCost) || 0),
        lowStockThresholdGrams: Math.max(0, Number(opForm.lowStockThresholdGrams) || 0),
        currency: opForm.currency.trim() || 'BRL',
      });
      showToast('Parâmetros operacionais e de precificação salvos.');
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao salvar configurações.'), 'error');
    } finally {
      setSavingOp(false);
    }
  };

  const handleDensityChange = (material: string, rawDensity: number) => {
    const density = Math.max(0.5, Number(rawDensity) || 1.24);
    setMaterialDensities((prev) => ({
      ...prev,
      [material]: {
        densityGcm3: density,
        gramsPerMeter175: computeGramsPerMeter(density, 1.75),
        gramsPerMeter285: computeGramsPerMeter(density, 2.85),
      },
    }));
  };

  const handleAddMaterialType = () => {
    const clean = newMaterialName.trim().slice(0, 50);
    if (!clean) return;
    if (materialTypes.includes(clean)) {
      showToast('Este material já existe na lista.', 'error');
      return;
    }
    if (materialTypes.length >= 40) {
      showToast('Limite máximo de 40 tipos de material atingido.', 'error');
      return;
    }
    const density = Math.max(0.5, Number(newMaterialDensity) || 1.24);
    setMaterialTypes((prev) => [...prev, clean]);
    setMaterialDensities((prev) => ({
      ...prev,
      [clean]: {
        densityGcm3: density,
        gramsPerMeter175: computeGramsPerMeter(density, 1.75),
        gramsPerMeter285: computeGramsPerMeter(density, 2.85),
      },
    }));
    setNewMaterialName('');
  };

  const handleRemoveMaterialType = (mat: string) => {
    if (materialTypes.length <= 1) {
      showToast('Mantenha ao menos um tipo de material.', 'error');
      return;
    }
    setMaterialTypes((prev) => prev.filter((m) => m !== mat));
  };

  const handleAddCategory = () => {
    const clean = newCategoryName.trim().slice(0, 70);
    if (!clean) return;
    if (expenseCategories.includes(clean)) {
      showToast('Categoria já cadastrada.', 'error');
      return;
    }
    if (expenseCategories.length >= 40) {
      showToast('Limite máximo de 40 categorias atingido.', 'error');
      return;
    }
    setExpenseCategories((prev) => [...prev, clean]);
    setNewCategoryName('');
  };

  const handleSaveLists = async () => {
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    setSavingLists(true);
    try {
      await updateCompanySettings(tenant.companyId, {
        materialTypes,
        materialDensities,
        expenseCategories,
      });
      showToast('Materiais, densidades e categorias financeiras atualizados.');
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao atualizar listas.'), 'error');
    } finally {
      setSavingLists(false);
    }
  };

  const openNewMember = () => {
    setEditingMember(null);
    setMemberForm({
      name: '',
      email: '',
      role: 'operator',
      status: 'ativo',
      permissions: ['dashboard', 'production', 'printers', 'inventory'],
    });
    setMemberModalOpen(true);
  };

  const openEditMember = (m: CompanyMember) => {
    setEditingMember(m);
    setMemberForm({
      name: m.name,
      email: m.email,
      role: m.role,
      status: m.status,
      permissions: m.permissions || [],
    });
    setMemberModalOpen(true);
  };

  const togglePermission = (permId: string) => {
    setMemberForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter((p) => p !== permId)
        : [...prev.permissions, permId],
    }));
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!memberForm.name.trim() || !memberForm.email.trim()) {
      showToast('Nome e e-mail do colaborador são obrigatórios.', 'error');
      return;
    }
    setSavingMember(true);
    try {
      await saveCompanyMember(
        tenant,
        {
          name: memberForm.name.trim(),
          email: memberForm.email.trim(),
          role: memberForm.role,
          status: memberForm.status,
          permissions: memberForm.permissions,
        },
        editingMember?.id
      );
      showToast(editingMember ? 'Membro atualizado.' : 'Membro adicionado à equipe.');
      setMemberModalOpen(false);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao salvar membro.'), 'error');
    } finally {
      setSavingMember(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!tenant) {
      showToast('Sessão da empresa não inicializada. Recarregue a página.', 'error');
      return;
    }
    if (!deleteMemberTarget) return;
    setDeletingMember(true);
    try {
      await deleteCompanyMember(tenant.companyId, deleteMemberTarget.id);
      showToast('Colaborador removido.');
      setDeleteMemberTarget(null);
    } catch (err) {
      showToast(formatFirestoreErrorMessage(err, 'Erro ao remover colaborador.'), 'error');
    } finally {
      setDeletingMember(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-[#17191E] border border-[#282C35] overflow-x-auto w-fit max-w-full">
        {(
          [
            { id: 'empresa', label: 'Dados da Empresa', icon: Building2 },
            { id: 'operacional', label: 'Energia e Precificação', icon: Sliders },
            { id: 'materiais', label: 'Materiais e Categorias', icon: Shield },
            { id: 'equipe', label: `Usuários e Permissões (${members.length})`, icon: Users },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                tab === t.id
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

      {/* 1. COMPANY TAB */}
      {tab === 'empresa' && (
        <form
          onSubmit={handleSaveCompany}
          className="bg-[#1D2027] border border-[#282C35] rounded-xl p-6 space-y-5 max-w-3xl"
        >
          <div>
            <h3 className="text-base font-semibold text-[#F5F5F5]">Identidade da empresa</h3>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Estas informações aparecem nos orçamentos, pedidos e relatórios em PDF.
            </p>
          </div>

          {/* Logo upload */}
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-[#17191E] border border-[#282C35]">
            <div className="w-16 h-16 rounded-lg bg-[#101114] border border-[#282C35] flex items-center justify-center overflow-hidden shrink-0">
              {companyForm.logoUrl ? (
                <img
                  src={companyForm.logoUrl}
                  alt="Logo da empresa"
                  className="w-full h-full object-contain"
                />
              ) : (
                <Building2 className="w-6 h-6 text-[#9CA3AF]" />
              )}
            </div>
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <p className="text-xs font-medium text-[#F5F5F5]">Logotipo da empresa</p>
              <p className="text-[11px] text-[#9CA3AF]">
                Envie uma imagem PNG, JPG ou SVG para armazenar no Firebase Storage.
              </p>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1D2027] border border-[#2C313D] hover:border-[#F97316] text-xs font-medium text-[#F5F5F5] cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#F97316]" />
                {uploadingLogo ? 'Enviando logotipo...' : 'Enviar logotipo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingLogo}
                  onChange={handleUploadLogo}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Nome / Razão Social *</label>
              <input
                type="text"
                required
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>CNPJ / CPF</label>
              <input
                type="text"
                value={companyForm.cnpj}
                onChange={(e) => setCompanyForm({ ...companyForm, cnpj: e.target.value })}
                placeholder="00.000.000/0001-00"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Telefone / WhatsApp</label>
              <input
                type="text"
                value={companyForm.phone}
                onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                placeholder="(11) 99999-9999"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>E-mail comercial</label>
              <input
                type="email"
                value={companyForm.email}
                onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Endereço completo</label>
              <input
                type="text"
                value={companyForm.address}
                onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <LoadingButton
              type="submit"
              loading={savingCompany}
              className="px-5 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              <Save className="w-4 h-4" />
              Salvar dados da empresa
            </LoadingButton>
          </div>
        </form>
      )}

      {/* 2. OPERATIONAL & PRICING DEFAULTS */}
      {tab === 'operacional' && (
        <form
          onSubmit={handleSaveOperational}
          className="bg-[#1D2027] border border-[#282C35] rounded-xl p-6 space-y-5 max-w-3xl"
        >
          <div>
            <h3 className="text-base font-semibold text-[#F5F5F5]">
              Tarifa de energia, margens e padrões de cálculo
            </h3>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Estes valores alimentam automaticamente a Calculadora de Custos e o fechamento de produção.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tarifa de energia elétrica (R$ / kWh)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={opForm.energyTariffPerKwh}
                onChange={(e) =>
                  setOpForm({ ...opForm, energyTariffPerKwh: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Margem de lucro padrão sobre venda (%)</label>
              <input
                type="number"
                step="any"
                min="0"
                max="99"
                value={opForm.defaultProfitMargin}
                onChange={(e) =>
                  setOpForm({ ...opForm, defaultProfitMargin: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Taxa de pagamento padrão (%)</label>
              <input
                type="number"
                step="any"
                min="0"
                max="99"
                value={opForm.defaultPaymentFeePercent}
                onChange={(e) =>
                  setOpForm({ ...opForm, defaultPaymentFeePercent: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Valor hora de mão de obra (R$/h)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={opForm.defaultHourlyLaborRate}
                onChange={(e) =>
                  setOpForm({ ...opForm, defaultHourlyLaborRate: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Custo padrão de embalagem (R$)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={opForm.defaultPackagingCost}
                onChange={(e) =>
                  setOpForm({ ...opForm, defaultPackagingCost: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Alerta global de estoque mínimo (g)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={opForm.lowStockThresholdGrams}
                onChange={(e) =>
                  setOpForm({ ...opForm, lowStockThresholdGrams: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <LoadingButton
              type="submit"
              loading={savingOp}
              className="px-5 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              <Save className="w-4 h-4" />
              Salvar parâmetros
            </LoadingButton>
          </div>
        </form>
      )}

      {/* 3. MATERIALS, DENSITIES & EXPENSE CATEGORIES */}
      {tab === 'materiais' && (
        <div className="space-y-6">
          <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#F5F5F5]">
                  Tipos de material e densidade (g/m)
                </h3>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  A relação de gramas por metro é recalculada automaticamente para filamentos de 1,75 mm e 2,85 mm a partir da densidade (g/cm³).
                </p>
              </div>
              <LoadingButton
                type="button"
                loading={savingLists}
                onClick={handleSaveLists}
                className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar alterações
              </LoadingButton>
            </div>

            <div className="overflow-x-auto border border-[#282C35] rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#282C35] bg-[#17191E] text-[#9CA3AF]">
                    <th className="py-2.5 px-4 font-medium">Material</th>
                    <th className="py-2.5 px-4 font-medium">Densidade (g/cm³)</th>
                    <th className="py-2.5 px-4 font-medium text-right">1,75 mm (g/m)</th>
                    <th className="py-2.5 px-4 font-medium text-right">2,85 mm (g/m)</th>
                    <th className="py-2.5 px-4 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282C35]">
                  {materialTypes.map((mat) => {
                    const cfg = materialDensities[mat] || {
                      densityGcm3: 1.24,
                      gramsPerMeter175: computeGramsPerMeter(1.24, 1.75),
                      gramsPerMeter285: computeGramsPerMeter(1.24, 2.85),
                    };
                    return (
                      <tr key={mat} className="hover:bg-[#232730]">
                        <td className="py-2.5 px-4 font-semibold text-[#F5F5F5]">{mat}</td>
                        <td className="py-2.5 px-4">
                          <input
                            type="number"
                            step="0.01"
                            min="0.5"
                            max="5"
                            value={cfg.densityGcm3}
                            onChange={(e) => handleDensityChange(mat, Number(e.target.value))}
                            className="w-24 bg-[#101114] border border-[#282C35] rounded px-2 py-1 text-xs font-mono text-[#F5F5F5] outline-none"
                          />
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#F97316]">
                          {cfg.gramsPerMeter175.toFixed(2)} g/m
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#9CA3AF]">
                          {cfg.gramsPerMeter285.toFixed(2)} g/m
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveMaterialType(mat)}
                            className="p-1 text-[#9CA3AF] hover:text-red-400 cursor-pointer"
                            title="Remover material"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-3 pt-2">
              <div className="w-48">
                <label className={labelClass}>Novo material</label>
                <input
                  type="text"
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  placeholder="Ex: PC-CF"
                  className={inputClass}
                />
              </div>
              <div className="w-36">
                <label className={labelClass}>Densidade (g/cm³)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  value={newMaterialDensity}
                  onChange={(e) => setNewMaterialDensity(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={handleAddMaterialType}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#17191E] border border-[#282C35] hover:border-[#F97316] text-xs font-medium text-[#F5F5F5] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#F97316]" />
                Adicionar material
              </button>
            </div>
          </div>

          <div className="bg-[#1D2027] border border-[#282C35] rounded-xl p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">Categorias financeiras</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                Organize lançamentos de despesas e fluxo de caixa.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {expenseCategories.map((cat) => (
                <div
                  key={cat}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#17191E] border border-[#282C35] text-xs"
                >
                  <span className="text-[#F5F5F5] truncate">{cat}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setExpenseCategories((prev) => prev.filter((c) => c !== cat))
                    }
                    className="text-[#9CA3AF] hover:text-red-400 cursor-pointer ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3 pt-1">
              <div className="w-64">
                <label className={labelClass}>Nova categoria financeira</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Ex: Peças de reposição"
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={handleAddCategory}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#17191E] border border-[#282C35] hover:border-[#F97316] text-xs font-medium text-[#F5F5F5] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#F97316]" />
                Adicionar categoria
              </button>
              <LoadingButton
                type="button"
                loading={savingLists}
                onClick={handleSaveLists}
                className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar categorias
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* 4. TEAM MEMBERS & PERMISSIONS */}
      {tab === 'equipe' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">
                Usuários e permissões da operação
              </h3>
              <p className="text-xs text-[#9CA3AF]">
                Cadastre operadores de impressão, gerentes e responsáveis financeiros.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewMember}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Adicionar usuário
            </button>
          </div>

          <div className="bg-[#1D2027] border border-[#282C35] rounded-xl overflow-hidden">
            {members.length === 0 ? (
              isSectionLoading ? (
                <LoadingState label="Carregando equipe do banco de dados..." />
              ) : (
                <EmptyState
                  icon={<Users className="w-6 h-6" />}
                  title="Nenhum colaborador adicional cadastrado"
                  description="Adicione operadores ou gestores para controlar responsabilidades e permissões de acesso."
                  actionLabel="Adicionar usuário"
                  onAction={openNewMember}
                />
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#282C35] text-[#9CA3AF] bg-[#17191E]">
                      <th className="py-3 px-4 font-medium">Nome</th>
                      <th className="py-3 px-4 font-medium">E-mail</th>
                      <th className="py-3 px-4 font-medium">Função</th>
                      <th className="py-3 px-4 font-medium">Módulos liberados</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#282C35]">
                    {members.map((m) => (
                      <tr key={m.id} className="hover:bg-[#232730]">
                        <td className="py-3 px-4 font-medium text-[#F5F5F5]">{m.name}</td>
                        <td className="py-3 px-4 text-[#9CA3AF]">{m.email}</td>
                        <td className="py-3 px-4 text-[#F5F5F5]">{ROLE_LABELS[m.role]}</td>
                        <td className="py-3 px-4 text-[#9CA3AF]">
                          {m.permissions?.length || 0} módulo(s)
                        </td>
                        <td className="py-3 px-4">
                          <StatusText
                            label={m.status}
                            tone={
                              m.status === 'ativo'
                                ? 'positive'
                                : m.status === 'convidado'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditMember(m)}
                              className="p-1.5 text-[#9CA3AF] hover:text-[#F97316] cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteMemberTarget(m)}
                              className="p-1.5 text-[#9CA3AF] hover:text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* Member Modal */}
      <Modal
        open={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        title={editingMember ? 'Editar colaborador' : 'Novo usuário da equipe'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveMember} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Nome completo *</label>
              <input
                type="text"
                required
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>E-mail *</label>
              <input
                type="email"
                required
                value={memberForm.email}
                onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Perfil / Cargo</label>
              <select
                value={memberForm.role}
                onChange={(e) =>
                  setMemberForm({ ...memberForm, role: e.target.value as UserRole })
                }
                className={inputClass}
              >
                <option value="owner">Proprietário</option>
                <option value="manager">Gerente</option>
                <option value="operator">Operador de Produção</option>
                <option value="viewer">Visualizador</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={memberForm.status}
                onChange={(e) =>
                  setMemberForm({
                    ...memberForm,
                    status: e.target.value as CompanyMember['status'],
                  })
                }
                className={inputClass}
              >
                <option value="ativo">Ativo</option>
                <option value="convidado">Convidado</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Permissões por módulo</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg bg-[#101114] border border-[#282C35]">
              {MODULE_PERMISSION_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-center gap-2 text-xs text-[#F5F5F5] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={memberForm.permissions.includes(opt.id)}
                    onChange={() => togglePermission(opt.id)}
                    className="accent-[#F97316]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMemberModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#2C313D] text-sm text-[#9CA3AF] cursor-pointer"
            >
              Cancelar
            </button>
            <LoadingButton
              type="submit"
              loading={savingMember}
              className="px-5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
            >
              Salvar usuário
            </LoadingButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteMemberTarget)}
        title="Remover usuário"
        description={`Deseja remover "${deleteMemberTarget?.name}" da equipe?`}
        confirmLabel="Remover"
        danger
        loading={deletingMember}
        onConfirm={handleDeleteMember}
        onCancel={() => setDeleteMemberTarget(null)}
      />
    </div>
  );
};
