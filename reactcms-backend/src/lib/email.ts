import { Resend } from 'resend';
import { config } from '../config';
import { logger } from './logger';

let resend: Resend | null = null;

function getClient(): Resend | null {
  if (!config.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(config.RESEND_API_KEY);
  return resend;
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
): Promise<{ sent: boolean; method: 'email' | 'console' }> {
  const verifyUrl = `${config.DASHBOARD_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const client = getClient();

  if (!client) {
    logger.warn('RESEND_API_KEY not set — logging verification link instead', { to, verifyUrl });
    console.log(`\n📧 Email verification for ${to}:\n   ${verifyUrl}\n`);
    return { sent: true, method: 'console' };
  }

  try {
    await client.emails.send({
      from: config.RESEND_FROM_EMAIL,
      to,
      subject: 'Verify your PagePilot email',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:#22c55e;border-radius:10px;margin-bottom:12px;">
              <span style="color:#fff;font-weight:800;font-size:14px;">PP</span>
            </div>
            <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0;">Welcome to PagePilot</h1>
          </div>
          <p style="font-size:15px;color:#334155;line-height:1.6;">Hi ${name},</p>
          <p style="font-size:15px;color:#334155;line-height:1.6;">Click the button below to verify your email address and activate your account.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${verifyUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">
              Verify email
            </a>
          </div>
          <p style="font-size:13px;color:#94a3b8;line-height:1.5;">If you didn't create a PagePilot account, you can ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="font-size:12px;color:#94a3b8;">Or copy this link: <a href="${verifyUrl}" style="color:#22c55e;">${verifyUrl}</a></p>
        </div>
      `,
    });
    logger.info('Verification email sent', { to });
    return { sent: true, method: 'email' };
  } catch (err) {
    logger.error('Failed to send verification email', { to, error: (err as Error).message });
    return { sent: false, method: 'email' };
  }
}
