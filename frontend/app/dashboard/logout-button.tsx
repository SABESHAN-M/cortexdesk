"use client";

export default function LogoutButton() {
  return (
    <button
      id="sign-out-btn"
      type="button"
      disabled
      title="Sign-out will be available after authentication is implemented."
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-400 opacity-60 transition-colors dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-500"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
        />
      </svg>
      Sign out
    </button>
  );
}
