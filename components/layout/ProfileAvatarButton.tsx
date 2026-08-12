'use client';

type ProfileAvatarButtonProps = {
  firstName: string;
  lastName: string;
  onClick: () => void;
  ariaLabel?: string;
};

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function ProfileAvatarButton({
  firstName,
  lastName,
  onClick,
  ariaLabel = 'Account settings',
}: ProfileAvatarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-peach text-sm font-bold text-espresso ring-1 ring-espresso/10 transition hover:bg-peach-light hover:ring-espresso/25 focus:outline-none focus:ring-2 focus:ring-espresso focus:ring-offset-2 focus:ring-offset-cream"
    >
      {getInitials(firstName, lastName)}
    </button>
  );
}
