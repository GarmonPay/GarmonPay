import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-black text-white py-6 px-4 sm:px-6 mt-auto">
      <div className="max-w-[800px] mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <Link href="/terms" className="text-gray-300 hover:text-white underline underline-offset-2">
          Terms
        </Link>
        <Link href="/privacy" className="text-gray-300 hover:text-white underline underline-offset-2">
          Privacy
        </Link>
        <Link href="/disclaimer" className="text-gray-300 hover:text-white underline underline-offset-2">
          Disclaimer
        </Link>
      </div>
      <p className="max-w-[800px] mx-auto mt-4 text-center text-gray-500 text-xs">
        © {new Date().getFullYear()} GarmonPay. All rights reserved.
      </p>
    </footer>
  );
}
