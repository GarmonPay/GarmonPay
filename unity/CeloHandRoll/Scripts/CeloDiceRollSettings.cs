using UnityEngine;

namespace GarmonPay.Celo.Dice
{
    /// <summary>
    /// Designer-tunable defaults for dice roll feel. Create via Assets → Create → GarmonPay → Celo Dice Roll Settings.
    /// </summary>
    [CreateAssetMenu(fileName = "CeloDiceRollSettings", menuName = "GarmonPay/Celo/Dice Roll Settings", order = 0)]
    public sealed class CeloDiceRollSettings : ScriptableObject
    {
        [Header("Release / toss")]
        [Tooltip("Base upward impulse applied to each die at release (N).")]
        public float baseUpwardImpulse = 2.2f;

        [Tooltip("Random add to upward impulse each roll.")]
        public float upwardImpulseJitter = 0.35f;

        [Tooltip("Sideways impulse scale (world-relative, mixed with random direction).")]
        public float lateralImpulseScale = 0.45f;

        [Tooltip("Torque magnitude random range (N·m scale via rigidbody mass).")]
        public float torqueStrength = 0.8f;

        [Tooltip("Per-die delay after release before AddForce (staggered toss feel), seconds.")]
        public float perDieReleaseStaggerMax = 0.04f;

        [Header("Physics material feel")]
        public float diceBounciness = 0.42f;
        public float diceStaticFriction = 0.55f;
        public float diceDynamicFriction = 0.52f;

        [Header("Settle detection")]
        [Tooltip("Max |velocity| to consider a die 'settled' (m/s).")]
        public float settleVelocityThreshold = 0.08f;

        [Tooltip("Seconds all dice must stay under threshold before faces are read.")]
        public float settleStableTime = 0.35f;

        [Header("Camera")]
        public float cameraShakeIntensity = 0.12f;
        public float cameraShakeDuration = 0.22f;

        [Header("Procedural variation (hand)")]
        public float wristShakeFrequencyHz = 3.2f;
        public float wristShakeAmplitudeDeg = 2.8f;
        public float entryAngleJitterDeg = 6f;
    }
}
