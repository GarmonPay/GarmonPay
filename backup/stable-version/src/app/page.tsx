export default function HomePage() {

  return (

    <div className="min-h-screen flex items-center justify-center bg-black text-white">

      <div className="text-center">

        <h1 className="text-5xl font-bold mb-4">
          GarmonPay
        </h1>

        <p className="text-xl text-gray-400 mb-6">
          Get Seen. Get Known. Get Paid.
        </p>

        <div className="flex gap-4 justify-center">

          <a href="/login">
            <button type="button" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition">
              Login
            </button>
          </a>


          <a href="/register">
            <button type="button" className="border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white font-semibold px-6 py-3 rounded-lg transition">
              Register
            </button>
          </a>

        </div>

      </div>

    </div>

  )

}
