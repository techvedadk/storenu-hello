# Trial Provisioning Worker Design

## Problem

The Worker calls `POST /internal/payment-onboarding/start` and still expects the former coupled payment-onboarding response. The backend now returns only the trial-store provisioning result: `ok`, `storeId`, and `existing`. A successful backend response therefore causes the Worker to throw because `accountReference` and `onboardingUrl` are absent.

## Design

Keep the landing-page flow limited to trial-store provisioning. Add a small typed response parser that validates untrusted backend JSON and accepts `{ ok: true, storeId, existing }`. The Worker will email the store ID and whether the store already existed, and its success response will expose that result as `provisioning`.

Payment-provider account creation remains outside the Worker and continues through the operator-triggered `/internal/payment-onboarding/link` endpoint.

## Error handling

Non-success HTTP responses, explicit backend failures, malformed JSON shapes, and missing store IDs remain errors. When available, the backend's typed error message is preserved.

## Testing

Unit tests cover the new successful response contract and rejection of a backend error. TypeScript checking and a Wrangler dry-run verify the Worker bundle.
