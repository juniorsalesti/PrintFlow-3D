/**
 * Security Rules Validation Suite for PrintFlow 3D
 * Covers all 12 "Dirty Dozen" payloads against firestore.rules invariants.
 * Run with @firebase/rules-unit-testing when Firestore Emulator is active.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  expected: 'PERMISSION_DENIED';
  rationale: string;
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Customer Create',
    collection: 'customers',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'ownerUid != request.auth.uid must be rejected by isValidCustomer()',
    payload: { ownerUid: 'other_user_uid', companyId: 'comp_1', fullName: 'Atacante' },
  },
  {
    id: 2,
    name: 'Shadow Field Injection on Printer Create',
    collection: 'printers',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Extra ghost field isVerified rejected by keys().hasOnly()',
    payload: { name: 'Ender 3 V2', status: 'disponivel', isVerified: true },
  },
  {
    id: 3,
    name: 'Self-Assigned Admin Role Escalation on User Profile',
    collection: 'users',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'role must not allow arbitrary privilege escalation on existing company',
    payload: { role: 'admin', uid: 'attacker_uid' },
  },
  {
    id: 4,
    name: 'Orphaned Order without Existing Parent Company',
    collection: 'orders',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'ownsCompany(companyId) enforces exists() and ownerUid match on /companies/{companyId}',
    payload: { companyId: 'non_existent_company', orderNumber: 'PED-9999' },
  },
  {
    id: 5,
    name: 'Document ID Poisoning (>128 chars or invalid chars)',
    collection: 'products',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidId(productId) rejects IDs exceeding 128 chars or containing spaces/slashes',
  },
  {
    id: 6,
    name: 'Client Timestamp Spoofing on Expense',
    collection: 'expenses',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'createdAt == request.time and updatedAt == request.time prevent backdating',
    payload: { createdAt: '2020-01-01T00:00:00.000Z' },
  },
  {
    id: 7,
    name: 'Unverified Email Write Attempt',
    collection: 'materials',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isVerifiedUser() mandates request.auth.token.email_verified == true',
  },
  {
    id: 8,
    name: 'Unscoped List Query on Customers',
    collection: 'customers',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow list requires resource.data.ownerUid == request.auth.uid',
  },
  {
    id: 9,
    name: 'Terminal State Re-Execution on Finished ProductionJob',
    collection: 'productionJobs',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Terminal lock prevents modifying finalizado or cancelado production jobs',
    payload: { status: 'imprimindo' },
  },
  {
    id: 10,
    name: 'Inventory Movement Ledger Tampering',
    collection: 'inventoryMovements',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'inventoryMovements are append-only; updates and deletes are denied',
    payload: { quantityGrams: 0 },
  },
  {
    id: 11,
    name: 'Value Poisoning on Printer Status Update',
    collection: 'printers',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidPrinter() wraps update block and rejects non-enum status or oversized strings',
    payload: { status: 'hacked_status' },
  },
  {
    id: 12,
    name: 'Cross-Tenant PII Read on Customer Document',
    collection: 'customers',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow get restricts PII access to resource.data.ownerUid == request.auth.uid',
  },
];
