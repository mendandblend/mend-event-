import { formatWorkshopDate } from "../../booking/api.js";

export default function ScanFeedbackCard({ scanResult, onDismiss }) {
  if (!scanResult) return null;

  const isValid = scanResult.status === "valid";
  const isAlreadyUsed = scanResult.status === "already_used";
  const isInvalid = !isValid && !isAlreadyUsed;

  const containerStyle = isValid
    ? "border-emerald-500/35 bg-emerald-50/70 text-charcoal dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-[#E8ECEF]"
    : isAlreadyUsed
      ? "border-amber-500/35 bg-amber-50/70 text-charcoal dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-[#F4E6C5]"
      : "border-rose-500/35 bg-rose-50/70 text-charcoal dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-[#F09E88]";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative mt-5 flex items-start gap-3.5 rounded-2xl border p-4 sm:p-5 shadow-xs transition-all ${containerStyle}`}
    >
      {isValid && (
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <svg className="relative h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}

      {isAlreadyUsed && (
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
      )}

      {isInvalid && (
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-xs">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-30" />
          <svg className="relative h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm sm:text-base font-semibold leading-tight">
            {isValid
              ? "Valid ticket · Scanned successfully"
              : isAlreadyUsed
                ? "Already scanned"
                : "Invalid ticket"}
          </p>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-charcoal/50 hover:text-charcoal dark:text-brand-ivory/50 dark:hover:text-brand-ivory"
              aria-label="Dismiss scan result"
            >
              ✕
            </button>
          )}
        </div>

        <p className="mt-1 text-xs sm:text-sm leading-relaxed text-charcoal/85 dark:text-brand-ivory/80">
          {scanResult.message}
        </p>

        {scanResult.customerName && (
          <p className="mt-2 text-xs sm:text-sm font-medium">
            Attendee: <strong className="font-semibold">{scanResult.customerName}</strong>
            {scanResult.workshopName ? ` · ${scanResult.workshopName}` : ""}
            {scanResult.seats && scanResult.seats > 1 ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-brand-blue/15 px-2 py-0.5 text-xs font-bold text-brand-blue dark:bg-[#96B7DA]/25 dark:text-[#96B7DA]">
                {scanResult.seats} seats
              </span>
            ) : null}
          </p>
        )}

        {scanResult.sessionDate && (
          <p className="mt-0.5 text-xs text-charcoal/70 dark:text-brand-ivory/70">
            Session: {formatWorkshopDate(scanResult.sessionDate)}
            {scanResult.start ? ` · ${scanResult.start}–${scanResult.end}` : ""}
          </p>
        )}

        {scanResult.redeemedAt && (
          <p className="mt-1.5 text-[11px] font-medium opacity-90">
            {isValid ? "Check-in recorded: " : "First scanned: "}
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(scanResult.redeemedAt))}
          </p>
        )}
      </div>
    </div>
  );
}
