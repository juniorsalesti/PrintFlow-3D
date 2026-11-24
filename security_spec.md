# Especificação de Segurança — PrintFlow 3D (Phase 0)

## 1. Invariantes de Dados
1. **Isolamento Multi-Empresa (Tenant Isolation)**: Todo registro operacional (`customers`, `products`, `materials`, `inventoryMovements`, `printers`, `maintenanceRecords`, `quotes`, `orders`, `productionJobs`, `transactions`, `expenses`, `suppliers`, `purchases`, `notifications`, `settings`) pertence exclusivamente a uma empresa (`companyId`) e a um proprietário (`ownerUid`).
2. **Integridade de Identidade**: `ownerUid` deve corresponder a `request.auth.uid` na criação e é imutável após criação (`incoming().ownerUid == existing().ownerUid`).
3. **Verificação de Parentesco (Master Gate)**: Nenhuma entidade operacional pode ser criada sem que o documento pai `/companies/{companyId}` exista e pertença ao usuário autenticado.
4. **Integridade Temporal**: `createdAt` deve ser estritamente `request.time` na criação e imutável na atualização; `updatedAt` deve ser estritamente `request.time` em toda escrita.
5. **Prevenção de Duplicidade & Imutabilidade**:
   - `inventoryMovements` é um razão auditável (append-only): não permite `update` nem `delete` por usuários comuns.
   - `productionJobs` em estado terminal (`finalizado`, `cancelado`) não podem ser reabertos ou finalizados novamente (evitando dupla baixa de estoque).
   - `purchases` em estado `recebido` ou `cancelado` são bloqueadas contra reprocessamento.
   - `quotes` em estado `convertido` não podem ser reconvertidos.
6. **Proteção contra Campos Fantasmas e Poisoning**: Todas as coleções validam `keys().hasAll(...)` e `keys().hasOnly(...)` na criação e `affectedKeys().hasOnly(...)` em ações de atualização, além de `.size()` em todas as strings e listas e `isValidId()` em IDs de documentos.

## 2. "Dirty Dozen" Payloads (Vetores de Ataque Bloqueados)
1. **Identity Spoofing em Cliente**: Criar `/customers/cust_1` com `ownerUid: "vitima_uid"`. -> `PERMISSION_DENIED`.
2. **Shadow Field Injection (Ghost Field)**: Criar `/printers/prt_1` incluindo `{ isVerified: true, adminOverride: true }`. -> `PERMISSION_DENIED`.
3. **Privilege Escalation em User Profile**: Criar `/users/{uid}` definindo `role: "admin"` ou atualizar `role` posteriormente. -> `PERMISSION_DENIED`.
4. **Orphaned Record**: Criar `/orders/ord_1` referenciando `companyId: "empresa_inexistente"`. -> `PERMISSION_DENIED`.
5. **ID Poisoning (1.5KB ID)**: Criar `/products/{id_gigante_1500_chars}`. -> `PERMISSION_DENIED`.
6. **Timestamp Spoofing**: Criar `/expenses/exp_1` com `createdAt: "2020-01-01T00:00:00Z"` em vez de `request.time`. -> `PERMISSION_DENIED`.
7. **Unverified Email Bypass**: Tentar escrita com `request.auth.token.email_verified == false`. -> `PERMISSION_DENIED`.
8. **Cross-Tenant List Scraping**: Executar `list` em `/customers` sem filtro de `ownerUid == request.auth.uid`. -> `PERMISSION_DENIED`.
9. **Double Stock Deduction (Terminal State Re-execution)**: Atualizar `/productionJobs/job_1` cujo status já é `finalizado` tentando alterar `status` ou `actualWeightGrams`. -> `PERMISSION_DENIED`.
10. **Ledger Tampering**: Atualizar ou excluir registro em `/inventoryMovements/mov_1`. -> `PERMISSION_DENIED`.
11. **Value Poisoning em Update**: Enviar `update` em `/printers/prt_1` com `status: 12345` (tipo inválido) ou string de 10KB em `name`. -> `PERMISSION_DENIED`.
12. **PII Cross-Tenant Read**: Ler `/customers/cust_alheio` ou `/users/outro_uid` autenticado como outro usuário. -> `PERMISSION_DENIED`.
