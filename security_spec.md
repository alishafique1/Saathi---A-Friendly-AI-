# Security Specification - Saathi

## Data Invariants
- **Privacy First**: All data is user-siloed. There is no shared group data in the MVP.
- **Identity Integrity**: All documents (`/habits`, `/habitLogs`, `/tasks`, `/journals`) must have a `userId` field that strictly matches the creator's UID.
- **Energy Logs**: A `HabitLog` must be associated with a valid `Habit` owned by the same user.
- **Immutability**: `createdAt` and `userId` fields cannot be changed after creation.
- **Validation**: Energy levels must be within 1-5 range. String lengths restricted for "Denial of Wallet" protection.

## The Dirty Dozen Payloads (Red Team Tests)

| # | Operation | Target | Payload | Security Goal |
|---|-----------|--------|---------|---------------|
| 1 | Create | `/habits` | `{ "name": "Hack", "userId": "victim_uid" }` | Prevent Identity Spoofing |
| 2 | Get | `/habits/H1` | - (by non-owner) | Prevent Cross-User Read |
| 3 | Update | `/habits/H1` | `{ "userId": "attacker_uid" }` | Prevent Theft of Resource |
| 4 | List | `/tasks` | - (without userId filter) | Prevent Data Scraping |
| 5 | Create | `/habitLogs` | `{ "habitId": "victim_habit", "status": "completed" }` | Relational Integrity |
| 6 | Create | `/tasks` | `{ "energyRequired": 10 }` (out of range) | Value Validation |
| 7 | Create | `/admins/V1` | `{ "uid": "attacker_uid" }` | Privilege Escalation (Blocked by default-deny) |
| 8 | Delete | `/habits/H1` | - (by non-owner) | Prevent Malicious Deletion |
| 9 | Update | `/users/U1` | `{ "uid": "victim_uid", "latestEnergyLevel": 5 }` (by non-owner) | PII Isolation |
| 10 | Create | `/habits` | `{ "name": "X".repeat(1000) }` | Size Limits |
| 11 | Create | `/tasks` | `{ "createdAt": "2020-01-01..." }` | Timestamp Integrity |
| 12 | Update | `/tasks/T1` | `{ "googleTaskId": "new_id" }` (if immutable) | Enforce Immutability |

## Test Runner (Conceptual)
All the above payloads must return `PERMISSION_DENIED` in the Firestore Security Rules emulator. The current `firestore.rules` implements these gates using `isOwner()` and `isValid[Entity]` helpers.
