"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0e17] text-[#f9fafb]">
      <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
      <p className="text-[#9ca3af] mb-6">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="px-6 py-3 rounded-lg bg-[#2563eb] text-white font-medium hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
