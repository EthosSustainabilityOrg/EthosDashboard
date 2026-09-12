/**
 * lib/notifications.ts
 * Notification delivery.
 *
 * Every call site that used to insert a single InApp row should call
 * deliverNotification() instead. It writes the in-app row exactly as before and
 * additionally attempts email and Slack delivery, honouring the per-user, per-event
 * toggles in notification_preferences.
 *
 * One row is written per channel actually attempted, which is what the notifications
 * table is for: it is both the in-app inbox and the delivery audit log. The in-app row
 * is always written first and is never blocked by an external send failing.
 *
 * Delivery is best-effort and must never fail the request that triggered it. Callers
 * fire this without awaiting (`void deliverNotification(...)`), matching the existing
 * `void supabaseAdmin.from('notifications').insert(...)` pattern.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/resend';
import { sendDirectMessage } from '@/lib/slack';

export type NotificationEventType =
  | 'Application Received'
  | 'Application Approved'
  | 'Application Rejected'
  | 'Task Assigned'
  | 'Task Updated'
  | 'Onboarding Step'
  | 'Badge Awarded'
  | 'Role Changed'
  | 'Announcement'
  | 'Parental Consent Reminder'
  | 'General';

type PreferenceColumns = {
  email: string;
  slack: string;
};

/**
 * Maps an event type to its notification_preferences columns.
 *
 * 'Onboarding Step', 'Parental Consent Reminder' and 'General' have no toggle columns
 * in migration 020. That is deliberate: onboarding and parental-consent messages are
 * compliance traffic on a platform where every member is a minor, so they are not
 * opt-out. They are treated as always-on for email.
 */
const PREFERENCE_COLUMNS: Partial<Record<NotificationEventType, PreferenceColumns>> = {
  'Application Received': { email: 'application_received_email', slack: 'application_received_slack' },
  'Application Approved': { email: 'application_approved_email', slack: 'application_approved_slack' },
  'Application Rejected': { email: 'application_rejected_email', slack: 'application_rejected_slack' },
  'Task Assigned': { email: 'task_assigned_email', slack: 'task_assigned_slack' },
  'Task Updated': { email: 'task_updated_email', slack: 'task_updated_slack' },
  'Badge Awarded': { email: 'badge_awarded_email', slack: 'badge_awarded_slack' },
  'Role Changed': { email: 'role_changed_email', slack: 'role_changed_slack' },
  Announcement: { email: 'announcement_email', slack: 'announcement_slack' },
};

type RecipientRow = {
  active_login_email: string | null;
  personal_email: string | null;
  guardian_email: string | null;
  slack_user_id: string | null;
};

type PreferenceRow = Record<string, boolean | string | null>;

export type DeliverNotificationInput = {
  userId: string;
  eventType: NotificationEventType;
  subject: string;
  body: string;
};

async function logFailure(
  integration: 'Resend' | 'Slack',
  userId: string,
  eventType: NotificationEventType,
  message: string,
): Promise<void> {
  await supabaseAdmin.from('system_logs').insert({
    integration,
    error_type: 'Notification Delivery Failed',
    error_message: `${eventType}: ${message}`,
    affected_user_id: userId,
    resolved: false,
  });
}

/**
 * Writes the in-app notification and attempts email/Slack delivery.
 *
 * Never throws. Every external failure is recorded as a Failed notification row plus a
 * system_logs entry, so a Board member can see what did not go out.
 */
