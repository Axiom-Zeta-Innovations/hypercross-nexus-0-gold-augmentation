export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const providerUrl = process.env.EMAIL_PROVIDER_URL?.trim();
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim();
  if (!providerUrl || !apiKey) throw new Error("Email delivery is not configured.");

  const response = await fetch(providerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      to: email,
      subject: "Reset your Hypercross Nexus password",
      text: `Use this link to reset your password: ${resetUrl}`,
    }),
  });
  if (!response.ok) throw new Error(`Email provider rejected the request (${response.status}).`);
}