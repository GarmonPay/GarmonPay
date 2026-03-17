"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { getApiRoot } from "@/lib/api";
import { BoxingRing } from "@/components/arena/BoxingRing";
import type { FighterData } from "@/lib/arena-fighter-types";

type StoreItem = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price: number | null;
  coin_price: number | null;
  stat_bonuses: Record<string, number>;
  effect_class: string | null;
  emoji: string | null;
};

type InventoryEntry = {
  id: string;
  storeItemId: string;
  item: StoreItem | undefined;
  equipped: boolean;
};

export default function ArenaStorePage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [equipped, setEquipped] = useState<Record<string, string>>({});
  const [arenaCoins, setArenaCoins] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [fighter, setFighter] = useState<FighterData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const s = await getSessionAsync();
      if (!s) {
        setLoading(false);
        router.replace("/login?next=/dashboard/arena/store");
        return;
      }
      setSession(s);
      const token = s.accessToken ?? s.userId;
      const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
      const [itemsRes, invRes, meRes] = await Promise.all([
      fetch(`${getApiRoot()}/arena/store/items`, { headers, credentials: "include" }),
      fetch(`${getApiRoot()}/arena/store/inventory`, { headers, credentials: "include" }),
      fetch(`${getApiRoot()}/arena/me`, { headers, credentials: "include" }),
    ]);
    const itemsData = itemsRes.ok ? await itemsRes.json() : null;
    const invData = invRes.ok ? await invRes.json() : null;
    const meData = meRes.ok ? await meRes.json() : null;
    if (itemsData?.items) {
      setItems(itemsData.items);
      setCategories(itemsData.categories ?? []);
    }
    if (invData?.inventory) setInventory(invData.inventory);
    if (invData?.equipped) setEquipped(invData.equipped || {});
    if (typeof invData?.arenaCoins === "number") setArenaCoins(invData.arenaCoins);
    if (meData?.fighter) setFighter(meData.fighter);
    } catch {
      setError("Unable to load store.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBuyStripe = async (item: StoreItem) => {
    if (!session || !(Number(item.price) > 0)) return;
    setError(null);
    setBuying(item.id);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }),
    };
    try {
      const res = await fetch(`${getApiRoot()}/arena/store/checkout`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ storeItemId: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Checkout failed");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Network error");
    } finally {
      setBuying(null);
    }
  };

  const handleBuyCoins = async (item: StoreItem) => {
    if (!session || !(Number(item.coin_price) > 0)) return;
    setError(null);
    setBuying(item.id);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }),
    };
    try {
      const res = await fetch(`${getApiRoot()}/arena/store/buy`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ storeItemId: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Purchase failed");
        return;
      }
      if (typeof data.arenaCoins === "number") setArenaCoins(data.arenaCoins);
      fetchData();
    } catch {
      setError("Network error");
    } finally {
      setBuying(null);
    }
  };

  const handleEquip = async (slot: string, storeItemId: string | null) => {
    if (!session) return;
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }),
    };
    const res = await fetch(`${getApiRoot()}/arena/fighter/equip`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ slot, storeItemId }),
    });
    if (res.ok) {
      fetchData();
      const meRes = await fetch(`${getApiRoot()}/arena/me`, { headers, credentials: "include" });
      const meData = meRes.ok ? await meRes.json() : null;
      if (meData?.fighter) setFighter(meData.fighter);
    }
  };

  const ownedIds = new Set(inventory.map((i) => i.storeItemId));
  const equippedByItemId: Record<string, string> = {};
  if (equipped.gloves) equippedByItemId[equipped.gloves] = "gloves";
  if (equipped.shoes) equippedByItemId[equipped.shoes] = "shoes";
  if (equipped.shorts) equippedByItemId[equipped.shorts] = "shorts";
  if (equipped.headgear) equippedByItemId[equipped.headgear] = "headgear";

  const filtered = selectedCategory ? items.filter((i) => i.category === selectedCategory) : items;
  const byCategory = categories.length ? categories : Array.from(new Set(items.map((i) => i.category)));

  if (loading) {
    return (
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        <p className="text-[#9ca3af]">Loading…</p>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        <p className="text-[#9ca3af]">Redirecting to login…</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Arena Store</h1>
        <div className="flex items-center gap-4">
          {arenaCoins != null && <span className="text-[#9ca3af]">Coins: <span className="text-white font-medium">{arenaCoins}</span></span>}
          <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {fighter && (
        <div className="min-h-[200px] mb-6 rounded-lg overflow-hidden border border-white/10">
          <p className="text-[#9ca3af] text-sm text-center py-2 bg-[#0d1117] border-b border-white/10">Your fighter — gear updates when you equip</p>
          <BoxingRing mode="profile" fighterA={fighter} animation="idle" />
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1 rounded-lg text-sm ${selectedCategory === null ? "bg-[#f0a500] text-black" : "bg-[#0d1117] text-white border border-white/20"}`}
        >
          All
        </button>
        {byCategory.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setSelectedCategory(c)}
            className={`px-3 py-1 rounded-lg text-sm ${selectedCategory === c ? "bg-[#f0a500] text-black" : "bg-[#0d1117] text-white border border-white/20"}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const owned = ownedIds.has(item.id);
          const equipSlot = equippedByItemId[item.id];
          const canBuyStripe = Number(item.price) > 0;
          const canBuyCoins = Number(item.coin_price) > 0 && (arenaCoins ?? 0) >= Number(item.coin_price);
          const isEffect = ["recovery", "title", "training_camp", "coins"].includes(item.effect_class || "");
          return (
            <div key={item.id} className="rounded-lg bg-[#0d1117] border border-white/10 p-4">
              <p className="text-[#9ca3af] text-sm">{item.category}</p>
              <p className="font-semibold text-white flex items-center gap-2">
                <span>{item.emoji ?? "📦"}</span> {item.name}
              </p>
              {item.description && <p className="text-[#9ca3af] text-sm mt-1">{item.description}</p>}
              {item.stat_bonuses && Object.keys(item.stat_bonuses).length > 0 && (
                <p className="text-[#86efac] text-xs mt-1">
                  {Object.entries(item.stat_bonuses).map(([k, v]) => `+${v} ${k}`).join(", ")}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {owned && !isEffect && (
                  <>
                    <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">Owned</span>
                    {equipSlot && <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">Equipped ({equipSlot})</span>}
                    {["Gloves", "Shoes", "Shorts", "Headgear"].includes(item.category) && (
                      <button
                        type="button"
                        onClick={() => handleEquip(item.category === "Gloves" ? "gloves" : item.category === "Shoes" ? "shoes" : item.category === "Shorts" ? "shorts" : "headgear", equipSlot ? null : item.id)}
                        className="text-xs px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20"
                      >
                        {equipSlot ? "Unequip" : "Equip"}
                      </button>
                    )}
                  </>
                )}
                {owned && (item.effect_class === "recovery" || item.effect_class === "title") && <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">Applied</span>}
                {!owned && canBuyStripe && (
                  <button
                    type="button"
                    disabled={buying !== null}
                    onClick={() => handleBuyStripe(item)}
                    className="text-sm px-3 py-1 rounded bg-[#635bff] text-white hover:bg-[#524ae0] disabled:opacity-50"
                  >
                    {buying === item.id ? "…" : `$${Number(item.price).toFixed(2)}`}
                  </button>
                )}
                {!owned && canBuyCoins && (
                  <button
                    type="button"
                    disabled={buying !== null}
                    onClick={() => handleBuyCoins(item)}
                    className="text-sm px-3 py-1 rounded bg-[#f0a500] text-black hover:bg-[#e09500] disabled:opacity-50"
                  >
                    {buying === item.id ? "…" : `${item.coin_price} coins`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <p className="text-[#9ca3af]">No items in this category.</p>}
    </div>
  );
}