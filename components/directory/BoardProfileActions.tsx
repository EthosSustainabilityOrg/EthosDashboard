'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Badge } from '@/types/badges';
import type { OrgRoleId } from '@/types/auth';
import { AwardBadgeSheet } from '@/components/lead/badges/AwardBadgeSheet';
import { ChangeRoleSheet } from '@/components/board/ChangeRoleSheet';
import { Button } from '@/components/ui/Button';

type BoardProfileMember = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_id: OrgRoleId;
  org_role_name: string;
  chapter_id: string;
  chapter_name: string;
};

type BoardProfileActionsProps = {
  isBoard: boolean;
  member: BoardProfileMember;
  achievementBadges: Badge[];
};

export function BoardProfileActions({
  isBoard,
  member,
  achievementBadges,
}: BoardProfileActionsProps) {
  const router = useRouter();
  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [awardBadgeOpen, setAwardBadgeOpen] = useState(false);

  if (!isBoard) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button variant="ghost" size="sm" onClick={() => setChangeRoleOpen(true)}>
        Change Role
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setAwardBadgeOpen(true)}
        disabled={achievementBadges.length === 0}
      >
        Award Achievement Badge
      </Button>

      {changeRoleOpen ? (
        <ChangeRoleSheet
          member={member}
          onClose={() => setChangeRoleOpen(false)}
          onRoleChanged={() => {
            setChangeRoleOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {awardBadgeOpen ? (
        <AwardBadgeSheet
          volunteer={member}
          badgeFilter="Achievement"
          onClose={() => setAwardBadgeOpen(false)}
          onAwarded={() => setAwardBadgeOpen(false)}
        />
      ) : null}
    </div>
  );
}
