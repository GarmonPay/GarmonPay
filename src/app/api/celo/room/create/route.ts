import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();

    const sessionClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // Cookie updates may be unavailable in some contexts
            }
          },
        },
      }
    );

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const {
      data: { session },
    } = await sessionClient.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { name, max_players, minimum_entry_sc, starting_bank_sc } = body;

    console.log("Create room:", {
      name,
      max_players,
      minimum_entry_sc,
      starting_bank_sc,
      userId: session.user.id,
    });

    if (!name?.trim()) {
      return NextResponse.json({ error: "Room name is required" }, { status: 400 });
    }

    if (![2, 4, 6, 10].includes(Number(max_players))) {
      return NextResponse.json({ error: "Max players must be 2, 4, 6, or 10" }, { status: 400 });
    }

    const minEntry = Number(minimum_entry_sc);
    const startBank = Number(starting_bank_sc);

    if (!minEntry || minEntry < 500) {
      return NextResponse.json({ error: "Minimum entry must be at least 500 GPC ($5)" }, { status: 400 });
    }

    if (!startBank || startBank < minEntry) {
      return NextResponse.json({ error: "Starting bank must be at least the minimum entry" }, { status: 400 });
    }

    if (startBank % minEntry !== 0) {
      return NextResponse.json({ error: "Starting bank must be a multiple of minimum entry" }, { status: 400 });
    }

    const { data: user, error: userError } = await adminClient
      .from("users")
      .select("gpay_coins")
      .eq("id", session.user.id)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", userError);
      return NextResponse.json({ error: "Could not fetch balance" }, { status: 500 });
    }

    const coins = (user as { gpay_coins?: number }).gpay_coins ?? 0;
    console.log("Balance check:", { has: coins, needs: startBank });

    if (coins < startBank) {
      return NextResponse.json(
        {
          error: `Insufficient GPay Coins. You have ${coins} GPC but need ${startBank} GPC`,
        },
        { status: 400 }
      );
    }

    const { error: deductError } = await adminClient
      .from("users")
      .update({
        gpay_coins: coins - startBank,
      })
      .eq("id", session.user.id);

    if (deductError) {
      console.error("Deduct error:", deductError);
      return NextResponse.json({ error: "Failed to reserve funds" }, { status: 500 });
    }

    const { data: room, error: roomError } = await adminClient
      .from("celo_rooms")
      .insert({
        name: String(name).trim(),
        creator_id: session.user.id,
        banker_id: session.user.id,
        status: "waiting",
        room_type: "public",
        max_players: Number(max_players),
        minimum_entry_sc: minEntry,
        current_bank_sc: startBank,
        platform_fee_pct: 10,
        last_round_was_celo: false,
        total_rounds: 0,
        last_activity: new Date().toISOString(),
      })
      .select()
      .single();

    if (roomError || !room) {
      console.error("Room create error:", roomError);

      await adminClient.from("users").update({ gpay_coins: coins }).eq("id", session.user.id);

      return NextResponse.json(
        {
          error: "Failed to create room: " + (roomError?.message || "Unknown error"),
        },
        { status: 500 }
      );
    }

    const { error: playerError } = await adminClient.from("celo_room_players").insert({
      room_id: (room as { id: string }).id,
      user_id: session.user.id,
      role: "banker",
      seat_number: 0,
      entry_sc: 0,
      dice_type: "standard",
    });

    if (playerError) {
      console.error("Player insert error:", playerError);
    }

    console.log("Room created successfully:", (room as { id: string }).id);

    return NextResponse.json({
      room,
      message: "Room created successfully",
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error: " + String(err) }, { status: 500 });
  }
}
