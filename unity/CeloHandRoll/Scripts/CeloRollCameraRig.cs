using UnityEngine;

namespace GarmonPay.Celo.Dice
{
    /// <summary>
    /// Close-up framing for the roll + optional impulse shake on release. No Cinemachine required.
    /// </summary>
    public sealed class CeloRollCameraRig : MonoBehaviour
    {
        [SerializeField] private Transform _cameraTransform;
        [SerializeField] private Vector3 _focusLocalOffset = new Vector3(0f, 0.28f, -0.55f);
        [SerializeField] private Vector3 _lookAtLocalOffset = new Vector3(0f, 0.08f, 0f);

        private Vector3 _shakeVel;
        private float _shakeTimeLeft;

        private void LateUpdate()
        {
            if (_shakeTimeLeft <= 0f) return;
            _shakeTimeLeft -= Time.deltaTime;
            float damping = Mathf.Exp(-Time.deltaTime * 12f);
            _shakeVel *= damping;
            if (_cameraTransform != null)
                _cameraTransform.localPosition += _shakeVel * Time.deltaTime;
        }

        public void SnapToDiceAnchor(Transform diceAnchor)
        {
            if (_cameraTransform == null || diceAnchor == null) return;
            var parent = _cameraTransform.parent;
            _cameraTransform.SetParent(diceAnchor, false);
            _cameraTransform.localPosition = _focusLocalOffset;
            _cameraTransform.localRotation = Quaternion.LookRotation(
                (_lookAtLocalOffset - _focusLocalOffset).normalized,
                Vector3.up);
            _cameraTransform.SetParent(parent, true);
        }

        public void FrameWorldPoint(Vector3 worldDiceCenter, Quaternion tableRotation)
        {
            if (_cameraTransform == null) return;
            var target = worldDiceCenter + tableRotation * _lookAtLocalOffset;
            var camPos = worldDiceCenter + tableRotation * _focusLocalOffset;
            _cameraTransform.position = camPos;
            _cameraTransform.rotation = Quaternion.LookRotation((target - camPos).normalized, tableRotation * Vector3.up);
        }

        public void ImpulseShake(float intensity, float duration)
        {
            _shakeTimeLeft = duration;
            _shakeVel = Random.insideUnitSphere * intensity * 8f;
        }
    }
}
