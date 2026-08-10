import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { File } from '@/types/files';
import type { Onboarding, OrientationProgress } from '@/types/onboarding';
import {
  PolicyDocumentList,
  type PolicyDocument,
} from '@/components/training/PolicyDocumentList';
import { TrainingOrientation } from '@/components/training/TrainingOrientation';

const emptyProgress: OrientationProgress = {
  welcome: false,
  safety: false,
  how_we_work: false,
  faqs: false,
};

type PolicyAcknowledgmentItem = {
  file_id: string;
  file_name: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
};

type PolicyAcknowledgmentsResponse = {
  acknowledgments: PolicyAcknowledgmentItem[];
};

type FileListItem = File & {
  project_name: string | null;
  added_by_name: string;
};

type FilesResponse = {
  files: FileListItem[];
  total: number;
  page: number;
  per_page: number;
};

export default async function TrainingPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          return;
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const host = headerStore.get('host');

  if (!host) {
    redirect('/home');
  }

  const headersWithAuth = {
    Authorization: `Bearer ${session.access_token}`,
  };

  const { data: viewerData } = await supabase
    .from('users')
    .select('org_role_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const isBoard = viewerData?.org_role_id === 3;

  const [onboardingResponse, acknowledgmentsResponse, filesResponse] = await Promise.all([
    fetch(`${protocol}://${host}/api/onboarding/me`, {
      headers: headersWithAuth,
      cache: 'no-store',
    }),
    fetch(`${protocol}://${host}/api/policy-acknowledgments/me`, {
      headers: headersWithAuth,
      cache: 'no-store',
    }),
    fetch(`${protocol}://${host}/api/files?per_page=100`, {
      headers: headersWithAuth,
      cache: 'no-store',
    }),
  ]);

  const onboardingBody = (await onboardingResponse.json()) as ApiResponse<Onboarding>;
  const acknowledgmentsBody =
    (await acknowledgmentsResponse.json()) as ApiResponse<PolicyAcknowledgmentsResponse>;
  const filesBody = (await filesResponse.json()) as ApiResponse<FilesResponse>;

  const acknowledgments = acknowledgmentsBody.data?.acknowledgments ?? [];
  const policyFiles = (filesBody.data?.files ?? []).filter((file) => file.is_policy);

  const filesById = new Map(policyFiles.map((file) => [file.file_id, file]));
  const documents: PolicyDocument[] = acknowledgments.map((acknowledgment) => {
    const file = filesById.get(acknowledgment.file_id);

    return {
      file_id: acknowledgment.file_id,
      file_name: acknowledgment.file_name,
      drive_url: file?.drive_url ?? '#',
      acknowledged: acknowledgment.acknowledged,
      acknowledged_at: acknowledgment.acknowledged_at,
    };
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-espresso">Training</h1>
      </header>

      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-espresso">Orientation Videos</h2>
        </div>
        <TrainingOrientation initialProgress={onboardingBody.data?.orientation_progress ?? emptyProgress} />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-espresso">Policy Documents</h2>
        </div>
        <PolicyDocumentList documents={documents} isBoard={isBoard} />
      </section>
    </div>
  );
}
