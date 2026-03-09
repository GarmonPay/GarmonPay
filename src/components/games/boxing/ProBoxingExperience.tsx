"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type DashboardSection = "arena" | "training" | "fighter" | "leaderboard" | "tournaments";
type AIStyle = "aggressive" | "balanced" | "defensive";
type Difficulty = "Beginner" | "Intermediate" | "Champion";
type CameraPreset = "ringside" | "over-shoulder" | "cinematic";
type BoxerAction =
  | "idle"
  | "jab"
  | "cross"
  | "hook"
  | "uppercut"
  | "block"
  | "dodge"
  | "knockout"
  | "victory";

type FighterRecord = {
  id: string;
  user_id: string;
  name: string;
  gender: "male" | "female";
  skin_tone: string;
  gloves_color: string;
  shorts_color: string;
  shoes_color: string;
  speed: number;
  power: number;
  defense: number;
  stamina: number;
  experience: number;
  wins: number;
  losses: number;
  level: number;
  owned_cosmetics?: Record<string, boolean>;
  is_active?: boolean;
};

type TournamentRow = {
  id: string;
  name: string;
  entry_fee: number;
  max_players: number;
  prize_pool: number;
  status: string;
};

const SECTION_ORDER: DashboardSection[] = [
  "arena",
  "training",
  "fighter",
  "leaderboard",
  "tournaments",
];

const SECTION_LABEL: Record<DashboardSection, string> = {
  arena: "Fight Arena",
  training: "Training Gym",
  fighter: "My Fighter",
  leaderboard: "Leaderboard",
  tournaments: "Tournaments",
};

const DRILL_DEFS = [
  {
    id: "punching_bag",
    title: "Punching Bag",
    costCents: 150,
    gain: "+Power, +Stamina, +EXP",
    action: "hook" as BoxerAction,
  },
  {
    id: "speed_bag",
    title: "Speed Bag",
    costCents: 120,
    gain: "+Speed, +Stamina, +EXP",
    action: "jab" as BoxerAction,
  },
  {
    id: "shadow_boxing",
    title: "Shadow Boxing",
    costCents: 100,
    gain: "+Defense, +Speed, +EXP",
    action: "block" as BoxerAction,
  },
  {
    id: "footwork_drills",
    title: "Footwork Drills",
    costCents: 110,
    gain: "+Speed, +Defense, +Stamina",
    action: "dodge" as BoxerAction,
  },
];

const COSMETIC_SHOP = [
  { id: "gloves_gold", slot: "gloves", color: "gold", costCents: 450, label: "Gold Gloves" },
  { id: "gloves_black", slot: "gloves", color: "black", costCents: 250, label: "Stealth Gloves" },
  { id: "shorts_silver", slot: "shorts", color: "silver", costCents: 380, label: "Silver Shorts" },
  { id: "shorts_white", slot: "shorts", color: "white", costCents: 220, label: "Champion White Shorts" },
  { id: "shoes_blue", slot: "shoes", color: "blue", costCents: 280, label: "Pro Blue Shoes" },
  { id: "shoes_red", slot: "shoes", color: "red", costCents: 280, label: "Crimson Ring Shoes" },
] as const;

const ACTION_COST: Record<Exclude<BoxerAction, "idle" | "knockout" | "victory">, number> = {
  jab: 8,
  cross: 11,
  hook: 14,
  uppercut: 16,
  block: 6,
  dodge: 8,
};

const ACTION_DAMAGE: Record<"jab" | "cross" | "hook" | "uppercut", number> = {
  jab: 7,
  cross: 10,
  hook: 13,
  uppercut: 17,
};

const DIFFICULTY_CONFIG: Record<Difficulty, { intervalMs: number; damageMult: number; defenseBonus: number }> = {
  Beginner: { intervalMs: 1700, damageMult: 0.85, defenseBonus: 0.9 },
  Intermediate: { intervalMs: 1200, damageMult: 1, defenseBonus: 1 },
  Champion: { intervalMs: 850, damageMult: 1.22, defenseBonus: 1.15 },
};

