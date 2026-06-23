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

export async function sendInviteEmail(
  to: string,
  inviteeName: string,
  websiteName: string,
  role: string,
  invitedByName: string,
): Promise<{ sent: boolean; method: 'email' | 'console' }> {
  const dashboardUrl = `${config.DASHBOARD_URL}/websites`;
  const client = getClient();

  if (!client) {
    logger.warn('RESEND_API_KEY not set — logging invite instead', { to, websiteName });
    console.log(`\n📨 Invite for ${to} to "${websiteName}" as ${role}:\n   ${dashboardUrl}\n`);
    return { sent: true, method: 'console' };
  }

  try {
    await client.emails.send({
      from: config.RESEND_FROM_EMAIL,
      to,
      subject: `You've been invited to ${websiteName} on PagePilot`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:#22c55e;border-radius:10px;margin-bottom:12px;">
              <span style="color:#fff;font-weight:800;font-size:14px;">PP</span>
            </div>
            <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0;">You're invited!</h1>
          </div>
          <p style="font-size:15px;color:#334155;line-height:1.6;">Hi ${inviteeName},</p>
          <p style="font-size:15px;color:#334155;line-height:1.6;"><strong>${invitedByName}</strong> has invited you to collaborate on <strong>${websiteName}</strong> as <strong>${role}</strong>.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${dashboardUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">
              View invitation
            </a>
          </div>
          <p style="font-size:13px;color:#94a3b8;line-height:1.5;">Log in to your PagePilot dashboard to accept or decline.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="font-size:12px;color:#94a3b8;">Or go to: <a href="${dashboardUrl}" style="color:#22c55e;">${dashboardUrl}</a></p>
        </div>
      `,
    });
    logger.info('Invite email sent', { to, websiteName });
    return { sent: true, method: 'email' };
  } catch (err) {
    logger.error('Failed to send invite email', { to, error: (err as Error).message });
    return { sent: false, method: 'email' };
  }
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<{ sent: boolean; method: 'email' | 'console' }> {
  const resetUrl = `${config.DASHBOARD_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const client = getClient();

  if (!client) {
    logger.warn('RESEND_API_KEY not set — logging reset link instead', { to, resetUrl });
    console.log(`\n🔑 Password reset for ${to}:\n   ${resetUrl}\n`);
    return { sent: true, method: 'console' };
  }

  try {
    await client.emails.send({
      from: config.RESEND_FROM_EMAIL,
      to,
      subject: 'Reset your PagePilot password',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:#22c55e;border-radius:10px;margin-bottom:12px;">
              <span style="color:#fff;font-weight:800;font-size:14px;">PP</span>
            </div>
            <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0;">Password Reset</h1>
          </div>
          <p style="font-size:15px;color:#334155;line-height:1.6;">Hi ${name},</p>
          <p style="font-size:15px;color:#334155;line-height:1.6;">We received a request to reset your password. Click the button below to choose a new one.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">
              Reset password
            </a>
          </div>
          <p style="font-size:13px;color:#94a3b8;line-height:1.5;">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="font-size:12px;color:#94a3b8;">Or copy this link: <a href="${resetUrl}" style="color:#22c55e;">${resetUrl}</a></p>
        </div>
      `,
    });
    logger.info('Password reset email sent', { to });
    return { sent: true, method: 'email' };
  } catch (err) {
    logger.error('Failed to send reset email', { to, error: (err as Error).message });
    return { sent: false, method: 'email' };
  }
}
