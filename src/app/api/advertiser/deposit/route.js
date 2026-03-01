export async function POST() {
  return Response.json(
    {
      success: false,
      error: "Deprecated endpoint. Use Stripe wallet funding endpoints instead.",
    },
    { status: 410 }
  );
}
