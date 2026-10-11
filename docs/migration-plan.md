# Catalog migration plan

Status: proposal, 2026-10-11. **No migration has been performed.** This plans a controlled workflow; it does not authorize bulk extraction, import or modification.

## Why migration is needed

The storefront currently ships a **22-product fixture** (`src/data/catalog.ts`) hand-curated from the public storefront `queenbees.sellbd.shop`. It was built as a demonstration sample, not as a production catalog.

When QueenBee's owns its own catalog, real product data must be entered. Doing that by hand is slow and error-prone; the public storefront is a plausible source. But the public catalog is **not assumed to be complete, current or authoritative**, and the Phase 7 audit found the merchant dashboard's own catalog to be empty - so there is no authoritative digital source to read today.

## What migration is and is not

| It is | It is not |
| --- | --- |
| A reviewed, validated import into QueenBee's own database | A live sync with any external system |
| A one-time or occasional assisted capture, with provenance | A dependency on Zatiq's private API or internal identifiers |
| A process that produces a report before it writes anything | A bulk scrape performed without approval |

**Prohibited:** using Zatiq's undocumented private API; treating Zatiq product ids, shop ids or asset paths as QueenBee's permanent identifiers; any bulk extraction performed without explicit owner authorization.

## Proposed workflow

Each stage is gated. Nothing proceeds to the next stage without the prior stage's output being reviewed.

### Stage 1 - Authorization and scope

- Owner approves what may be extracted, from where, and how much.
- Owner confirms the reuse rights position for imagery (see Stage 5).
- Define the target: a bounded sample for validation, or the full catalog.

### Stage 2 - Extraction

Capture, per product: name, brand, category, pack size, price, comparison price, description (where published), and image URLs. Record for each record:

- the source URL,
- the capture date,
- the method used.

The existing fixture already demonstrates this provenance discipline (`sourcePage`, `sourceAsset`, `retrievedAt`, `sourceProductId`) and its shape should be preserved.

### Stage 3 - Validation before import

Every record is checked before it can be imported:

| Check | Rule |
| --- | --- |
| Required fields | Name, price, category and at least one image must be present |
| Price sanity | Positive integer poisha; comparison price strictly greater than price or absent |
| Category validity | Must map to an existing QueenBee's category |
| Image availability | Every referenced image must actually resolve |
| Duplicates | Detect by name similarity, brand + pack size, and image identity - not by name equality alone |
| Variant uncertainty | Flag anything suggesting sizes, shades or multipacks for human decision |
| Missing fields | Flag absent descriptions, pack sizes and brands rather than inventing them |
| Price inconsistency | Flag prices that differ from any other captured source for the same product |

### Stage 4 - Migration report

**A report is produced before any write.** It contains: record counts, the validation results, every flagged item with its reason, and a summary of what would be created versus skipped. The owner reviews and approves the report. This is the gate that prevents a bad import.

### Stage 5 - Rights and content review

The two blockers that are not technical:

- **Image reuse rights.** Public visibility is not a licence. The current 22 images are tagged `rights: 'merchant_source_pending_confirmation'` and are not cleared for public launch. Migration does not change that: images are imported only with recorded permission, or replaced with owned photography.
- **Bangla content.** Product names in the current fixture are transliterations prepared for the demo and require native review. Descriptions are absent because the public pages publish none.

### Stage 6 - Idempotent import

- Every imported record carries a stable external key and its provenance, so a repeated import **updates rather than duplicates**.
- Imports run inside a transaction and are **recoverable** - a failed import leaves the catalog in its prior state, not half-written.
- Imports are recorded in the audit log.
- A dry-run mode exists and is the default.
- **Image bytes are written to object storage (Neon Object Storage, D3), not to PostgreSQL and not to the application filesystem.** Each image gets a server-generated key, and the database stores our own key plus provenance - never the source URL as the product's identity, because Neon's public URLs embed the branch id.

### Stage 7 - Post-import verification

- Product count matches the report.
- Spot-check a sample of records against their source.
- Confirm every image resolves and renders.
- Confirm the storefront's existing catalog checks still pass against the new data source.

## What carries over from the current implementation

The migration target should preserve these already-validated decisions:

- **Integer poisha** for all money.
- **Derived discounts** - never stored, always computed from price and comparison price.
- **Provenance fields** on every product and image.
- **Curated selections as id lists**, not a `featured` boolean on the product.
- **Explicit `null` for unknown fields**, with the interface stating the gap rather than filling it.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Public catalog is incomplete or stale | Imported catalog is wrong | Treat the report as mandatory; verify against a second source where possible |
| Image rights unresolved | Legal exposure on launch | Block public launch until rights are cleared or imagery is replaced |
| Bangla transliterations shipped unreviewed | Customer-facing quality and trust | Native review gate before launch |
| Duplicate records from repeated imports | Duplicated catalog | Stable external keys and idempotent upserts |
| Zatiq identifiers treated as permanent | Hidden coupling | QueenBee's assigns its own ids; external ids are provenance metadata only |
| Bulk extraction without approval | Scope and rights violation | Explicit authorization gate at Stage 1 |

## Explicitly not in scope

Live synchronization with any external system, automated re-capture schedules, importing customers or orders from any source, and any modification of the current fixture or database during this planning phase.
