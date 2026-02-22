export interface Env {
  USER_NOTIFICATION: KVNamespace;
}


interface FormData {
  name: string;
  email: string;
  phone?: string;
  message?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateFormData(data: Partial<FormData>): string | null {
  if (!data.name || data.name.trim() === "") return "Name is required.";
  if (!data.email || data.email.trim() === "") return "Email is required.";
  if (!isValidEmail(data.email)) return "Invalid email format.";
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/submit") {
      try {
        const contentType = request.headers.get("content-type") ?? "";

        let body: Partial<FormData> = {};

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
          };
        } else {
          return new Response("Unsupported content type.", { status: 415 });
        }

        // Validate
        const validationError = validateFormData(body);
        if (validationError) {
          return new Response(JSON.stringify({ error: validationError }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Build the submission object
        const submission: FormData = {
          name: body.name!.trim(),
          email: body.email!.trim(),
          ...(body.phone && { phone: body.phone.trim() }),
          ...(body.message && { message: body.message.trim() }),
        };

        // Use email as a unique KV key
        const key = `submission:${submission.email}`;
        await env.USER_NOTIFICATION.put(key, JSON.stringify(submission));

        return new Response(
          JSON.stringify({ success: true, message: "Submission saved.", key }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: "Internal server error." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not found.", { status: 404 });
  }
} satisfies ExportedHandler<Env>;