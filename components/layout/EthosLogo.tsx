import Image from 'next/image';

type EthosLogoProps = {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md';
};

export function EthosLogo({ variant = 'dark', size = 'md' }: EthosLogoProps) {
  const variantClasses =
    variant === 'dark'
      ? 'bg-espresso text-cream'
      : 'bg-cream text-espresso';

  const markSize = size === 'sm' ? 24 : 32;
  const markClasses = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const wordmarkClasses = size === 'sm' ? 'text-sm' : 'text-base';
  const descriptorClasses = size === 'sm' ? 'text-[7px]' : 'text-[9px]';

  return (
    <div className={`inline-flex items-center gap-2 ${variantClasses}`}>
      <Image
        src="/ethos-logo-insignia.png"
        alt=""
        width={markSize}
        height={markSize}
        className={`${markClasses} shrink-0 object-contain`}
        aria-hidden="true"
        priority
      />
      <div className="flex flex-col leading-none">
        <span className={`${wordmarkClasses} font-bold lowercase`}>ethos</span>
        <span className={`${descriptorClasses} font-semibold uppercase tracking-widest`}>
          Sustainability
        </span>
      </div>
    </div>
  );
}
