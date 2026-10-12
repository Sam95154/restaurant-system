import React from 'react';

type SubscriptionAgreementsProps = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  onTermsAcceptedChange: (accepted: boolean) => void;
  onPrivacyAcceptedChange: (accepted: boolean) => void;
  termsUrl?: string;
  privacyUrl?: string;
  ownerFullName?: string;
  confirmedFullName: string;
  onConfirmedFullNameChange: (name: string) => void;
};

/**
 * Accessible agreement checkboxes for the subscription signup flow.
 * Keep both agreements unchecked by default in the parent component.
 * Payment should remain disabled until both agreements are accepted and
 * confirmedFullName matches ownerFullName (trimmed, case-insensitive).
 */
export default function SubscriptionAgreements({
  termsAccepted,
  privacyAccepted,
  onTermsAcceptedChange,
  onPrivacyAcceptedChange,
  termsUrl = '/subscription-terms',
  privacyUrl = '/privacy-policy',
  ownerFullName = '',
  confirmedFullName,
  onConfirmedFullNameChange,
}: SubscriptionAgreementsProps) {
  const nameMatches =
    ownerFullName.trim().length > 0 &&
    confirmedFullName.trim().toLocaleLowerCase() ===
      ownerFullName.trim().toLocaleLowerCase();

  const CheckboxRow = ({
    id,
    checked,
    onChange,
    children,
  }: {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    children: React.ReactNode;
  }) => (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-left text-base leading-7 text-[#17352a]">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#16803d] ${checked ? 'border-[#16803d] bg-[#16803d] text-white' : 'border-[#aab7b0] bg-white text-transparent'}`}
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" role="presentation">
          <path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );

  return (
    <section
      aria-labelledby="subscription-agreements-title"
      className="w-full rounded-3xl border border-[#d9dedb] bg-[#f8f9fb] p-5 sm:p-8"
    >
      <h2 id="subscription-agreements-title" className="text-2xl font-bold tracking-tight text-[#102d22] sm:text-3xl">
        Subscription agreements
      </h2>
      <p className="mt-4 text-base leading-7 text-[#68717c] sm:text-lg">
        Please open and read both documents. Payment is available only after you accept both and confirm your name.
      </p>

      <div className="mt-6 space-y-5">
        <CheckboxRow
          id="accept-subscription-terms"
          checked={termsAccepted}
          onChange={onTermsAcceptedChange}
        >
          I have read and agree to the{' '}
          <a
            href={termsUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline decoration-[#16803d] underline-offset-4 hover:text-[#16803d]"
          >
            Subscription Terms and Conditions
          </a>.
        </CheckboxRow>

        <CheckboxRow
          id="accept-privacy-policy"
          checked={privacyAccepted}
          onChange={onPrivacyAcceptedChange}
        >
          I have read and acknowledge the{' '}
          <a
            href={privacyUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline decoration-[#16803d] underline-offset-4 hover:text-[#16803d]"
          >
            Privacy Policy
          </a>.
        </CheckboxRow>
      </div>

      <div className="mt-7">
        <label htmlFor="confirm-owner-name" className="mb-2 block text-base font-semibold text-[#17352a]">
          Type your full name to confirm
        </label>
        <input
          id="confirm-owner-name"
          type="text"
          autoComplete="name"
          value={confirmedFullName}
          onChange={(event) => onConfirmedFullNameChange(event.target.value)}
          placeholder="Enter the same name as Owner full name"
          className="w-full min-w-0 rounded-2xl border border-[#d9dedb] bg-white px-4 py-4 text-base text-[#17352a] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#16803d] focus:ring-2 focus:ring-[#16803d]/15"
        />
        {confirmedFullName.trim().length > 0 && !nameMatches && (
          <p className="mt-2 text-sm text-[#b42318]" role="status">
            Enter the same full name as the owner.
          </p>
        )}
        {nameMatches && (
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-[#16803d]" role="status">
            <span aria-hidden="true">✓</span> Name confirmed
          </p>
        )}
      </div>

      <p className="mt-4 text-sm leading-6 text-[#7b838c]">
        Your name and acceptance choices will be submitted with this subscription application.
      </p>
    </section>
  );
}
