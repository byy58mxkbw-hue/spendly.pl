// Klient API Resend (transakcyjne maile). Zwykły fetch, bez SDK — ten sam wzorzec
// co gopos-client.ts. Nic nie wysyła, dopóki RESEND_API_KEY nie jest ustawiony
// (sprawdza wołający, np. email-service.ts).
const API_BASE = "https://api.resend.com";

export class ResendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ResendError";
  }
}

export type SendEmailInput = { to: string; subject: string; html: string; from: string; replyTo?: string };

export async function sendEmail(apiKey: string, input: SendEmailInput): Promise<void> {
  const res = await fetch(`${API_BASE}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ResendError(res.status, `Resend: wysyłka nieudana (HTTP ${res.status}). ${body.slice(0, 300)}`);
  }
}

// Dopisuje kontakt do Audience w Resend — buduje listę odbiorców pod przyszłe
// promocje wysyłane BEZPOŚREDNIO z panelu Resend (Broadcasts), bez własnego
// composera kampanii w apce. Błąd tutaj nie ma zatrzymywać wysyłki maila
// powitalnego — wołający (email-service.ts) łapie wyjątek osobno.
export async function upsertContact(apiKey: string, audienceId: string, email: string, firstName?: string | null): Promise<void> {
  const res = await fetch(`${API_BASE}/audiences/${audienceId}/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, first_name: firstName ?? undefined, unsubscribed: false }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ResendError(res.status, `Resend: dodanie kontaktu nieudane (HTTP ${res.status}). ${body.slice(0, 300)}`);
  }
}
