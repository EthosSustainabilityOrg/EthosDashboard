export default function OnboardingLoading() {
  return (
    <div
      className="flex h-full min-h-[60vh] items-center justify-center bg-cream"
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-3 text-sm text-warm-gray">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-sand border-t-brown-mid"
        />
        Loading…
      </span>
    </div>
  );
}
