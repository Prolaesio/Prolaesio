import nodemailer from 'nodemailer';

type GuardianEmailKind = 'invitation' | 'reminder' | 'accepted' | 'approved' | 'rejected' | 'relationship_suspended' | 'adult_reauthorised' | 'privacy_update';

const subjects: Record<GuardianEmailKind, string> = {
  invitation: 'You have been invited to Lodario as a Guardian',
  reminder: 'Reminder: complete your Lodario Guardian invitation',
  accepted: 'Guardian invitation accepted',
  approved: 'Player account approved',
  rejected: 'Player account approval declined',
  relationship_suspended: 'Guardian access paused',
  adult_reauthorised: 'Limited Guardian access authorised',
  privacy_update: 'Update on your Lodario privacy request',
};

export function buildGuardianEmail(kind: GuardianEmailKind, values: { playerName?: string; guardianName?: string; actionUrl?: string; detail?: string }) {
  const greeting = values.guardianName ? `Hello ${values.guardianName},` : 'Hello,';
  const player = values.playerName || 'the Player';
  const body: Record<GuardianEmailKind, string> = {
    invitation: `You have been invited to connect with ${player} in Lodario. Use the secure link below. The invitation expires in 7 days and can only be used once.`,
    reminder: `Your invitation to connect with ${player} is still waiting.`,
    accepted: `Your Guardian invitation for ${player} was accepted.`,
    approved: `You approved ${player}'s account. The account is now active.`,
    rejected: `You declined the account approval request for ${player}.`,
    relationship_suspended: `Guardian access for ${player} has been paused following an age-policy transition.`,
    adult_reauthorised: `${player} explicitly authorised limited Guardian access.`,
    privacy_update: values.detail || 'There is an update on your privacy request.',
  };
  const lines = [greeting, '', body[kind]];
  if (values.actionUrl) lines.push('', values.actionUrl);
  lines.push('', 'Lodario Guardian provides a limited, read-only overview. It is not medical advice or an emergency service.', '', 'If you did not expect this message, do not use the link.');
  const text = lines.join('\n');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:620px"><h2 style="color:#087f8c">Lodario Guardian</h2>${text.split('\n').map(line => line ? `<p>${escapeHtml(line)}</p>` : '<br>').join('')}</div>`;
  return { subject: subjects[kind], text, html };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function sendGuardianEmail(to: string, message: ReturnType<typeof buildGuardianEmail>) {
  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;
  const from = process.env.EMAIL_FROM;
  if (!user || !pass || !from) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[guardian-email:development]', { to, subject: message.subject, text: message.text });
      return { delivered: false, development: true };
    }
    throw new Error('Guardian email delivery is not configured.');
  }
  const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, requireTLS: true, auth: { user, pass } });
  await transporter.sendMail({ from, to, ...message });
  return { delivered: true, development: false };
}
