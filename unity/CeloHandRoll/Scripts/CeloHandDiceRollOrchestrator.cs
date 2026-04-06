using System;
using System.Collections;
using UnityEngine;

namespace GarmonPay.Celo.Dice
{
    /// <summary>
    /// Orchestrates: procedural variation → hand presentation → synced dice release → physics → face readout.
    /// Wire Animator (optional), wrist micro-motion, three CeloPhysicsDie, camera rig, and table up vector.
    /// </summary>
    public sealed class CeloHandDiceRollOrchestrator : MonoBehaviour
    {
        public enum RollPhase
        {
            Idle,
            Entering,
            Shaking,
            Released,
            Settling,
            Complete,
            Error
        }

        [Header("References")]
        [SerializeField] private Animator _handAnimator;
        [SerializeField] private CeloWristMicroMotion _wristMicroMotion;
        [SerializeField] private Transform _handRoot;
        [SerializeField] private CeloPhysicsDie[] _dice = new CeloPhysicsDie[3];
        [SerializeField] private Transform[] _diceGripSlots = new Transform[3];
        [SerializeField] private CeloRollCameraRig _cameraRig;
        [SerializeField] private CeloDiceRollSettings _settings;
        [SerializeField] private Vector3 _worldTableUp = Vector3.up;

        [Header("Animator (optional — leave empty to time phases manually)")]
        [SerializeField] private string _stateEnterName = "Hand_Enter";
        [SerializeField] private string _stateShakeName = "Hand_Shake";
        [SerializeField] private string _stateReleaseName = "Hand_Release";
        [SerializeField] private int _animatorLayer;

        [Header("Timing fallback if no Animator")]
        [SerializeField] private float _fallbackEnterDuration = 0.55f;
        [SerializeField] private float _fallbackShakeDuration = 0.85f;
        [SerializeField] private float _fallbackReleaseWindup = 0.12f;

        private readonly System.Random _rng = new System.Random();
        private CeloRollVariation _variation;
        private RollPhase _phase = RollPhase.Idle;
        private Coroutine _running;
        private Quaternion _handBaseRotation;

        /// <summary>Fired with pip values 1–6 per die index 0..2, after physics settle.</summary>
        public event Action<int[]> OnRollSettled;

        /// <summary>Fired when dice leave the hand (for SFX).</summary>
        public event Action OnDiceReleased;

        public RollPhase Phase => _phase;

        private void Awake()
        {
            if (_handRoot == null) _handRoot = transform;
            _handBaseRotation = _handRoot.rotation;
        }

        /// <summary>Call from game when server says roll these values — or ignore and only use physics result.</summary>
        public void RequestRoll()
        {
            if (_phase != RollPhase.Idle && _phase != RollPhase.Complete)
            {
                Debug.LogWarning("[CeloHandDiceRollOrchestrator] Roll already running.");
                return;
            }

            if (_running != null)
                StopCoroutine(_running);

            _variation = CeloRollVariation.Generate(_settings, _rng);
            _running = StartCoroutine(RollRoutine());
        }

        /// <summary>Reset dice to grip slots without playing animation (lobby idle).</summary>
        public void ResetDiceToGrip()
        {
            for (int i = 0; i < _dice.Length; i++)
            {
                if (_dice[i] == null || _diceGripSlots[i] == null) continue;
                _dice[i].ResetAtLocalPose(Vector3.zero, Quaternion.identity, _diceGripSlots[i]);
                _dice[i].Body.isKinematic = true;
            }
        }

