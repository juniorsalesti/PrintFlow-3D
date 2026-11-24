import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const firebaseProjectId = firebaseConfig.projectId;
export const firebaseDatabaseId = firebaseConfig.firestoreDatabaseId;
export const firebaseAuthConsoleUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

function matchesAuthorizedDomain(hostname: string, pattern: string): boolean {
  if (!hostname || !pattern) return false;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(pattern)) {
    return hostname === pattern;
  }
  const escaped = pattern.replace(/\./g, '\\.');
  const regex = new RegExp(`^(.+\\.${escaped}|${escaped})$`, 'i');
  return regex.test(hostname);
}

export interface DomainAuthorizationCheck {
  checked: boolean;
  authorized: boolean;
  currentHost: string;
  consoleUrl: string;
}

export async function checkAuthorizedDomain(): Promise<DomainAuthorizationCheck> {
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const consoleUrl = firebaseAuthConsoleUrl;
  if (!currentHost || !firebaseConfig.apiKey) {
    return { checked: false, authorized: true, currentHost, consoleUrl };
  }
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(firebaseConfig.apiKey)}`
    );
    if (!res.ok) {
      return { checked: false, authorized: true, currentHost, consoleUrl };
    }
    const data = (await res.json()) as { authorizedDomains?: string[] };
    const domains = Array.isArray(data.authorizedDomains) ? data.authorizedDomains : [];
    const authorized = domains.some((domain) => matchesAuthorizedDomain(currentHost, domain));
    return { checked: true, authorized, currentHost, consoleUrl };
  } catch {
    return { checked: false, authorized: true, currentHost, consoleUrl };
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  throw new Error(JSON.stringify(errInfo));
}

export function formatFirestoreErrorMessage(
  error: unknown,
  fallback = 'Erro ao comunicar com o banco de dados.'
): string {
  if (!(error instanceof Error)) return fallback;
  let rawMessage = error.message || fallback;
  let path: string | null = null;
  try {
    const parsed = JSON.parse(error.message) as {
      error?: string;
      path?: string | null;
    };
    if (parsed && parsed.error) {
      rawMessage = parsed.error;
      path = parsed.path || null;
    }
  } catch {
    // Plain non-JSON error
  }

  if (
    rawMessage.includes('Missing or insufficient permissions') ||
    rawMessage.includes('PERMISSION_DENIED')
  ) {
    return `Permissão negada no Firestore (${path || 'banco'}). Verifique se sua conta Google está autenticada e tente recarregar a sessão.`;
  }
  if (
    rawMessage.includes('the client is offline') ||
    rawMessage.includes('Failed to get document from server') ||
    rawMessage.includes('unavailable') ||
    rawMessage.includes('network')
  ) {
    return 'Sem conexão com o servidor do Firestore. Os dados não foram salvos na nuvem. Verifique sua internet e tente novamente.';
  }
  if (rawMessage.includes('Quota exceeded')) {
    return 'Limite diário de uso gratuito do Firestore atingido. A cota será redefinida amanhã ou pode ser ampliada no plano Firebase.';
  }

  return `${rawMessage}${path ? ` (${path})` : ''}`;
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Verifique sua configuração do Firebase: cliente offline.');
      return false;
    }
    return true;
  }
}

void testConnection();
