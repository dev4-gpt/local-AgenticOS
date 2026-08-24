type LeadNotification = {
  kind: "lead" | "runtime request" | "support request";
  name: string;
  email: string;
  company?: string | null;
  source: string;
  details?: string[];
};

type NotificationResult = "sent" | "not_configured" | "failed";

const RESEND_URL = "https://api.resend.com/emails";

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
}

export async function notifyLead(notification: LeadNotification): Promise<NotificationResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_NOTIFICATION_FROM;
  const recipients = (process.env.LEAD_NOTIFICATION_TO ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!apiKey || !from || recipients.length === 0) return "not_configured";

  const company = notification.company?.trim() || "Not provided";
  const subject = `New Veloce ${notification.kind}: ${notification.name}`;
  const text = [
    `A new Veloce ${notification.kind} was captured.`,
    "",
    `Name: ${notification.name}`,
    `Email: ${notification.email}`,
    `Company: ${company}`,
    `Source: ${notification.source}`,
    ...(notification.details ?? []),
    "",
    "The full, server-side record is in Supabase.",
  ].join("\n");

  try {
    const result = await fetch(RESEND_URL, {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        reply_to: notification.email,
        subject,
        text,
        html: `<p>A new Veloce ${escapeHtml(notification.kind)} was captured.</p><ul><li><strong>Name:</strong> ${escapeHtml(notification.name)}</li><li><strong>Email:</strong> ${escapeHtml(notification.email)}</li><li><strong>Company:</strong> ${escapeHtml(company)}</li><li><strong>Source:</strong> ${escapeHtml(notification.source)}</li>${(notification.details ?? []).map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul><p>The full, server-side record is in Supabase.</p>`,
      }),
    });
    if (result.ok) return "sent";
    console.error("lead notification failed", { status: result.status });
  } catch (error) {
    console.error("lead notification unavailable", error instanceof Error ? error.name : "unknown error");
  }
  return "failed";
}
