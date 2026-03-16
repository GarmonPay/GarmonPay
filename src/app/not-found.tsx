import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0e17] text-[#f9fafb]">
      <h1 className="text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-[#9ca3af] mb-6">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link
        href="/"
        className="inline-block px-6 py-3 rounded-lg bg-[#2563eb] text-white font-medium hover:opacity-90 no-underline"
      >
        Back to home
      </Link>
    </main>
  );
}