const AI_STYLE_CONFIG: Record<AIStyle, { attackChance: number; blockChance: number; dodgeChance: number; counterChance: number }> = {
  aggressive: { attackChance: 0.72, blockChance: 0.14, dodgeChance: 0.14, counterChance: 0.32 },
  balanced: { attackChance: 0.56, blockChance: 0.22, dodgeChance: 0.22, counterChance: 0.22 },
  defensive: { attackChance: 0.4, blockChance: 0.32, dodgeChance: 0.28, counterChance: 0.2 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function calcLevel(experience: number) {
  return 1 + Math.floor(experience / 120);
}

function colorByTone(tone: string) {
  const map: Record<string, string> = {
    fair: "#e9c9b1",
    light: "#deb293",
    medium: "#bf8a65",
    tan: "#9f6a49",
    dark: "#6f4633",
  };
  return map[tone] ?? map.medium;
}

function animationAliases(action: BoxerAction): string[] {
  const aliases: Record<BoxerAction, string[]> = {
    idle: ["idle", "breath", "stance"],
    jab: ["jab"],
    cross: ["cross", "straight", "powerpunch", "power_punch"],
    hook: ["hook"],
    uppercut: ["uppercut"],
    block: ["block", "guard"],
    dodge: ["dodge", "slip"],
    knockout: ["knockout", "ko", "fall"],
    victory: ["victory", "win", "celebrate"],
  };
  return aliases[action];
}

function applyCustomizationToModel(scene: Group, fighter: FighterRecord) {
  const glovesColor = new Color(fighter.gloves_color || "red");
  const shortsColor = new Color(fighter.shorts_color || "black");
  const shoesColor = new Color(fighter.shoes_color || "white");
  const skinColor = new Color(colorByTone(fighter.skin_tone));

  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const name = mesh.name.toLowerCase();
    const baseMaterial = mesh.material;
    if (!baseMaterial || Array.isArray(baseMaterial)) return;
    const material = (baseMaterial as MeshStandardMaterial).clone();
    if (name.includes("glove")) material.color = glovesColor;
    else if (name.includes("short")) material.color = shortsColor;
    else if (name.includes("shoe")) material.color = shoesColor;
    else if (name.includes("skin") || name.includes("body") || name.includes("face")) material.color = skinColor;
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function Crowd({ count = 90 }: { count?: number }) {
  const bodyRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const temp = useMemo(() => new Object3D(), []);
  const tempMatrix = useMemo(() => new Matrix4(), []);
  const seats = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const lane = i % 3;
        const radius = 11 + lane * 2.1 + Math.random() * 0.8;
        const angle = (i / count) * Math.PI * 2;
        return {
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          y: 0.15 + lane * 0.55,
          h: 0.9 + Math.random() * 0.5,
          seed: Math.random() * 4,
        };
      }),
    [count]
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!bodyRef.current || !headRef.current) return;
    seats.forEach((seat, idx) => {
      const bounce = Math.sin(t * 2 + seat.seed) * 0.05;
      temp.position.set(seat.x, seat.y + bounce, seat.z);
      temp.scale.set(0.35, seat.h, 0.35);
      temp.lookAt(0, 2, 0);
      temp.updateMatrix();
      tempMatrix.copy(temp.matrix);
      bodyRef.current!.setMatrixAt(idx, tempMatrix);

      temp.position.set(seat.x, seat.y + seat.h + 0.22 + bounce, seat.z);
      temp.scale.setScalar(0.24);
      temp.lookAt(0, 2, 0);
      temp.updateMatrix();
      tempMatrix.copy(temp.matrix);
      headRef.current!.setMatrixAt(idx, tempMatrix);
    });
    bodyRef.current.instanceMatrix.needsUpdate = true;
    headRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#203046" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, count]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial color="#2f4b6f" roughness={0.75} />
      </instancedMesh>
    </group>
  );
}

function CameraRig({
  preset,
  slowMo,
  mode,
}: {
  preset: CameraPreset;
  slowMo: boolean;
  mode: "arena" | "training";
}) {
  const { camera } = useThree();
  const look = useMemo(() => new Vector3(0, 1.7, 0), []);
  const target = useMemo(() => new Vector3(0, 6, 14), []);
  const cinematicAngle = useRef(0);

  useFrame((state, delta) => {
    const alpha = clamp(delta * 2.4, 0.03, 0.2);
    if (mode === "training") {
      target.set(6.2, 3.8, 8.2);
      look.set(0, 1.8, 0);
    } else if (slowMo) {
      target.set(4.2, 2.6, 5.2);
      look.set(0, 1.7, 0);
    } else if (preset === "ringside") {
      target.set(0, 4.8, 12);
      look.set(0, 1.8, 0);
    } else if (preset === "over-shoulder") {
      target.set(-4.4, 3.4, 6.2);
      look.set(1.8, 1.8, 0);
    } else {
      cinematicAngle.current += delta * 0.2;
      target.set(Math.cos(cinematicAngle.current) * 11, 5.4, Math.sin(cinematicAngle.current) * 11);
      look.set(0, 1.8, 0);
    }
    camera.position.lerp(target, alpha);
    camera.lookAt(look);
    state.gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  });

  return null;
}

function RefereeModel() {
  const [model, setModel] = useState<Group | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const loader = new GLTFLoader();
    loader.load(
      "/models/referee.glb",
      (gltf) => {
        if (!mounted.current) return;
        setModel(gltf.scene.clone(true));
      },
      undefined,
      () => {
        if (!mounted.current) return;
        setModel(null);
      }
    );
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!model) {
    return (
      <group position={[0, 0, -3.6]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.26, 1.25, 6, 12]} />
          <meshStandardMaterial color="#2b2b2b" />
        </mesh>
        <mesh position={[0, 1.05, 0]} castShadow>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshStandardMaterial color="#c39d85" />
        </mesh>
      </group>
    );
  }

  return <primitive object={model} position={[0, 0, -3.8]} scale={1.1} />;
}

