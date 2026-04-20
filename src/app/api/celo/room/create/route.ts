import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Cookie updates may be unavailable in some contexts
            }
          },
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { name, max_players, minimum_entry_sc, starting_bank_sc } = body;

    console.log("Create room request:", {
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

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("gpay_coins")
      .eq("id", session.user.id)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", userError);
      return NextResponse.json({ error: "Could not fetch balance" }, { status: 500 });
    }

    const balance = Number((user as { gpay_coins?: number }).gpay_coins ?? 0);
    console.log("User balance:", balance, "Need:", startBank);

    if (balance < startBank) {
      return NextResponse.json(
        {
          error: `Insufficient GPay Coins. You have ${balance} GPC but need ${startBank} GPC`,
        },
        { status: 400 }
      );
    }

    const { error: deductError } = await supabase
      .from("users")
      .update({
        gpay_coins: balance - startBank,
      })
      .eq("id", session.user.id);

    if (deductError) {
      console.error("Deduct error:", deductError);
      return NextResponse.json({ error: "Failed to reserve funds" }, { status: 500 });
    }

    const { data: room, error: roomError } = await supabase
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
      console.error("Room insert error:", roomError);

      await supabase
        .from("users")
        .update({
          gpay_coins: balance,
        })
        .eq("id", session.user.id);

      return NextResponse.json(
        {
          error: "Failed to create room: " + (roomError?.message || "Unknown error"),
        },
        { status: 500 }
      );
    }

    await supabase.from("celo_room_players").insert({
      room_id: (room as { id: string }).id,
      user_id: session.user.id,
      role: "banker",
      seat_number: 0,
      entry_sc: 0,
      dice_type: "standard",
    });

    console.log("Room created:", (room as { id: string }).id);

    return NextResponse.json({
      room,
      message: "Room created successfully",
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error: " + String(err) }, { status: 500 });
  }
}
