import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticate } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { NotificationPreferences } from '@/types/notification-preferences';

type PreferenceField = Exclude<keyof NotificationPreferences, 'preference_id' | 'user_id' | 'updated_at'>;
type PreferencePatch = Partial<Record<PreferenceField, boolean>>;

const PREFERENCE_PAIRS: ReadonlyArray<readonly [PreferenceField, PreferenceField]> = [
  ['application_received_email', 'application_received_slack'],
  ['application_approved_email', 'application_approved_slack'],
  ['application_rejected_email', 'application_rejected_slack'],
  ['task_assigned_email', 'task_assigned_slack'],
  ['task_updated_email', 'task_updated_slack'],
  ['badge_awarded_email', 'badge_awarded_slack'],
  ['role_changed_email', 'role_changed_slack'],
  ['announcement_email', 'announcement_slack'],
];

const PREFERENCE_FIELDS = PREFERENCE_PAIRS.flat();

function isPreferenceField(value: string): value is PreferenceField {
  return PREFERENCE_FIELDS.includes(value as PreferenceField);
}

function parsePreferencePatch(value: unknown): PreferencePatch | null {
  if (!value || typeof value !== 'object') return null;

  const patch: PreferencePatch = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!isPreferenceField(key) || typeof fieldValue !== 'boolean') return null;
    patch[key] = fieldValue;
  }

  return patch;
}

function preferencesAreValid(preferences: NotificationPreferences): boolean {
  return PREFERENCE_PAIRS.every(([emailField, slackField]) => preferences[emailField] || preferences[slackField]);
}

async function getPreferences(userId: string): Promise<NotificationPreferences | null> {
  const { data } = await supabaseAdmin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<NotificationPreferences>();

  return data;
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<NotificationPreferences>>> {
  const auth = await authenticate(req);
  const userId = auth?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  }

  const preferences = await getPreferences(userId);
  if (!preferences) {
    return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Notification preferences not found' } }, { status: 404 });
  }

  return NextResponse.json({ data: preferences, error: null });
}

export async function PATCH(req: NextRequest): Promise<NextResponse<ApiResponse<NotificationPreferences>>> {
  const auth = await authenticate(req);
  const userId = auth?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  }

  const rawBody: unknown = await req.json().catch(() => null);
  const patch = parsePreferencePatch(rawBody);

  if (!patch) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid notification preference update' } }, { status: 400 });
  }

  const currentPreferences = await getPreferences(userId);
  if (!currentPreferences) {
    return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Notification preferences not found' } }, { status: 404 });
  }

  const mergedPreferences: NotificationPreferences = { ...currentPreferences, ...patch };

  if (!preferencesAreValid(mergedPreferences)) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Email and Slack cannot both be disabled for an event type' } },
      { status: 400 }
    );
  }

  const { data: updatedPreferences, error } = await supabaseAdmin
    .from('notification_preferences')
    .update(patch)
    .eq('user_id', userId)
    .select()
    .single<NotificationPreferences>();

  if (error || !updatedPreferences) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: error?.message || 'Failed to update notification preferences' } },
      { status: 400 }
    );
  }

  return NextResponse.json({ data: updatedPreferences, error: null });
}
