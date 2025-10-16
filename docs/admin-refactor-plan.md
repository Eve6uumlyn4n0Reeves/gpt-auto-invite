# Admin Interface Refactor Plan

## Goals
- Reduce the size and complexity of monolithic admin components.
- Improve discoverability by grouping feature-specific logic (bulk import, codes, users) into dedicated folders.
- Separate stateful/business logic from presentational UI for easier maintenance and testing.

## Pain Points Observed
- `components/admin/bulk-mother-import.tsx` (~850 lines) mixes parsing, validation, submission logic, and full UI rendering.
- `components/admin/views/codes-view.tsx` and `components/admin/views/users-view.tsx` each exceed 400 lines with intertwined state management and presentation.
- Shared helpers (parsers, serializers, duplication checks) are embedded in components, limiting reuse.

## Target Structure

```
components/admin/
  bulk-import/
    index.ts
    bulk-mother-import.tsx        # presentation composed from feature modules
    use-bulk-import-workflow.ts   # encapsulated state + actions
    types.ts                      # shared types for the feature
    utils/
      parsing.ts
      entries.ts
    components/
      bulk-import-input.tsx
      bulk-import-actions.tsx
      bulk-import-stats.tsx
      bulk-import-entry-card.tsx
      bulk-import-summary.tsx

  views/
    codes/
      index.ts
      use-codes-view-model.ts
      components/
        codes-generated-panel.tsx
        codes-table-columns.tsx
    users/
      index.ts
      use-users-view-model.ts
      components/
        users-table-columns.tsx
        users-batch-toolbar.tsx
```

> Note: Existing section components (`components/admin/sections/*`) remain the primary presentational surface; new feature folders feed them cleaner props.

## Implementation Steps
1. Extract bulk-import utility logic (parsing, serialization, duplication detection) into reusable modules; build `useBulkImportWorkflow` hook and smaller presentational components; replace original monolith.
2. Introduce `useCodesViewModel` hook and helper components to concentrate codes view logic, shrinking `codes-view.tsx`.
3. Apply the same pattern to `users-view.tsx` with `useUsersViewModel` and supporting components.
4. Update imports/exports, ensure layout routes use new entry points, and run lint/tests to confirm integrity.

