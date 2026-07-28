import type { Project } from '@/types/projects';
import type { Shift } from '@/types/shifts';
import { ShiftCard } from '@/components/project-detail/ShiftCard';
import { TeamRoster } from '@/components/project-detail/TeamRoster';

type TeamMember = {
  user_id: string;
  first_name: string;
  last_name: string;
  project_role_name: string | null;
  is_lead: boolean;
};

type FlagVolunteer = {
  user_id: string;
  first_name: string;
  last_name: string;
};

type OverviewProject = Project & {
  chapter_name: string;
  type_name: string;
};

type OverviewTabProps = {
  project: OverviewProject;
  shifts: Shift[];
  team: TeamMember[];
  isLead: boolean;
  isBoard: boolean;
  onFlagVolunteer?: (volunteer: FlagVolunteer) => void;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function OverviewTab({
  project,
  shifts,
  team,
  isLead,
  isBoard,
  onFlagVolunteer,
}: OverviewTabProps) {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-sand bg-cream p-5">
        <h2 className="mb-4 text-lg font-semibold text-espresso">Project Info</h2>

        <p className="leading-relaxed text-espresso">{project.description}</p>

        <div className="mt-5 space-y-2 text-sm text-warm-gray">
          <p>{project.is_virtual ? 'Virtual project' : 'In-person project'}</p>
          {!project.is_virtual && project.location ? <p>{project.location}</p> : null}

          {project.allocated_budget !== null ? (
            <p className="font-semibold text-brown-mid">
              {isLead || isBoard
                ? `${formatMoney(project.requested_budget ?? 0)} requested · ${formatMoney(project.allocated_budget)} allocated`
                : `Budget: ${formatMoney(project.allocated_budget)} allocated`}
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-espresso">Shifts</h2>
        {shifts.length > 0 ? (
          <div className="space-y-3">
            {shifts.map((shift) => (
              <ShiftCard key={shift.shift_id} shift={shift} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-warm-gray">No shifts scheduled yet</p>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-espresso">Team</h2>
          <p className="text-sm text-warm-gray">{team.length} members</p>
        </div>
        <TeamRoster
          team={team}
          isLead={isLead || isBoard}
          onFlagVolunteer={onFlagVolunteer}
        />
      </section>
    </div>
  );
}