function FighterAvatar({
  fighter,
  modelPath,
  action,
  position,
  rotationY,
  timeScale,
}: {
  fighter: FighterRecord;
  modelPath: string;
  action: BoxerAction;
  position: [number, number, number];
  rotationY: number;
  timeScale: number;
}) {
  const [baseScene, setBaseScene] = useState<Group | null>(null);
  const [clips, setClips] = useState<AnimationClip[]>([]);
  const [failed, setFailed] = useState(false);
  const displayScene = useMemo(() => (baseScene ? baseScene.clone(true) : null), [baseScene]);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionMapRef = useRef<Map<string, AnimationAction>>(new Map());
  const currentActionRef = useRef<AnimationAction | null>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    let cancelled = false;
    setFailed(false);
    loader.load(
      modelPath,
      (gltf) => {
        if (cancelled) return;
        const cloned = gltf.scene.clone(true);
        applyCustomizationToModel(cloned, fighter);
        setBaseScene(cloned);
        setClips(gltf.animations ?? []);
      },
      undefined,
      () => {
        if (cancelled) return;
        setFailed(true);
        setBaseScene(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [modelPath, fighter]);

  useEffect(() => {
    if (!displayScene) return;
    const mixer = new AnimationMixer(displayScene);
    mixerRef.current = mixer;
    actionMapRef.current = new Map();
    clips.forEach((clip) => {
      actionMapRef.current.set(clip.name.toLowerCase(), mixer.clipAction(clip));
    });
    return () => {
      mixer.stopAllAction();
      actionMapRef.current.clear();
      currentActionRef.current = null;
      mixerRef.current = null;
    };
  }, [displayScene, clips]);

  useEffect(() => {
    if (!mixerRef.current) return;
    const aliases = animationAliases(action);
    let nextAction: AnimationAction | null = null;
    for (const [name, clipAction] of Array.from(actionMapRef.current.entries())) {
      if (aliases.some((alias) => name.includes(alias))) {
        nextAction = clipAction;
        break;
      }
    }
    if (!nextAction) return;
    if (currentActionRef.current === nextAction) return;
    currentActionRef.current?.fadeOut(0.12);
    nextAction.reset().fadeIn(0.12);
    nextAction.setLoop(action === "idle" ? 2201 : 2200, action === "idle" ? Infinity : 1);
    nextAction.play();
    currentActionRef.current = nextAction;
  }, [action]);

  useFrame((_, delta) => {
    if (!mixerRef.current) return;
    mixerRef.current.update(delta * timeScale);
  });

  if (failed || !displayScene) {
    return (
      <group position={position} rotation={[0, rotationY, 0]}>
        <mesh castShadow position={[0, 1.05, 0]}>
          <capsuleGeometry args={[0.34, 1.25, 8, 14]} />
          <meshStandardMaterial color={colorByTone(fighter.skin_tone)} />
        </mesh>
        <mesh castShadow position={[0, 0.42, 0]}>
          <boxGeometry args={[0.85, 0.48, 0.52]} />
          <meshStandardMaterial color={fighter.shorts_color || "black"} />
        </mesh>
        <mesh castShadow position={[0.35, 1.15, 0.18]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color={fighter.gloves_color || "red"} />
        </mesh>
        <mesh castShadow position={[-0.35, 1.15, 0.18]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color={fighter.gloves_color || "red"} />
        </mesh>
        <mesh castShadow position={[0.16, 0.02, 0.12]}>
          <boxGeometry args={[0.2, 0.08, 0.46]} />
          <meshStandardMaterial color={fighter.shoes_color || "white"} />
        </mesh>
        <mesh castShadow position={[-0.16, 0.02, 0.12]}>
          <boxGeometry args={[0.2, 0.08, 0.46]} />
          <meshStandardMaterial color={fighter.shoes_color || "white"} />
        </mesh>
      </group>
    );
  }

  return (
    <primitive
      object={displayScene}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={1.06}
    />
  );
}

function BoxingWorld({
  mode,
  cameraPreset,
  slowMo,
  player,
  playerAction,
  opponent,
  opponentAction,
}: {
  mode: "arena" | "training";
  cameraPreset: CameraPreset;
  slowMo: boolean;
  player: FighterRecord | null;
  playerAction: BoxerAction;
  opponent: FighterRecord;
  opponentAction: BoxerAction;
}) {
  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.6]}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      className="h-[420px] w-full"
    >
      <color attach="background" args={[mode === "arena" ? "#070c17" : "#121319"]} />
      <ambientLight intensity={0.45} />
      <spotLight intensity={1.8} position={[0, 13, 0]} angle={0.45} penumbra={0.45} />
      <spotLight intensity={0.9} position={[8, 10, 8]} angle={0.38} penumbra={0.6} />
      <spotLight intensity={0.9} position={[-8, 10, 8]} angle={0.38} penumbra={0.6} />
      <Stars radius={70} depth={24} count={700} factor={1.5} saturation={0} fade />
      <CameraRig preset={cameraPreset} slowMo={slowMo} mode={mode} />

      {mode === "arena" ? (
        <>
          <mesh receiveShadow position={[0, 0, 0]}>
            <boxGeometry args={[22, 0.4, 22]} />
            <meshStandardMaterial color="#0f1726" roughness={1} />
          </mesh>
          <mesh receiveShadow position={[0, 0.55, 0]}>
            <boxGeometry args={[10.5, 0.8, 10.5]} />
            <meshStandardMaterial color="#d8d9df" roughness={0.72} metalness={0.05} />
          </mesh>
          <mesh receiveShadow position={[0, 0.95, 0]}>
            <boxGeometry args={[9.9, 0.08, 9.9]} />
            <meshStandardMaterial color="#f4f5f7" roughness={0.9} />
          </mesh>
          {[1.15, 1.55, 1.95].map((h) => (
            <group key={h}>
              <mesh position={[0, h, -4.9]}>
                <boxGeometry args={[9.9, 0.05, 0.05]} />
                <meshStandardMaterial color="#bf1d2a" />
              </mesh>
              <mesh position={[0, h, 4.9]}>
                <boxGeometry args={[9.9, 0.05, 0.05]} />
                <meshStandardMaterial color="#214dba" />
              </mesh>
              <mesh position={[-4.9, h, 0]}>
                <boxGeometry args={[0.05, 0.05, 9.9]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[4.9, h, 0]}>
                <boxGeometry args={[0.05, 0.05, 9.9]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
          {[
            [-4.9, 1.4, -4.9],
            [4.9, 1.4, -4.9],
            [-4.9, 1.4, 4.9],
            [4.9, 1.4, 4.9],
          ].map((p, idx) => (
            <mesh key={idx} position={p as [number, number, number]}>
              <cylinderGeometry args={[0.08, 0.08, 2.15, 10]} />
              <meshStandardMaterial color="#d8d9e5" />
            </mesh>
          ))}
          <Crowd />
          <RefereeModel />
        </>
      ) : (
        <>
          <mesh receiveShadow position={[0, 0, 0]}>
            <boxGeometry args={[20, 0.5, 20]} />
            <meshStandardMaterial color="#1b1f2c" />
          </mesh>
          <mesh position={[0, 2.4, -3.2]}>
            <cylinderGeometry args={[0.45, 0.45, 2.4, 18]} />
            <meshStandardMaterial color="#af2028" />
          </mesh>
          <mesh position={[0, 3.85, -3.2]}>
            <boxGeometry args={[0.08, 2.6, 0.08]} />
            <meshStandardMaterial color="#a7a7b2" />
          </mesh>
          <mesh position={[3.2, 2.8, -2.4]}>
            <sphereGeometry args={[0.35, 18, 18]} />
            <meshStandardMaterial color="#2f69d8" />
          </mesh>
          <mesh position={[-3.6, 1.5, -3.8]}>
            <boxGeometry args={[2.4, 2.6, 0.1]} />
            <meshStandardMaterial color="#7f90aa" metalness={0.2} roughness={0.25} />
          </mesh>
        </>
      )}

      {player && (
        <FighterAvatar
          fighter={player}
          modelPath={player.gender === "female" ? "/models/female-boxer.glb" : "/models/male-boxer.glb"}
          action={playerAction}
          position={mode === "arena" ? [-1.95, 0.95, 0] : [-0.9, 0.25, 1]}
          rotationY={mode === "arena" ? Math.PI / 2 : 0.8}
          timeScale={slowMo ? 0.35 : 1}
        />
      )}
      <FighterAvatar
        fighter={opponent}
        modelPath={opponent.gender === "female" ? "/models/female-boxer.glb" : "/models/male-boxer.glb"}
        action={opponentAction}
        position={mode === "arena" ? [1.95, 0.95, 0] : [1.9, 0.25, -1.15]}
        rotationY={mode === "arena" ? -Math.PI / 2 : -2.3}
        timeScale={slowMo ? 0.35 : 1}
      />
      <OrbitControls enablePan={false} enableZoom={false} maxPolarAngle={Math.PI * 0.47} />
    </Canvas>
  );
}

export function ProBoxingExperience({ defaultSection = "arena" }: { defaultSection?: DashboardSection }) {
  const [section, setSection] = useState<DashboardSection>(SECTION_ORDER.includes(defaultSection) ? defaultSection : "arena");
  const [fighters, setFighters] = useState<FighterRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [walletCents, setWalletCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [aiStyle, setAiStyle] = useState<AIStyle>("balanced");
  const [difficulty, setDifficulty] = useState<Difficulty>("Intermediate");
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("ringside");
  const [entryFeeCents, setEntryFeeCents] = useState(0);
  const [fightActive, setFightActive] = useState(false);
  const [playerHealth, setPlayerHealth] = useState(100);
  const [opponentHealth, setOpponentHealth] = useState(100);
  const [playerStamina, setPlayerStamina] = useState(100);
  const [opponentStamina, setOpponentStamina] = useState(100);
  const [playerAction, setPlayerAction] = useState<BoxerAction>("idle");
  const [opponentAction, setOpponentAction] = useState<BoxerAction>("idle");
  const [resultText, setResultText] = useState<string | null>(null);
  const [slowMo, setSlowMo] = useState(false);
  const [lastAttackAt, setLastAttackAt] = useState(0);
  const [queuedMatchId, setQueuedMatchId] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<
    Array<{ rank: number; email: string; wins: number; losses: number; knockouts: number; total_earnings_cents: number }>
  >([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);

  const blockUntilRef = useRef(0);
  const dodgeUntilRef = useRef(0);
  const aiBlockUntilRef = useRef(0);
  const aiDodgeUntilRef = useRef(0);
  const playerHealthRef = useRef(100);
  const opponentHealthRef = useRef(100);
  const playerStaminaRef = useRef(100);
  const opponentStaminaRef = useRef(100);

  useEffect(() => setSection(defaultSection), [defaultSection]);
  useEffect(() => {
    playerHealthRef.current = playerHealth;
    opponentHealthRef.current = opponentHealth;
    playerStaminaRef.current = playerStamina;
    opponentStaminaRef.current = opponentStamina;
  }, [playerHealth, opponentHealth, playerStamina, opponentStamina]);

  const activeFighter = useMemo(
    () => fighters.find((f) => f.id === activeId) ?? fighters.find((f) => f.is_active) ?? fighters[0] ?? null,
    [fighters, activeId]
  );

  const aiOpponent = useMemo<FighterRecord>(
    () => ({
      id: "ai",
      user_id: "ai",
      name: `${difficulty} ${aiStyle} AI`,
      gender: Math.random() > 0.45 ? "male" : "female",
      skin_tone: "medium",
      gloves_color: "blue",
      shorts_color: "navy",
      shoes_color: "white",
      speed: difficulty === "Beginner" ? 48 : difficulty === "Intermediate" ? 62 : 78,
      power: difficulty === "Beginner" ? 46 : difficulty === "Intermediate" ? 66 : 80,
      defense: difficulty === "Beginner" ? 45 : difficulty === "Intermediate" ? 64 : 82,
      stamina: difficulty === "Beginner" ? 52 : difficulty === "Intermediate" ? 66 : 84,
      experience: difficulty === "Beginner" ? 220 : difficulty === "Intermediate" ? 430 : 780,
      wins: 0,
      losses: 0,
      level: difficulty === "Beginner" ? 3 : difficulty === "Intermediate" ? 7 : 12,
    }),
    [aiStyle, difficulty]
  );

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fightersRes, walletRes] = await Promise.all([fetch("/api/fighters"), fetch("/api/wallet")]);
      if (!fightersRes.ok) throw new Error("Failed to load fighters.");
      const fightersJson = (await fightersRes.json()) as { fighters?: FighterRecord[] };
      const loadedFighters = fightersJson.fighters ?? [];
      setFighters(loadedFighters);
      if (loadedFighters.length > 0) {
        const active = loadedFighters.find((f) => f.is_active) ?? loadedFighters[0];
        setActiveId(active.id);
      }
      if (walletRes.ok) {
        const walletJson = (await walletRes.json()) as { balance_cents?: number };
        setWalletCents(typeof walletJson.balance_cents === "number" ? walletJson.balance_cents : 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load game data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (section !== "leaderboard") return;
    fetch("/api/boxing/leaderboard?limit=20")
      .then((r) => (r.ok ? r.json() : { leaderboard: [] }))
      .then((d: { leaderboard?: Array<{ rank: number; email: string; wins: number; losses: number; knockouts: number; total_earnings_cents: number }> }) =>
        setLeaderboard(d.leaderboard ?? [])
      )
      .catch(() => setLeaderboard([]));
  }, [section]);

  useEffect(() => {
    if (section !== "tournaments") return;
    fetch("/api/boxing/tournaments")
      .then((r) => (r.ok ? r.json() : { tournaments: [] }))
      .then((d: { tournaments?: TournamentRow[] }) => setTournaments(d.tournaments ?? []))
      .catch(() => setTournaments([]));
  }, [section]);

  const resetFightState = useCallback(() => {
    setFightActive(false);
    setPlayerAction("idle");
    setOpponentAction("idle");
    setPlayerHealth(100);
    setOpponentHealth(100);
    setPlayerStamina(100);
    setOpponentStamina(100);
    blockUntilRef.current = 0;
    dodgeUntilRef.current = 0;
    aiBlockUntilRef.current = 0;
    aiDodgeUntilRef.current = 0;
  }, []);

  const applyFighterCareerUpdate = useCallback(
    async (won: boolean) => {
      if (!activeFighter) return;
      const nextWins = activeFighter.wins + (won ? 1 : 0);
      const nextLosses = activeFighter.losses + (won ? 0 : 1);
      const gained = won ? 28 : 12;
      const nextExperience = activeFighter.experience + gained;
      const nextLevel = calcLevel(nextExperience);
      const response = await fetch(`/api/fighters/${activeFighter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wins: nextWins,
          losses: nextLosses,
          experience: nextExperience,
          level: nextLevel,
        }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as { fighter?: FighterRecord };
      if (!data.fighter) return;
      setFighters((prev) => prev.map((f) => (f.id === data.fighter!.id ? data.fighter! : f)));
    },
    [activeFighter]
  );

  const finishFight = useCallback(
    async (won: boolean) => {
      setFightActive(false);
      setSlowMo(true);
      setTimeout(() => setSlowMo(false), 1800);
      setResultText(won ? "Victory! Your fighter dominated the round." : "Knockout loss. Recover and train harder.");
      setPlayerAction(won ? "victory" : "knockout");
      setOpponentAction(won ? "knockout" : "victory");
      await applyFighterCareerUpdate(won);
      if (entryFeeCents > 0) {
        await fetch("/api/games/boxing/ai-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ won, bet_amount_cents: entryFeeCents }),
        });
        await refreshData();
      }
    },
    [applyFighterCareerUpdate, entryFeeCents, refreshData]
  );

  const performPlayerAction = useCallback(
    (action: Exclude<BoxerAction, "idle" | "knockout" | "victory">) => {
      if (!fightActive || !activeFighter) return;
      const cost = ACTION_COST[action];
      if (playerStaminaRef.current < cost) return;
      setPlayerAction(action);
      setTimeout(() => setPlayerAction("idle"), 340);
      setPlayerStamina((prev) => clamp(prev - cost, 0, 100));

      const now = Date.now();
      if (action === "block") {
        blockUntilRef.current = now + 650;
        return;
      }
      if (action === "dodge") {
        dodgeUntilRef.current = now + 420;
        return;
      }

      setLastAttackAt(now);
      const isBlocked = aiBlockUntilRef.current > now;
      const isDodged = aiDodgeUntilRef.current > now;
      if (isDodged) {
        setMessage("AI slipped your punch.");
        return;
      }

      const base = ACTION_DAMAGE[action];
      const staminaFactor = 0.65 + playerStaminaRef.current / 200;
      const powerFactor = 1 + activeFighter.power / 180;
      const defenseFactor = (100 - aiOpponent.defense * DIFFICULTY_CONFIG[difficulty].defenseBonus) / 115;
      const guardFactor = isBlocked ? 0.42 : 1;
      const rawDamage = base * staminaFactor * powerFactor * clamp(defenseFactor, 0.22, 1.08) * guardFactor;
      const damage = Math.max(1, Math.round(rawDamage));

      setOpponentHealth((prev) => {
        const next = clamp(prev - damage, 0, 100);
        if (next <= 0) void finishFight(true);
        return next;
      });
      setMessage(`${action.toUpperCase()} landed for ${damage} damage.`);
    },
    [activeFighter, aiOpponent.defense, difficulty, fightActive, finishFight]
  );

  useEffect(() => {
    if (!fightActive || !activeFighter) return;
    const cfg = DIFFICULTY_CONFIG[difficulty];
    const style = AI_STYLE_CONFIG[aiStyle];
    const id = window.setInterval(() => {
      const now = Date.now();
      if (playerHealthRef.current <= 0 || opponentHealthRef.current <= 0) return;

      setPlayerStamina((prev) => clamp(prev + 2 + activeFighter.stamina / 55, 0, 100));
      setOpponentStamina((prev) => clamp(prev + 2.4 + aiOpponent.stamina / 52, 0, 100));

      const roll = Math.random();
      const counterWindow = now - lastAttackAt < 850;
      const canCounter = counterWindow && Math.random() < style.counterChance;

      if (roll < style.blockChance) {
        aiBlockUntilRef.current = now + 600;
        setOpponentAction("block");
        setTimeout(() => setOpponentAction("idle"), 320);
        return;
      }
      if (roll < style.blockChance + style.dodgeChance) {
        aiDodgeUntilRef.current = now + 350;
        setOpponentAction("dodge");
        setTimeout(() => setOpponentAction("idle"), 290);
        return;
      }
      if (roll >= style.attackChance && !canCounter) return;
      if (opponentStaminaRef.current < 8) return;

      const attacks: Array<"jab" | "cross" | "hook" | "uppercut"> = ["jab", "cross", "hook", "uppercut"];
      const aiMove = attacks[Math.floor(Math.random() * attacks.length)];
      setOpponentAction(aiMove);
      setTimeout(() => setOpponentAction("idle"), 320);
      setOpponentStamina((prev) => clamp(prev - ACTION_COST[aiMove], 0, 100));

      const blocked = blockUntilRef.current > now;
      const dodged = dodgeUntilRef.current > now;
      if (dodged) {
        setMessage("You dodged the counter.");
        return;
      }
      const base = ACTION_DAMAGE[aiMove];
      const mult = cfg.damageMult * (1 + aiOpponent.power / 185);
      const staminaFactor = 0.62 + opponentStaminaRef.current / 205;
      const defenseReduction = (100 - activeFighter.defense) / 120;
      const guard = blocked ? 0.45 : 1;
      const damage = Math.max(1, Math.round(base * mult * staminaFactor * clamp(defenseReduction, 0.2, 1.04) * guard));
      setPlayerHealth((prev) => {
        const next = clamp(prev - damage, 0, 100);
        if (next <= 0) void finishFight(false);
        return next;
      });
      setMessage(`AI ${canCounter ? "counter " : ""}${aiMove} hit for ${damage}.`);
    }, cfg.intervalMs);

    return () => window.clearInterval(id);
  }, [activeFighter, aiOpponent, aiStyle, difficulty, fightActive, finishFight, lastAttackAt]);

  const startAiFight = useCallback(async () => {
    if (!activeFighter) {
      setError("Create a fighter first.");
      return;
    }
    setError(null);
    setMessage(null);
    setResultText(null);
    if (entryFeeCents > 0) {
      if (entryFeeCents > walletCents) {
        setError("Insufficient wallet balance for this entry.");
        return;
      }
      const betRes = await fetch("/api/games/boxing/place-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: entryFeeCents }),
      });
      const betJson = (await betRes.json().catch(() => ({}))) as { error?: string; balance_cents?: number };
      if (!betRes.ok) {
        setError(betJson.error ?? "Failed to place AI entry fee.");
        return;
      }
      if (typeof betJson.balance_cents === "number") setWalletCents(betJson.balance_cents);
    }
    resetFightState();
    setFightActive(true);
    setCameraPreset("ringside");
  }, [activeFighter, entryFeeCents, resetFightState, walletCents]);

  const createFighter = useCallback(async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/fighters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Fighter ${fighters.length + 1}` }),
    });
    const data = (await res.json().catch(() => ({}))) as { fighter?: FighterRecord; error?: string };
    if (!res.ok || !data.fighter) {
      setError(data.error ?? "Failed to create fighter.");
      setSaving(false);
      return;
    }
    setFighters((prev) => [...prev, data.fighter!]);
    setActiveId(data.fighter.id);
    setSaving(false);
  }, [fighters.length]);

  const updateActiveFighter = useCallback(
    async (updates: Record<string, unknown>) => {
      if (!activeFighter) return;
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/fighters/${activeFighter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = (await res.json().catch(() => ({}))) as { fighter?: FighterRecord; error?: string };
      if (!res.ok || !data.fighter) {
        setError(data.error ?? "Failed to update fighter.");
        setSaving(false);
        return;
      }
      setFighters((prev) => prev.map((f) => (f.id === data.fighter!.id ? data.fighter! : f)));
      setSaving(false);
    },
    [activeFighter]
  );

  const buyCosmetic = useCallback(
    async (item: (typeof COSMETIC_SHOP)[number]) => {
      if (!activeFighter) return;
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/fighters/${activeFighter.id}/cosmetics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          slot: item.slot,
          color: item.color,
          cost_cents: item.costCents,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        fighter?: FighterRecord;
        balance_cents?: number;
        error?: string;
      };
      if (!res.ok || !data.fighter) {
        setError(data.error ?? "Failed to buy cosmetic.");
        setSaving(false);
        return;
      }
      setFighters((prev) => prev.map((f) => (f.id === data.fighter!.id ? data.fighter! : f)));
      if (typeof data.balance_cents === "number") setWalletCents(data.balance_cents);
      setSaving(false);
    },
    [activeFighter]
  );

  const runDrill = useCallback(
    async (drillId: string, action: BoxerAction) => {
      if (!activeFighter) return;
      setSaving(true);
      setError(null);
      setMessage(null);
      setPlayerAction(action);
      setTimeout(() => setPlayerAction("idle"), 360);
      const res = await fetch("/api/training/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighter_id: activeFighter.id, drill: drillId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        fighter?: FighterRecord;
        balance_cents?: number;
        error?: string;
      };
      if (!res.ok || !data.fighter) {
        setError(data.error ?? "Training failed.");
        setSaving(false);
        return;
      }
      setFighters((prev) => prev.map((f) => (f.id === data.fighter!.id ? data.fighter! : f)));
      if (typeof data.balance_cents === "number") setWalletCents(data.balance_cents);
      setMessage("Training complete. Stats increased.");
      setSaving(false);
    },
    [activeFighter]
  );

  const queueMatchmaking = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/boxing/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryFeeCents: Math.max(100, entryFeeCents || 100) }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      match?: { id: string };
      outcome?: string;
    };
    if (!res.ok || !data.match?.id) {
      setError(data.message ?? "Unable to queue for match.");
      return;
    }
    setQueuedMatchId(data.match.id);
    setMessage(`Matchmaking ${data.outcome ?? "queued"} for match ${data.match.id.slice(0, 8)}…`);
  }, [entryFeeCents]);

  const joinTournament = useCallback(async (id: string) => {
    setError(null);
    const res = await fetch("/api/tournaments/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId: id }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; success?: boolean };
    if (!res.ok) {
      setError(data.message ?? "Unable to join tournament.");
      return;
    }
    setMessage("Tournament entry successful.");
    await refreshData();
  }, [refreshData]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-fintech-bg-card p-6">
        <p className="text-fintech-muted">Loading professional boxing module…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-fintech-bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {SECTION_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                section === s ? "bg-fintech-accent text-white" : "bg-white/5 text-fintech-muted hover:bg-white/10 hover:text-white"
              }`}
            >
              {SECTION_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {(error || message || resultText) && (
        <div className="space-y-2">
          {error && <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-3 text-sm text-red-200">{error}</div>}
          {message && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div>}
          {resultText && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">{resultText}</div>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.35fr,1fr]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#070b15]">
          <BoxingWorld
            mode={section === "training" ? "training" : "arena"}
            cameraPreset={cameraPreset}
            slowMo={slowMo}
            player={activeFighter}
            playerAction={playerAction}
            opponent={aiOpponent}
            opponentAction={opponentAction}
          />
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-fintech-bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">Wallet</h3>
              <span className="text-lg font-bold text-white">{money(walletCents)}</span>
            </div>
            {activeFighter ? (
              <div className="mt-3 space-y-2 text-sm text-fintech-muted">
                <p className="font-semibold text-white">{activeFighter.name}</p>
                <p>
                  Record: <span className="text-fintech-highlight">{activeFighter.wins}</span>W /{" "}
                  <span className="text-red-300">{activeFighter.losses}</span>L
                </p>
                <p>
                  Level {activeFighter.level} · EXP {activeFighter.experience}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-fintech-muted">Create your first fighter to begin.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-fintech-bg-card p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">
              Health & Stamina
            </h3>
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs text-fintech-muted">
                  <span>Your health</span>
                  <span>{Math.round(playerHealth)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-red-500 transition-all" style={{ width: `${playerHealth}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-fintech-muted">
                  <span>Your stamina</span>
                  <span>{Math.round(playerStamina)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${playerStamina}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-fintech-muted">
                  <span>Opponent health</span>
                  <span>{Math.round(opponentHealth)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${opponentHealth}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-fintech-muted">
                  <span>Opponent stamina</span>
                  <span>{Math.round(opponentStamina)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-cyan-500 transition-all" style={{ width: `${opponentStamina}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {section === "arena" && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-fintech-bg-card p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm text-fintech-muted">
              AI behavior
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                value={aiStyle}
                onChange={(e) => setAiStyle(e.target.value as AIStyle)}
              >
                <option value="aggressive">Aggressive</option>
                <option value="balanced">Balanced</option>
                <option value="defensive">Defensive</option>
              </select>
            </label>
            <label className="text-sm text-fintech-muted">
              Difficulty
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Champion</option>
              </select>
            </label>
            <label className="text-sm text-fintech-muted">
              Camera
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                value={cameraPreset}
                onChange={(e) => setCameraPreset(e.target.value as CameraPreset)}
              >
                <option value="ringside">Ringside camera</option>
                <option value="over-shoulder">Over shoulder camera</option>
                <option value="cinematic">Cinematic orbit</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr,1fr,1fr]">
            <label className="text-sm text-fintech-muted">
              AI Entry Fee (optional)
              <input
                type="number"
                min={0}
                value={entryFeeCents}
                onChange={(e) => setEntryFeeCents(clamp(Number(e.target.value) || 0, 0, 100000))}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            <button
              type="button"
              onClick={startAiFight}
              disabled={fightActive || !activeFighter}
              className="rounded-xl bg-fintech-accent px-4 py-3 font-semibold text-white disabled:opacity-40"
            >
              {fightActive ? "Fight in progress…" : "Fight AI"}
            </button>
            <button
              type="button"
              onClick={queueMatchmaking}
              className="rounded-xl bg-amber-500/90 px-4 py-3 font-semibold text-black hover:bg-amber-400"
            >
              Enter Matchmaking
            </button>
          </div>

          {queuedMatchId && (
            <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-fintech-muted">
              Match ID: <span className="font-mono text-white">{queuedMatchId}</span>.{" "}
              <Link className="text-fintech-accent underline" href={`/dashboard/games/boxing/live?match=${queuedMatchId}`}>
                Open live match view
              </Link>
              {" "}or{" "}
              <Link className="text-fintech-accent underline" href="/dashboard/fight-arena/lobby">
                switch to PvP lobby
              </Link>
              .
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            {(["jab", "cross", "hook", "uppercut", "block", "dodge"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => performPlayerAction(a)}
                disabled={!fightActive}
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {a.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {section === "training" && (
        <div className="rounded-2xl border border-white/10 bg-fintech-bg-card p-4">
          <h3 className="text-lg font-semibold text-white">Training Gym</h3>
          <p className="mt-1 text-sm text-fintech-muted">
            Use wallet funds to run drills and increase speed, power, defense, stamina, and experience.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {DRILL_DEFS.map((drill) => (
              <button
                key={drill.id}
                type="button"
                onClick={() => runDrill(drill.id, drill.action)}
                disabled={saving || !activeFighter}
                className="rounded-xl border border-white/15 bg-black/30 p-4 text-left hover:border-fintech-accent/50"
              >
                <p className="font-semibold text-white">{drill.title}</p>
                <p className="mt-1 text-xs text-fintech-muted">{drill.gain}</p>
                <p className="mt-2 text-sm text-amber-300">Cost: {money(drill.costCents)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {section === "fighter" && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-fintech-bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">My Fighter</h3>
            <button
              type="button"
              onClick={createFighter}
              disabled={saving}
              className="rounded-lg bg-fintech-accent px-3 py-2 text-sm font-semibold text-white"
            >
              + Create Fighter
            </button>
            {fighters.length > 0 && (
              <select
                value={activeFighter?.id ?? ""}
                onChange={(e) => setActiveId(e.target.value)}
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
              >
                {fighters.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.gender})
                  </option>
                ))}
              </select>
            )}
          </div>

          {activeFighter && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-fintech-muted">
                  Name
                  <input
                    defaultValue={activeFighter.name}
                    onBlur={(e) => updateActiveFighter({ name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-fintech-muted">
                  Gender
                  <select
                    value={activeFighter.gender}
                    onChange={(e) => updateActiveFighter({ gender: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>
                <label className="text-sm text-fintech-muted">
                  Skin tone
                  <select
                    value={activeFighter.skin_tone}
                    onChange={(e) => updateActiveFighter({ skin_tone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                  >
                    <option value="fair">Fair</option>
                    <option value="light">Light</option>
                    <option value="medium">Medium</option>
                    <option value="tan">Tan</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label className="text-sm text-fintech-muted">
                  Gloves color
                  <input
                    value={activeFighter.gloves_color}
                    onChange={(e) =>
                      setFighters((prev) =>
                        prev.map((f) =>
                          f.id === activeFighter.id ? { ...f, gloves_color: e.target.value.toLowerCase() } : f
                        )
                      )
                    }
                    onBlur={(e) => updateActiveFighter({ gloves_color: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-fintech-muted">
                  Shorts color
                  <input
                    value={activeFighter.shorts_color}
                    onChange={(e) =>
                      setFighters((prev) =>
                        prev.map((f) =>
                          f.id === activeFighter.id ? { ...f, shorts_color: e.target.value.toLowerCase() } : f
                        )
                      )
                    }
                    onBlur={(e) => updateActiveFighter({ shorts_color: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-fintech-muted">
                  Shoes color
                  <input
                    value={activeFighter.shoes_color}
                    onChange={(e) =>
                      setFighters((prev) =>
                        prev.map((f) =>
                          f.id === activeFighter.id ? { ...f, shoes_color: e.target.value.toLowerCase() } : f
                        )
                      )
                    }
                    onBlur={(e) => updateActiveFighter({ shoes_color: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">Cosmetic Store</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {COSMETIC_SHOP.map((item) => {
                    const owned = activeFighter.owned_cosmetics?.[item.id] === true;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => buyCosmetic(item)}
                        disabled={saving}
                        className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-left hover:border-fintech-accent/50"
                      >
                        <p className="text-sm font-semibold text-white">{item.label}</p>
                        <p className="text-xs text-fintech-muted">{owned ? "Owned · tap to equip" : money(item.costCents)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {section === "leaderboard" && (
        <div className="rounded-2xl border border-white/10 bg-fintech-bg-card p-4">
          <h3 className="text-lg font-semibold text-white">Boxing Leaderboard</h3>
          <p className="mt-1 text-sm text-fintech-muted">Wins, losses, knockouts, and earnings from arena fights.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-fintech-muted">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Fighter</th>
                  <th className="py-2 pr-3 text-right">W</th>
                  <th className="py-2 pr-3 text-right">L</th>
                  <th className="py-2 pr-3 text-right">KO</th>
                  <th className="py-2 text-right">Earnings</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={`${row.rank}-${row.email}`} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-amber-300">{row.rank}</td>
                    <td className="py-2 pr-3 text-white">{row.email}</td>
                    <td className="py-2 pr-3 text-right text-green-300">{row.wins}</td>
                    <td className="py-2 pr-3 text-right text-red-300">{row.losses}</td>
                    <td className="py-2 pr-3 text-right text-white">{row.knockouts}</td>
                    <td className="py-2 text-right text-emerald-300">{money(row.total_earnings_cents)}</td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-fintech-muted">
                      No ranking data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "tournaments" && (
        <div className="rounded-2xl border border-white/10 bg-fintech-bg-card p-4">
          <h3 className="text-lg font-semibold text-white">Tournament Mode</h3>
          <p className="mt-1 text-sm text-fintech-muted">
            Join tournaments from your wallet. Prize pools are funded from entry fees.
          </p>
          <div className="mt-4 space-y-3">
            {tournaments.map((t) => (
              <div key={t.id} className="rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{t.name}</p>
                    <p className="text-sm text-fintech-muted">
                      Entry: {money(Math.round(Number(t.entry_fee) * 100))} · Prize pool: {money(Math.round(Number(t.prize_pool) * 100))}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => joinTournament(t.id)}
                    className="rounded-lg bg-fintech-accent px-4 py-2 text-sm font-semibold text-white"
                  >
                    Join
                  </button>
                </div>
              </div>
            ))}
            {tournaments.length === 0 && <p className="text-sm text-fintech-muted">No open boxing tournaments right now.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

