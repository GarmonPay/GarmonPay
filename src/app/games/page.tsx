import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export default function GamesPage() {
  return (
    <div className="w-full max-w-full pb-2" style={{ background: "#0e0118" }}>
      <h1
        className={cinzel.className}
        style={{
          color: "#F5C842",
          fontSize: "24px",
          marginBottom: "24px",
          textAlign: "center",
        }}
      >
        GAMES
      </h1>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <Link href="/dashboard/games/celo">
          <div
            style={{
              background: "linear-gradient(135deg, #1a0a2e, #2d1060)",
              border: "1px solid #7C3AED",
              borderRadius: "16px",
              padding: "24px",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>🎲</div>
            <h2
              style={{
                color: "#fff",
                fontSize: "22px",
                fontWeight: "bold",
                marginBottom: "4px",
              }}
            >
              C-Lo
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: "14px",
                marginBottom: "12px",
              }}
            >
              Street dice. Run the bank. GPay Coins in play.
            </p>
            <span
              style={{
                background: "#10B981",
                color: "#fff",
                fontSize: "11px",
                padding: "4px 10px",
                borderRadius: "20px",
                fontWeight: "bold",
              }}
            >
              ● LIVE
            </span>
          </div>
        </Link>
        <Link href="/dashboard/coinflip">
          <div
            style={{
              background: "linear-gradient(135deg, #1a1a00, #3d3d00)",
              border: "1px solid #F5C842",
              borderRadius: "16px",
              padding: "24px",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>🪙</div>
            <h2
              style={{
                color: "#fff",
                fontSize: "22px",
                fontWeight: "bold",
                marginBottom: "4px",
              }}
            >
              Coin Flip
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: "14px",
                marginBottom: "12px",
              }}
            >
              Heads or tails. 50/50 shot. Double your $GPAY.
            </p>
            <span
              style={{
                background: "#10B981",
                color: "#fff",
                fontSize: "11px",
                padding: "4px 10px",
                borderRadius: "20px",
                fontWeight: "bold",
              }}
            >
              ● LIVE
            </span>
          </div>
        </Link>

        <div
          style={{
            background: "linear-gradient(135deg, #0a0a0a, #1a1a1a)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "16px",
            padding: "24px",
            opacity: 0.6,
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>⚔️</div>
          <h2
            style={{
              color: "#fff",
              fontSize: "22px",
              fontWeight: "bold",
              marginBottom: "4px",
            }}
          >
            Arena Fighter
          </h2>
          <p
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: "14px",
              marginBottom: "12px",
            }}
          >
            Build your fighter. Enter tournaments. Win big $GPAY prizes.
          </p>
          <span
            style={{
              background: "rgba(124,58,237,0.3)",
              color: "#7C3AED",
              fontSize: "11px",
              padding: "4px 10px",
              borderRadius: "20px",
              fontWeight: "bold",
            }}
          >
            COMING SOON
          </span>
        </div>
      </div>
    </div>
  );
}
