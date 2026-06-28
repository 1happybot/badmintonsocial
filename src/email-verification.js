export async function sendSignupVerificationEmail({ toEmail, verificationUrl, name }) {
  const apiKey = String(process.env.SENDGRID_API_KEY || process.env.TWILIO_API_KEY || '').trim();
  const fromEmail = String(process.env.SENDGRID_FROM_EMAIL || process.env.TWILIO_FROM_EMAIL || '').trim();

  if (!apiKey || !fromEmail) {
    const missing = [];
    if (!apiKey) missing.push('SENDGRID_API_KEY|TWILIO_API_KEY');
    if (!fromEmail) missing.push('SENDGRID_FROM_EMAIL|TWILIO_FROM_EMAIL');
    throw new Error(`sendgrid_not_configured:${missing.join(',')}`);
  }

  const safeName = String(name || '').trim() || 'there';

  const payload = {
    personalizations: [
      {
        to: [{ email: toEmail }],
        subject: 'Confirm your TopMinton account',
      },
    ],
    from: { email: fromEmail, name: 'TopMinton' },
    content: [
      {
        type: 'text/plain',
        value: `Hi ${safeName},\n\nConfirm your account by clicking this link:\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you did not start this signup, you can ignore this email.`,
      },
      {
        type: 'text/html',
        value: `<p>Hi ${safeName},</p><p>Confirm your account by clicking this link:</p><p><a href="${verificationUrl}">Confirm my TopMinton account</a></p><p>This link expires in 24 hours.</p><p>If you did not start this signup, you can ignore this email.</p>`,
      },
    ],
  };

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`sendgrid_error_${res.status}`);
  }
}
