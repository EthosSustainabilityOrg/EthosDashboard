/**
 * lib/onboarding.ts
 * Shared onboarding-completion logic.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';

type LogIntegration = 'Supabase' | 'OpenSign' | 'Slack' | 'Resend' | 'GoogleDrive';

/**
 * Unlocks the app for a member once both halves of the gate are satisfied:
 * the onboarding record is complete (waiver, parental consent, orientation) and
 * an application has been approved.
 *
 * The two halves can land in either order — a lead can approve before the guardian
 * signs, or the guardian can sign before a lead reviews — so this is called from the
 * approve route and from every path that can set onboarding.completed_at. It re-reads
 * completed_at itself, so callers do not need to know which half they just satisfied,
 * and it is a no-op when either half is still outstanding.
 *
 * All members are minors: onboarding.completed_at is the record that parental consent
 * was signed, so it is never bypassed here.
 */
export async function unlockOnboardingIfApproved(
  userId: string,
  integration: LogIntegration
): Promise<void> {
  const { data: onboarding } = await supabaseAdmin
    .from('onboarding')
    .select('completed_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!onboarding?.completed_at) return;

  // A member may hold several approved applications (max 3 active projects),
  // so limit before maybeSingle — any one approval is enough to unlock.
  const { data: approvedApp } = await supabaseAdmin
    .from('applications')
    .select('application_id')
    .eq('user_id', userId)
    .eq('status', 'Approved')
    .limit(1)
    .maybeSingle();

  if (!approvedApp) return;

  const { error: unlockError } = await supabaseAdmin
    .from('users')
    .update({ onboarding_complete: true })
    .eq('user_id', userId);

  if (unlockError) {
    await supabaseAdmin.from('system_logs').insert({
      integration,
      error_type: 'Onboarding Unlock Failed',
      error_message: `Onboarding complete and application ${approvedApp.application_id} approved, but failed to set onboarding_complete: ${unlockError.message}`,
      affected_user_id: userId,
      resolved: false
    });
  }
}
