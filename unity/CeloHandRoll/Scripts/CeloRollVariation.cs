using UnityEngine;

namespace GarmonPay.Celo.Dice
{
    /// <summary>
    /// One roll's procedural parameters. Generated fresh each roll so motion never looks identical.
    /// </summary>
    public struct CeloRollVariation
    {
        public float EntryYawOffsetDeg;
        public float EntryPitchOffsetDeg;
        public float ShakeIntensity;       // 0.85 - 1.15 typical
        public float ShakePhaseOffset;     // radians
        public float ReleaseStagger01;     // scales stagger between dice
        public float WristNoiseSeed;
        public Vector3 TossBiasXZ;         // normalized-ish lateral bias
        public float TorqueScale;
        public float UpwardScale;
        public float AnimatorSpeedMul;

        public static CeloRollVariation Generate(CeloDiceRollSettings s, System.Random rng)
        {
            float Rf() => (float)(rng.NextDouble() * 2.0 - 1.0);
            var bias = new Vector3(Rf(), 0f, Rf()).normalized;

            return new CeloRollVariation
            {
                EntryYawOffsetDeg = Rf() * s.entryAngleJitterDeg,
                EntryPitchOffsetDeg = Rf() * (s.entryAngleJitterDeg * 0.5f),
                ShakeIntensity = 0.9f + Mathf.Abs(Rf()) * 0.2f,
                ShakePhaseOffset = (float)(rng.NextDouble() * Mathf.PI * 2f),
                ReleaseStagger01 = (float)rng.NextDouble(),
                WristNoiseSeed = (float)rng.NextDouble() * 1000f,
                TossBiasXZ = bias,
                TorqueScale = 0.85f + (float)rng.NextDouble() * 0.35f,
                UpwardScale = 0.92f + (float)rng.NextDouble() * 0.16f,
                AnimatorSpeedMul = 0.95f + (float)rng.NextDouble() * 0.1f
            };
        }
    }
}
