export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b1727] to-[#020617] text-white flex flex-col items-center justify-center">

      <h1 className="text-5xl font-bold mb-4">
        GarmonPay
      </h1>

      <p className="text-xl text-blue-400 mb-8">
        Get Seen. Get Known. Get Paid.
      </p>

      <div className="flex gap-4">

        <a
          href="/login"
          className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold"
        >
          Login
        </a>

        <a
          href="/register"
          className="bg-gray-700 hover:bg-gray-800 px-6 py-3 rounded-lg font-semibold"
        >
          Register
        </a>

      </div>

      <a
        href="/wallet"
        className="mt-6 text-blue-400 underline"
      >
        Go to Wallet
      </a>

    </main>
  )
}
