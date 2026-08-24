# Trial Provisioning Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make landing-page submissions accept the backend's trial-store provisioning response without requiring payment-onboarding fields.

**Architecture:** Parse the backend response through a focused typed boundary, then pass the resulting `storeId` and `existing` values through email and HTTP success responses. Keep payment onboarding out of the Worker.

**Tech Stack:** TypeScript, Cloudflare Workers, Vitest, Wrangler

---

### Task 1: Add a typed trial-provisioning response boundary

**Files:**
- Create: `src/trial-provisioning.ts`
- Create: `src/trial-provisioning.test.ts`

- [ ] **Step 1: Write the failing test**

Test that a `200` response containing `{ ok: true, storeId, existing }` is accepted and a backend error is rejected with its message.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/trial-provisioning.test.ts`
Expected: FAIL because `parseTrialProvisioningResponse` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create explicit result and payload types, narrow the decoded `unknown` JSON through record/property checks, and return only `storeId` and `existing`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/trial-provisioning.test.ts`
Expected: both tests PASS.

### Task 2: Use trial provisioning in the Worker

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace the legacy onboarding contract**

Rename `startPaymentOnboarding` to `provisionTrialStore`, parse its response with the typed helper, update notification copy to store-provisioning details, and return the result as `provisioning`.

- [ ] **Step 2: Verify the complete change**

Run: `npm test -- --run && npm run cf-typegen && npx tsc --noEmit && npx wrangler deploy --dry-run`
Expected: tests, type generation, TypeScript, and the dry-run bundle all exit successfully.

- [ ] **Step 3: Commit and push**

Commit the source, tests, and documentation, fast-forward local `main`, and push `main` to `origin`.