export async function deliverNotification({
  userId,
  eventType,
  subject,
  body,
}: DeliverNotificationInput): Promise<void> {
  try {
    // 1. In-app row always, first, regardless of external delivery.
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      channel: 'InApp',
      event_type: eventType,
      subject,
      body,
      is_read: false,
      status: 'Sent',
    });

    const { data: recipient } = await supabaseAdmin
      .from('users')
      .select('active_login_email, personal_email, guardian_email, slack_user_id')
      .eq('user_id', userId)
      .maybeSingle<RecipientRow>();

    if (!recipient) return;

    const columns = PREFERENCE_COLUMNS[eventType];

    let emailAllowed = true;
    let slackAllowed = true;

    if (columns) {
      const { data: prefs } = await supabaseAdmin
        .from('notification_preferences')
        .select(`${columns.email}, ${columns.slack}`)
        .eq('user_id', userId)
        .maybeSingle<PreferenceRow>();

      // No preferences row yet means defaults, and every toggle defaults to true
      // in migration 020.
      emailAllowed = prefs ? prefs[columns.email] !== false : true;
      slackAllowed = prefs ? prefs[columns.slack] !== false : true;
    } else {
      // Compliance traffic: email only, never a Slack DM, and not opt-out.
      slackAllowed = false;
    }

    // Parental consent is addressed to the guardian, not the minor.
    const emailTarget =
      eventType === 'Parental Consent Reminder'
        ? recipient.guardian_email
        : recipient.active_login_email ?? recipient.personal_email;

    await Promise.all([
      emailAllowed && emailTarget
        ? deliverEmail(userId, eventType, subject, body, emailTarget)
        : Promise.resolve(),
      slackAllowed && recipient.slack_user_id
        ? deliverSlack(userId, eventType, subject, body, recipient.slack_user_id)
        : Promise.resolve(),
    ]);
  } catch (error) {
    // Delivery must never surface to the caller's request.
    const message = error instanceof Error ? error.message : 'Unknown delivery error';
    await logFailure('Resend', userId, eventType, message).catch(() => undefined);
  }
}

async function deliverEmail(
  userId: string,
  eventType: NotificationEventType,
  subject: string,
  body: string,
  to: string,
): Promise<void> {
  // No key configured yet (see the manual setup checklist). Record the intent as Failed
  // rather than silently dropping it, so the gap is visible in the Board's system logs.
  if (!process.env.RESEND_API_KEY) {
    await recordChannelRow(userId, eventType, subject, body, 'Email', to, null, 'Failed');
    await logFailure('Resend', userId, eventType, 'RESEND_API_KEY is not configured');
    return;
  }

  try {
    await sendEmail(to, subject, body);
    await recordChannelRow(userId, eventType, subject, body, 'Email', to, null, 'Sent');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Resend error';
    await recordChannelRow(userId, eventType, subject, body, 'Email', to, null, 'Failed');
    await logFailure('Resend', userId, eventType, message);
  }
}

async function deliverSlack(
  userId: string,
  eventType: NotificationEventType,
  subject: string,
  body: string,
  slackUserId: string,
): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    await recordChannelRow(userId, eventType, subject, body, 'Slack', null, slackUserId, 'Failed');
    await logFailure('Slack', userId, eventType, 'SLACK_BOT_TOKEN is not configured');
    return;
  }

  try {
    await sendDirectMessage(slackUserId, `*${subject}*\n${body}`);
    await recordChannelRow(userId, eventType, subject, body, 'Slack', null, slackUserId, 'Sent');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Slack error';
    await recordChannelRow(userId, eventType, subject, body, 'Slack', null, slackUserId, 'Failed');
    await logFailure('Slack', userId, eventType, message);
  }
}

async function recordChannelRow(
  userId: string,
  eventType: NotificationEventType,
  subject: string,
  body: string,
  channel: 'Email' | 'Slack',
  sentToEmail: string | null,
  sentToSlackUserId: string | null,
  status: 'Sent' | 'Failed',
): Promise<void> {
  await supabaseAdmin.from('notifications').insert({
    user_id: userId,
    sent_to_email: sentToEmail,
    sent_to_slack_user_id: sentToSlackUserId,
    channel,
    event_type: eventType,
    subject,
    body,
    // Channel rows are the delivery audit trail, not inbox entries. They are marked
    // read so they never inflate the bell count; notifications_select_own still lets
    // the user see them and Board sees all.
    is_read: true,
    read_at: new Date().toISOString(),
    status,
  });
}
