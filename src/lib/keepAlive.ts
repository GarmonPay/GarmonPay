const FIGHT_SERVER = process.env.NEXT_PUBLIC_FIGHT_SERVER_URL;

export function startKeepAlive() {
  if (typeof window === "undefined") return;

  const ping = async () => {
    try {
      await fetch(`${FIGHT_SERVER}/health`);
      console.log("Fight server alive");
    } catch (e) {
      console.log("Fight server ping failed");
    }
  };

  if (!FIGHT_SERVER) return;

  ping();
  setInterval(ping, 14 * 60 * 1000);
}
