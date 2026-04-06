using UnityEngine;

namespace GarmonPay.Celo.Dice
{
    /// <summary>
    /// One physical die: collider, rigidbody, face resolution from orientation, settle detection.
    /// Expects a standard cube mapping: local +Y = face 1 (customize normals in inspector if your mesh differs).
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public sealed class CeloPhysicsDie : MonoBehaviour
    {
        [SerializeField] private Rigidbody _rb;
        [SerializeField] private int _dieIndex;

        /// <summary>Local directions pointing OUT of each face (1–6). Must match your mesh orientation.</summary>
        [SerializeField] private Vector3[] _faceOutwardNormals =
        {
            Vector3.right,   // 1 — edit to match asset
            Vector3.left,    // 2
            Vector3.up,      // 3
            Vector3.down,    // 4
            Vector3.forward, // 5
            Vector3.back   // 6
        };

        public Rigidbody Body => _rb != null ? _rb : (_rb = GetComponent<Rigidbody>());
        public int DieIndex => _dieIndex;

        public bool IsSleepingOrSettled(float velThreshold)
        {
            var v = Body.velocity.sqrMagnitude + Body.angularVelocity.sqrMagnitude;
            return v < velThreshold * velThreshold;
        }

        /// <summary>Which face (1–6) points most toward world up (table normal).</summary>
        public int ReadTopFaceValue(Vector3 worldTableUp)
        {
            worldTableUp.Normalize();
            int best = 1;
            float bestDot = -2f;
            var rot = transform.rotation;
            for (int i = 0; i < 6; i++)
            {
                var worldDir = rot * _faceOutwardNormals[i].normalized;
                float d = Vector3.Dot(worldDir, worldTableUp);
                if (d > bestDot)
                {
                    bestDot = d;
                    best = i + 1;
                }
            }
            return best;
        }

        /// <summary>Optional: map mesh face index order to C-Lo pip values if different.</summary>
        public int MapFaceIndexToPip(int faceIndex1To6) => faceIndex1To6;

        public void ResetAtLocalPose(Vector3 localPos, Quaternion localRot, Transform parent)
        {
            transform.SetParent(parent, false);
            transform.localPosition = localPos;
            transform.localRotation = localRot;
            Body.velocity = Vector3.zero;
            Body.angularVelocity = Vector3.zero;
            Body.Sleep();
            Body.WakeUp();
        }

        public void DetachAndThrow(Vector3 worldImpulse, Vector3 worldTorque, ForceMode mode = ForceMode.Impulse)
        {
            transform.SetParent(null, true);
            Body.isKinematic = false;
            Body.AddForce(worldImpulse, mode);
            Body.AddTorque(worldTorque, mode);
        }

#if UNITY_EDITOR
        private void OnDrawGizmosSelected()
        {
            if (_faceOutwardNormals == null || _faceOutwardNormals.Length != 6) return;
            Gizmos.color = Color.yellow;
            var o = transform.position;
            for (int i = 0; i < 6; i++)
            {
                var dir = transform.TransformDirection(_faceOutwardNormals[i].normalized);
                Gizmos.DrawLine(o, o + dir * 0.04f);
            }
        }
#endif
    }
}