        private IEnumerator RollRoutine()
        {
            _phase = RollPhase.Entering;
            ApplyHandEntryVariation();

            // Parent dice to grip, kinematic
            for (int i = 0; i < _dice.Length; i++)
            {
                if (_dice[i] == null || _diceGripSlots[i] == null) continue;
                _dice[i].ResetAtLocalPose(Vector3.zero, Quaternion.identity, _diceGripSlots[i]);
                _dice[i].Body.isKinematic = true;
            }

            float enterWait;
            if (_handAnimator != null && !string.IsNullOrEmpty(_stateEnterName))
            {
                _handAnimator.speed = _variation.AnimatorSpeedMul;
                _handAnimator.Play(_stateEnterName, _animatorLayer, 0f);
                yield return null;
                var info = _handAnimator.GetCurrentAnimatorStateInfo(_animatorLayer);
                enterWait = Mathf.Max(0.05f, info.length / Mathf.Max(0.01f, _handAnimator.speed));
            }
            else
                enterWait = _fallbackEnterDuration;

            yield return new WaitForSeconds(enterWait * 0.95f);

            _phase = RollPhase.Shaking;
            _wristMicroMotion?.BeginShake(_variation, _settings);

            float shakeWait;
            if (_handAnimator != null && !string.IsNullOrEmpty(_stateShakeName))
            {
                _handAnimator.Play(_stateShakeName, _animatorLayer, 0f);
                yield return null;
                var info = _handAnimator.GetCurrentAnimatorStateInfo(_animatorLayer);
                shakeWait = Mathf.Max(0.05f, info.length / Mathf.Max(0.01f, _handAnimator.speed));
            }
            else
                shakeWait = _fallbackShakeDuration;

            yield return new WaitForSeconds(shakeWait * 0.92f);

            _wristMicroMotion?.EndShake();

            if (_handAnimator != null && !string.IsNullOrEmpty(_stateReleaseName))
            {
                _handAnimator.Play(_stateReleaseName, _animatorLayer, 0f);
                yield return null;
                var info = _handAnimator.GetCurrentAnimatorStateInfo(_animatorLayer);
                yield return new WaitForSeconds(Mathf.Min(_fallbackReleaseWindup, info.length * 0.15f));
            }
            else
                yield return new WaitForSeconds(_fallbackReleaseWindup);

            _phase = RollPhase.Released;
            ReleaseDicePhysics();
            OnDiceReleased?.Invoke();

            if (_cameraRig != null && _settings != null)
                _cameraRig.ImpulseShake(_settings.cameraShakeIntensity, _settings.cameraShakeDuration);

            _phase = RollPhase.Settling;
            yield return WaitForDiceSettled();

            _phase = RollPhase.Complete;
            var values = ReadAllFaces();
            OnRollSettled?.Invoke(values);

            yield return new WaitForSeconds(0.1f);
            _phase = RollPhase.Idle;
            _running = null;
        }

        private void ApplyHandEntryVariation()
        {
            var e = Quaternion.Euler(_variation.EntryPitchOffsetDeg, _variation.EntryYawOffsetDeg, 0f);
            _handRoot.rotation = _handBaseRotation * e;
        }

        private void ReleaseDicePhysics()
        {
            var tableUp = _worldTableUp.normalized;
            float up = (_settings.baseUpwardImpulse + (float)(_rng.NextDouble() * _settings.upwardImpulseJitter)) * _variation.UpwardScale;
            float lat = _settings.lateralImpulseScale;

            for (int i = 0; i < _dice.Length; i++)
            {
                if (_dice[i] == null) continue;

                float stagger = i * _settings.perDieReleaseStaggerMax * _variation.ReleaseStagger01;
                StartCoroutine(ReleaseOneDieDelayed(_dice[i], tableUp, up, lat, stagger));
            }
        }

        private IEnumerator ReleaseOneDieDelayed(CeloPhysicsDie die, Vector3 tableUp, float upImpulse, float lateralScale, float delay)
        {
            if (delay > 0f)
                yield return new WaitForSeconds(delay);

            var right = Vector3.Cross(tableUp, Vector3.forward);
            if (right.sqrMagnitude < 1e-4f)
                right = Vector3.Cross(tableUp, Vector3.right);
            right.Normalize();
            var fwd = Vector3.Cross(right, tableUp).normalized;

            var lateral = (right * _variation.TossBiasXZ.x + fwd * _variation.TossBiasXZ.z) * lateralScale;
            var impulse = tableUp * upImpulse + lateral;

            var torque = new Vector3(
                (float)(_rng.NextDouble() * 2 - 1),
                (float)(_rng.NextDouble() * 2 - 1),
                (float)(_rng.NextDouble() * 2 - 1)
            ).normalized * (_settings.torqueStrength * _variation.TorqueScale);

            die.DetachAndThrow(impulse, torque, ForceMode.Impulse);
        }

        private IEnumerator WaitForDiceSettled()
        {
            float stable = 0f;
            float threshold = _settings.settleVelocityThreshold;
            float needTime = _settings.settleStableTime;

            while (stable < needTime)
            {
                bool all = true;
                foreach (var d in _dice)
                {
                    if (d == null) continue;
                    if (!d.IsSleepingOrSettled(threshold))
                    {
                        all = false;
                        break;
                    }
                }

                if (all)
                    stable += Time.deltaTime;
                else
                    stable = 0f;

                yield return null;
            }
        }

        private int[] ReadAllFaces()
        {
            var v = new int[3];
            var up = _worldTableUp.normalized;
            for (int i = 0; i < _dice.Length; i++)
            {
                if (_dice[i] == null) { v[i] = 1; continue; }
                int face = _dice[i].ReadTopFaceValue(up);
                v[i] = _dice[i].MapFaceIndexToPip(face);
            }
            return v;
        }

#if UNITY_EDITOR
        private void OnValidate()
        {
            if (_settings == null)
                Debug.LogWarning("[CeloHandDiceRollOrchestrator] Assign CeloDiceRollSettings asset.");
        }
#endif
    }
}
