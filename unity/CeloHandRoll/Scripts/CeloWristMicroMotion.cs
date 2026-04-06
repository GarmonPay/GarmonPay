using UnityEngine;

namespace GarmonPay.Celo.Dice
{
    /// <summary>
    /// Additive procedural wrist motion during shake phase so rolls are not 100% identical to the clip.
    /// Attach to the wrist or hand bone that should receive micro rotation.
    /// </summary>
    public sealed class CeloWristMicroMotion : MonoBehaviour
    {
        [SerializeField] private Transform _wrist;
        private Quaternion _baseLocalRot;
        private bool _captured;
        private CeloRollVariation _var;
        private CeloDiceRollSettings _settings;
        private bool _active;

        private void Awake()
        {
            if (_wrist == null) _wrist = transform;
        }

        public void BeginShake(CeloRollVariation variation, CeloDiceRollSettings settings)
        {
            _var = variation;
            _settings = settings;
            _active = true;
            if (!_captured)
            {
                _baseLocalRot = _wrist.localRotation;
                _captured = true;
            }
        }

        public void EndShake()
        {
            _active = false;
            if (_wrist != null && _captured)
                _wrist.localRotation = _baseLocalRot;
        }

        private void LateUpdate()
        {
            if (!_active || _settings == null || _wrist == null) return;

            float t = Time.time * _settings.wristShakeFrequencyHz * _var.ShakeIntensity + _var.ShakePhaseOffset;
            float ax = Mathf.Sin(t * 1.7f + _var.WristNoiseSeed) * _settings.wristShakeAmplitudeDeg;
            float ay = Mathf.Sin(t * 2.3f + _var.WristNoiseSeed * 0.5f) * _settings.wristShakeAmplitudeDeg * 0.6f;
            float az = Mathf.Cos(t * 1.9f) * _settings.wristShakeAmplitudeDeg * 0.45f;

            var jitter = Quaternion.Euler(ax, ay, az);
            _wrist.localRotation = _baseLocalRot * jitter;
        }
    }
}
