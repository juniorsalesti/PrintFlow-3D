import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  buildFirestoreErrorInfo,
  db,
  formatFirestoreErrorMessage,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type {
  AppNotification,
  Company,
  CompanyMember,
  CompanySettings,
  UserProfile,
} from '../types/erp';
import { createEntityId, getTodayISO } from '../utils/formatters';
import {
  buildDefaultSettingsPayload,
  cleanNum,
  cleanStr,
  type TenantContext,
} from './firestoreBase';

export async function ensureCompanyBootstrap(user: User): Promise<{
  profile: UserProfile;
  company: Company;
  settings: CompanySettings;
}> {
  const uid = user.uid;
  const userRef = doc(db, 'users', uid);
  const companyRef = doc(db, 'companies', uid);
  const settingsRef = doc(db, 'settings', uid);

  try {
    const companySnap = await getDoc(companyRef);
    if (!companySnap.exists()) {
      await setDoc(companyRef, {
        ownerUid: uid,
        name: cleanStr(user.displayName ? `${user.displayName} 3D Studio` : 'PrintFlow 3D Studio', 140),
        cnpj: '',
        phone: '',
        email: cleanStr(user.email || '', 160),
        address: '',
        logoUrl: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid,
        email: cleanStr(user.email, 160, 'usuario@printflow3d.com'),
        displayName: cleanStr(user.displayName || user.email?.split('@')[0], 120, 'Gestor'),
        photoURL: cleanStr(user.photoURL || '', 600),
        companyId: uid,
        role: 'owner',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const settingsSnap = await getDoc(settingsRef);
    const defaultSettingsPayload = buildDefaultSettingsPayload(uid, uid);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        ...defaultSettingsPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = settingsSnap.data() as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      (Object.keys(defaultSettingsPayload) as Array<keyof typeof defaultSettingsPayload>).forEach(
        (key) => {
          if (existingData[key] === undefined) {
            patch[key] = defaultSettingsPayload[key];
          }
        }
      );
      if (Object.keys(patch).length > 0) {
        await updateDoc(settingsRef, {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      }
    }

    const printersQuery = query(
      collection(db, 'printers'),
      where('companyId', '==', uid),
      where('ownerUid', '==', uid)
    );
    const printersSnap = await getDocs(printersQuery);
    if (printersSnap.empty) {
      const starterPrinterId = createEntityId('prt');
      await setDoc(doc(db, 'printers', starterPrinterId), {
        companyId: uid,
        ownerUid: uid,
        name: 'Ender 3 V2',
        manufacturer: 'Creality',
        model: 'Ender 3 V2',
        technology: 'FDM',
        filamentDiameterMm: 1.75,
        serialNumber: '',
        acquisitionDate: getTodayISO(),
        acquisitionValue: 1650,
        estimatedLifespanHours: 3000,
        averagePowerWatts: 150,
        status: 'disponivel',
        accumulatedHours: 0,
        totalPrintCount: 0,
        totalFailureCount: 0,
        lastMaintenanceDate: '',
        nextMaintenanceDate: '',
        notes: 'Impressora inicial padrão configurada automaticamente.',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const [finalUser, finalCompany, finalSettings] = await Promise.all([
      getDoc(userRef),
      getDoc(companyRef),
      getDoc(settingsRef),
    ]);

    return {
      profile: { id: finalUser.id, ...(finalUser.data() as Omit<UserProfile, 'id'>) },
      company: { id: finalCompany.id, ...(finalCompany.data() as Omit<Company, 'id'>) },
      settings: { id: finalSettings.id, ...(finalSettings.data() as Omit<CompanySettings, 'id'>) },
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'bootstrap');
  }
}

export function subscribeSingleDoc<T extends { id: string }>(
  collectionName: string,
  docId: string,
  onData: (item: T | null) => void,
  onError?: (friendlyMessage: string) => void
): Unsubscribe {
  const ref = doc(db, collectionName, docId);
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<T, 'id'>) } as T) : null);
    },
    (error) => {
      const info = buildFirestoreErrorInfo(error, OperationType.GET, `${collectionName}/${docId}`);
      onError?.(formatFirestoreErrorMessage(new Error(JSON.stringify(info))));
    }
  );
}

export function subscribeCompanyMembers(
  tenant: TenantContext,
  onData: (items: CompanyMember[]) => void,
  onError?: (friendlyMessage: string) => void
): Unsubscribe {
  const q = query(
    collection(db, 'companies', tenant.companyId, 'members'),
    where('ownerUid', '==', tenant.ownerUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompanyMember, 'id'>) })));
    },
    (error) => {
      const info = buildFirestoreErrorInfo(
        error,
        OperationType.LIST,
        `companies/${tenant.companyId}/members`
      );
      onError?.(formatFirestoreErrorMessage(new Error(JSON.stringify(info))));
    }
  );
}

