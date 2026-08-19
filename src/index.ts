import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";


export interface Env {
	USER_NOTIFICATION: KVNamespace;
	TURNSTILE_SECRET_KEY: string;
	ALLOWED_ORIGINS: string; // comma-separated
	cf_worker_email: any;
	SEND_TO_EMAIL?: string;
	TECHCOMMERCE_API_URL: string;
	PAYMENT_ONBOARDING_INTERNAL_SECRET: string;
}

// The raw incoming body (everything optional since we validate manually)
interface FormBody {
	name?: string;
	email?: string;
	phone?: string;
	message?: string;
	"cf-turnstile-response"?: string;
}

// The clean, validated submission we store in KV (no token)
interface FormSubmission {
	name: string;
	email: string;
	phone?: string;
	message?: string;
}

interface OnboardingResult {
	storeId: string;
	accountReference: string;
	onboardingUrl: string;
	expiresAt?: string;
}


async function verifyTurnstile(token: string, secretKey: string, ip: string): Promise<boolean> {
	const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			secret: secretKey,
			response: token,
			remoteip: ip, // optional but recommended
		}),
	});

	const result: { success: boolean } = await response.json();
	return result.success;
}

function getAllowedOrigin(request: Request, allowedOrigins: string): string | null {
	const origin = request.headers.get("Origin");
	if (!origin) return null;

	const allowed = allowedOrigins.split(",").map((o) => o.trim());
	return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string) {
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};
}

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateFormData(data: Partial<FormBody>): string | null {
	if (!data.name || data.name.trim() === "") return "Name is required.";
	if (!data.email || data.email.trim() === "") return "Email is required.";
	if (!isValidEmail(data.email)) return "Invalid email format.";
	return null;
}

async function send_email(
	env: Env,
	data: FormSubmission,
	onboarding: OnboardingResult,
): Promise<void> {


	const msg = createMimeMessage();

	msg.setSender({ name: "StoreNuKV", addr: 'me@shriharip.com' });
	msg.setRecipient(env.SEND_TO_EMAIL ?? 'shrihari.p4@gmail.com');
	msg.setSubject("New Store Claim - Stripe onboarding ready");
	msg.addMessage({
		contentType: "text/plain",
		data: [
			`Lead: ${JSON.stringify(data)}`,
			`Store ID: ${onboarding.storeId}`,
			`Stripe account ID: ${onboarding.accountReference}`,
			`Onboarding link: ${onboarding.onboardingUrl}`,
		].join("\n"),
	});

	const emailMessage = new EmailMessage('me@shriharip.com', 'shrihari.p4@gmail.com', msg.asRaw());

	await env.cf_worker_email.send(emailMessage);
}

async function startPaymentOnboarding(
	env: Env,
	data: FormSubmission,
): Promise<OnboardingResult> {
	const response = await fetch(
		`${env.TECHCOMMERCE_API_URL}/internal/payment-onboarding/start`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-internal-secret": env.PAYMENT_ONBOARDING_INTERNAL_SECRET,
			},
			body: JSON.stringify({
				...data,
				country: "DK",
				currency: "DKK",
			}),
		},
	);
	const result = (await response.json()) as {
		ok?: boolean;
		storeId?: string;
		accountReference?: string;
		onboardingUrl?: string;
		expiresAt?: string;
		error?: string;
	};
	if (!response.ok || !result.ok || !result.storeId || !result.accountReference || !result.onboardingUrl) {
		throw new Error(result.error ?? "Payment onboarding could not be started");
	}
	return {
		storeId: result.storeId,
		accountReference: result.accountReference,
		onboardingUrl: result.onboardingUrl,
		expiresAt: result.expiresAt,
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		const allowedOrigin = getAllowedOrigin(request, env.ALLOWED_ORIGINS);

		// Reject requests from unknown origins early
		if (!allowedOrigin) {
			return new Response(null, { status: 403 });
		}

		// Preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders(allowedOrigin) });
		}

		if (request.method === "POST" && url.pathname === "/submit") {
			try {
				const contentType = request.headers.get("content-type") ?? "";

				let body: Partial<FormBody> = {};

				// Handle both JSON and form-urlencoded payloads
				if (contentType.includes("application/json")) {
					body = await request.json();
				} else if (contentType.includes("application/x-www-form-urlencoded")) {
					const formData = await request.formData();
					body = {
						name: formData.get("name")?.toString(),
						email: formData.get("email")?.toString(),
						phone: formData.get("phone")?.toString(),
						message: formData.get("message")?.toString(),
						"cf-turnstile-response": formData.get("cf-turnstile-response")?.toString(),
					};
				} else {
					return new Response("Unsupported content type.", { status: 415 });
				}

				// Verify Turnstile token first before anything else
				const token = body["cf-turnstile-response"];
				if (!token) {
					return new Response(JSON.stringify({ error: "Missing Turnstile token." }), {
						status: 400,
						headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
					});
				}

				const clientIp = request.headers.get("CF-Connecting-IP") ?? "";
				const isHuman = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, clientIp);

				if (!isHuman) {
					return new Response(JSON.stringify({ error: "Bot verification failed." }), {
						status: 403,
						headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
					});
				}

				// Validate
				const validationError = validateFormData(body);
				if (validationError) {
					return new Response(JSON.stringify({ error: validationError }), {
						status: 400,
						headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
					});
				}

				// Build the submission object
				const submission: FormSubmission = {
					name: body.name!.trim(),
					email: body.email!.trim(),
					...(body.phone && { phone: body.phone.trim() }),
					...(body.message && { message: body.message.trim() }),
				};

				// Use email as a unique KV key
				const key = `submission:${submission.email}`;
				await env.USER_NOTIFICATION.put(key, JSON.stringify(submission));

				const onboarding = await startPaymentOnboarding(env, submission);
				await send_email(env, submission, onboarding);

				return new Response(
					JSON.stringify({ success: true, message: "Submission saved.", key, onboarding }),
					{
						status: 201,
						headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
					}
				);
			} catch (err) {
				console.log(err);
				return new Response(JSON.stringify({ error: "Internal server error." }), {
					status: 500,
					headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
				});
			}
		}

		return new Response("Not found.", { status: 404, headers: corsHeaders(allowedOrigin) });
	}
} satisfies ExportedHandler<Env>;
