import { describe, expect, it } from "vitest";
import { parseTrialProvisioningResponse } from "./trial-provisioning";

describe("parseTrialProvisioningResponse", () => {
	it("accepts the trial-store provisioning response", async () => {
		const response = new Response(
			JSON.stringify({
				ok: true,
				storeId: "store-123",
				existing: false,
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);

		await expect(parseTrialProvisioningResponse(response)).resolves.toEqual({
			storeId: "store-123",
			existing: false,
		});
	});

	it("preserves a backend provisioning error", async () => {
		const response = new Response(
			JSON.stringify({ ok: false, error: "Provisioning unavailable" }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);

		await expect(parseTrialProvisioningResponse(response)).rejects.toThrow(
			"Provisioning unavailable",
		);
	});
});
