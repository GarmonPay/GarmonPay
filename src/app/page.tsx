import Link from "next/link";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-fintech-bg">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="text-center w-full max-w-md">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
            GarmonPay
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 mb-8">
            Get Seen. Get Known. Get Paid.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/login"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition min-w-[120px]"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="inline-block border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white font-semibold px-6 py-3 rounded-lg transition min-w-[120px]"
            >
              Register
            </Link>
          </div>
          <p className="mt-8">
            <Link
              href="/wallet"
              className="text-gray-400 hover:text-white underline text-sm"
            >
              Go to Wallet
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