export async function fetchCompanyMembers(tenant: TenantContext): Promise<CompanyMember[]> {
  const path = `companies/${tenant.companyId}/members`;
  try {
    const q = query(collection(db, 'companies', tenant.companyId, 'members'), where('ownerUid', '==', tenant.ownerUid));
    const snap = await getDocsFromServer(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompanyMember, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updateCompanyInfo(
  companyId: string,
  data: Partial<Pick<Company, 'name' | 'cnpj' | 'phone' | 'email' | 'address' | 'logoUrl'>>
): Promise<void> {
  const path = `companies/${companyId}`;
  try {
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (data.name !== undefined) patch.name = cleanStr(data.name, 140);
    if (data.cnpj !== undefined) patch.cnpj = cleanStr(data.cnpj, 24);
    if (data.phone !== undefined) patch.phone = cleanStr(data.phone, 30);
    if (data.email !== undefined) patch.email = cleanStr(data.email, 160);
    if (data.address !== undefined) patch.address = cleanStr(data.address, 240);
    if (data.logoUrl !== undefined) patch.logoUrl = cleanStr(data.logoUrl, 600);
    await updateDoc(doc(db, 'companies', companyId), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCompanySettings(
  companyId: string,
  data: Partial<
    Pick<
      CompanySettings,
      | 'energyTariffPerKwh'
      | 'defaultProfitMargin'
      | 'defaultPaymentFeePercent'
      | 'defaultHourlyLaborRate'
      | 'defaultPackagingCost'
      | 'lowStockThresholdGrams'
      | 'currency'
      | 'materialTypes'
      | 'expenseCategories'
      | 'materialDensities'
    >
  >
): Promise<void> {
  const path = `settings/${companyId}`;
  try {
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (data.energyTariffPerKwh !== undefined)
      patch.energyTariffPerKwh = cleanNum(data.energyTariffPerKwh, 0);
    if (data.defaultProfitMargin !== undefined)
      patch.defaultProfitMargin = Math.min(99.9, cleanNum(data.defaultProfitMargin, 0));
    if (data.defaultPaymentFeePercent !== undefined)
      patch.defaultPaymentFeePercent = Math.min(99.9, cleanNum(data.defaultPaymentFeePercent, 0));
    if (data.defaultHourlyLaborRate !== undefined)
      patch.defaultHourlyLaborRate = cleanNum(data.defaultHourlyLaborRate, 0);
    if (data.defaultPackagingCost !== undefined)
      patch.defaultPackagingCost = cleanNum(data.defaultPackagingCost, 0);
    if (data.lowStockThresholdGrams !== undefined)
      patch.lowStockThresholdGrams = cleanNum(data.lowStockThresholdGrams, 0);
    if (data.currency !== undefined) patch.currency = cleanStr(data.currency, 10, 'BRL');
    if (data.materialTypes !== undefined) {
      patch.materialTypes = data.materialTypes.slice(0, 40).map((m) => cleanStr(m, 60)).filter(Boolean);
    }
    if (data.expenseCategories !== undefined) {
      patch.expenseCategories = data.expenseCategories
        .slice(0, 40)
        .map((c) => cleanStr(c, 80))
        .filter(Boolean);
    }
    if (data.materialDensities !== undefined) {
      patch.materialDensities = data.materialDensities;
    }
    await updateDoc(doc(db, 'settings', companyId), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveCompanyMember(
  tenant: TenantContext,
  data: Omit<CompanyMember, 'id' | 'companyId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || createEntityId('mbr');
  const path = `companies/${tenant.companyId}/members/${id}`;
  try {
    const payload = {
      name: cleanStr(data.name, 120),
      email: cleanStr(data.email, 160),
      role: data.role,
      status: data.status,
      permissions: (data.permissions || []).slice(0, 20).map((p) => cleanStr(p, 60)).filter(Boolean),
    };
    if (existingId) {
      await updateDoc(doc(db, 'companies', tenant.companyId, 'members', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'companies', tenant.companyId, 'members', id), {
        companyId: tenant.companyId,
        ownerUid: tenant.ownerUid,
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCompanyMember(companyId: string, memberId: string): Promise<void> {
  const path = `companies/${companyId}/members/${memberId}`;
  try {
    await deleteDoc(doc(db, 'companies', companyId, 'members', memberId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      isRead: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function dismissNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `notifications/${notificationId}`);
  }
}

export async function createNotification(
  tenant: TenantContext,
  data: Omit<AppNotification, 'id' | 'companyId' | 'ownerUid' | 'isRead' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const id = createEntityId('ntf');
  try {
    await setDoc(doc(db, 'notifications', id), {
      companyId: tenant.companyId,
      ownerUid: tenant.ownerUid,
      title: cleanStr(data.title, 140),
      message: cleanStr(data.message, 400),
      type: data.type,
      severity: data.severity,
      referenceId: cleanStr(data.referenceId || '', 128),
      isRead: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notifications/${id}`);
  }
}
