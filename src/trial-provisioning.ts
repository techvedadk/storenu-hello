export interface TrialProvisioningResult {
	storeId: string;
	existing: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export async function parseTrialProvisioningResponse(
	response: Response,
): Promise<TrialProvisioningResult> {
	const payload: unknown = await response.json();

	if (!isRecord(payload)) {
		throw new Error("Trial store could not be provisioned");
	}

	const error = typeof payload.error === "string" ? payload.error : undefined;
	if (!response.ok || payload.ok !== true) {
		throw new Error(error ?? "Trial store could not be provisioned");
	}

	if (typeof payload.storeId !== "string" || payload.storeId.length === 0) {
		throw new Error("Trial store response did not include a store ID");
	}

	if (typeof payload.existing !== "boolean") {
		throw new Error("Trial store response did not include its existing status");
	}

	return {
		storeId: payload.storeId,
		existing: payload.existing,
	};
}
