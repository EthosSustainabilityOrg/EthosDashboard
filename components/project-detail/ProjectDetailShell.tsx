'use client';

import { useEffect, useMemo, useState } from 'react';
import type { File } from '@/types/files';
import type { Project } from '@/types/projects';
import type { ProjectUpdate } from '@/types/project-updates';
import type { Shift } from '@/types/shifts';
import type { Task } from '@/types/tasks';
import { AddFileSheet } from '@/components/project-detail/AddFileSheet';
import { FlagVolunteerSheet } from '@/components/project-detail/FlagVolunteerSheet';
import { LeadOverviewActions } from '@/components/project-detail/LeadOverviewActions';
import { LeadTaskActions } from '@/components/project-detail/LeadTaskActions';
import { NewTaskSheet } from '@/components/project-detail/NewTaskSheet';
import { ProjectHeader } from '@/components/project-detail/ProjectHeader';
import { OverviewTab } from '@/components/project-detail/OverviewTab';
import { ProjectFilesTab } from '@/components/project-detail/ProjectFilesTab';
import { ProjectTasksTab } from '@/components/project-detail/ProjectTasksTab';
import { ProjectUpdatesTab } from '@/components/project-detail/ProjectUpdatesTab';
import { Button } from '@/components/ui/Button';

export type ProjectDetailTab = 'overview' | 'tasks' | 'files' | 'updates';

type ProjectRoleInfo = {
  project_role_id: string;
  role_name: string;
  description: string | null;
  capacity: number;
};

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

type ProjectFile = Pick<
  File,
  'file_id' | 'file_name' | 'file_type' | 'drive_url' | 'description' | 'created_at'
>;

type ProjectFileListItem = File & {
  project_name: string | null;
  added_by_name: string;
};

type ProjectTask = Task & {
  project_name: string;
  assignee_name: string;
  created_by_name?: string;
};

type ProjectDetail = Project & {
  type_name: string;
  chapter_name: string;
  is_hq?: boolean;
  spots_remaining: number | null;
  shifts: Shift[];
  project_roles: ProjectRoleInfo[];
  team: TeamMember[];
  files: ProjectFile[];
};

type ProjectDetailShellProps = {
  project: ProjectDetail;
  tasks: ProjectTask[];
  files: ProjectFileListItem[];
  updates: ProjectUpdate[];
  isLead: boolean;
  isBoard: boolean;
  isMember: boolean;
  currentUserId: string;
  pendingCount: number;
  tabCounts?: {
    tasks: number;
  };
};

function isProjectDetailTab(value: string | null): value is ProjectDetailTab {
  return value === 'overview' || value === 'tasks' || value === 'files' || value === 'updates';
}

function toProjectFileListItem(file: File): ProjectFileListItem {
  return {
    ...file,
    project_name: null,
    added_by_name: 'You',
  };
}

export function ProjectDetailShell({
  project,
  tasks,
  files,
  updates,
  isLead,
  isBoard,
  isMember,
  currentUserId,
  pendingCount,
  tabCounts,
}: ProjectDetailShellProps) {
  const storageKey = `project-tab-${project.project_id}`;
  const canManageProject = isLead || isBoard;
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>('overview');
  const [localTasks, setLocalTasks] = useState<ProjectTask[]>(tasks);
  const [localFiles, setLocalFiles] = useState<ProjectFileListItem[]>(files);
  const [newTaskSheetOpen, setNewTaskSheetOpen] = useState(false);
  const [addFileSheetOpen, setAddFileSheetOpen] = useState(false);
  const [flagVolunteer, setFlagVolunteer] = useState<FlagVolunteer | null>(null);

  useEffect(() => {
    const savedTab = window.sessionStorage.getItem(storageKey);
    if (isProjectDetailTab(savedTab)) {
      setActiveTab(savedTab);
    }
  }, [storageKey]);

  useEffect(() => {
    window.sessionStorage.setItem(storageKey, activeTab);
  }, [activeTab, storageKey]);

  const counts = useMemo(
    () => ({
      tasks: tabCounts?.tasks ?? localTasks.length,
    }),
    [localTasks.length, tabCounts],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <ProjectHeader
        project={project}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        taskCount={counts.tasks}
        isLead={isLead}
        isBoard={isBoard}
      />

      <div className="mt-8">
        {activeTab === 'overview' ? (
          <>
            {canManageProject ? (
              <LeadOverviewActions
                projectId={project.project_id}
                pendingCount={pendingCount}
                project={project}
                shifts={project.shifts}
                teamMembers={project.team}
                onFlagVolunteer={setFlagVolunteer}
              />
            ) : null}
            <OverviewTab
              project={project}
              shifts={project.shifts}
              team={project.team}
              isLead={isLead}
              isBoard={isBoard}
              onFlagVolunteer={canManageProject ? setFlagVolunteer : undefined}
            />
          </>
        ) : null}

        {activeTab === 'tasks' ? (
          <ProjectTasksTab
            tasks={localTasks}
            currentUserId={currentUserId}
            isLead={isLead}
            isBoard={isBoard}
            actions={
              canManageProject ? <LeadTaskActions onNewTask={() => setNewTaskSheetOpen(true)} /> : null
            }
          />
        ) : null}

        {activeTab === 'files' ? (
          <ProjectFilesTab
            files={localFiles}
            actions={
              canManageProject ? (
                <Button variant="primary" size="sm" onClick={() => setAddFileSheetOpen(true)}>
                  Add File
                </Button>
              ) : null
            }
          />
        ) : null}

        {activeTab === 'updates' ? (
          <ProjectUpdatesTab updates={updates} slackChannelId={project.slack_channel_id} />
        ) : null}
      </div>

      {newTaskSheetOpen ? (
        <NewTaskSheet
          projectId={project.project_id}
          projectRoles={project.project_roles}
          teamMembers={project.team}
          onClose={() => setNewTaskSheetOpen(false)}
          onCreated={(task) =>
            setLocalTasks((current) => {
              const assignee = project.team.find((member) => member.user_id === task.assigned_to);
              return [
                {
                  ...task,
                  project_name: project.name,
                  assignee_name: assignee ? `${assignee.first_name} ${assignee.last_name}` : 'Unassigned',
                },
                ...current,
              ];
            })
          }
        />
      ) : null}

      {addFileSheetOpen ? (
        <AddFileSheet
          projectId={project.project_id}
          onClose={() => setAddFileSheetOpen(false)}
          onAdded={(file) => setLocalFiles((current) => [toProjectFileListItem(file), ...current])}
        />
      ) : null}

      {flagVolunteer ? (
        <FlagVolunteerSheet
          projectId={project.project_id}
          shifts={project.shifts}
          volunteer={flagVolunteer}
          onClose={() => setFlagVolunteer(null)}
          onFlagged={() => setFlagVolunteer(null)}
        />
      ) : null}
    </div>
  );
}
