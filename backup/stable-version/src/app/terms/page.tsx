export default function TermsPage() {

  return (

    <div className="flex items-center justify-center min-h-screen p-6">

      <div className="max-w-3xl w-full bg-[#111827] p-8 rounded-xl shadow-lg border border-gray-800">

        <h1 className="text-4xl font-bold mb-6 text-center">
          GarmonPay Terms of Service
        </h1>


        <p className="mb-6 text-gray-300 text-center">
          Operated by Garmon5ive LLC
        </p>


        <div className="space-y-6 text-gray-300">

          <section>
            <h2 className="text-xl font-semibold mb-2 text-white">
              Rewards Disclaimer
            </h2>

            <p>
              Rewards are promotional incentives and are not guaranteed income.
              Abuse, fraud, or manipulation will result in account termination.
            </p>
          </section>


          <section>
            <h2 className="text-xl font-semibold mb-2 text-white">
              Account Responsibility
            </h2>

            <p>
              Users are responsible for maintaining account security and accurate information.
            </p>
          </section>


          <section>
            <h2 className="text-xl font-semibold mb-2 text-white">
              Platform Rights
            </h2>

            <p>
              GarmonPay reserves the right to suspend or terminate accounts for violations.
            </p>
          </section>


        </div>


      </div>

    </div>

  );

}
