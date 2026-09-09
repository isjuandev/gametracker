import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const GET: APIRoute = async () => {
  // Get all games with aggregated time stats
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('*')
    .order('updated_at', { ascending: false });

  if (gamesError) {
    return new Response(JSON.stringify({ error: gamesError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get time totals per game
  const { data: timeTotals, error: timeError } = await supabase
    .from('time_entries')
    .select('game_id, total_seconds');

  if (timeError) {
    return new Response(JSON.stringify({ error: timeError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Aggregate totals per game
  const totalsMap = new Map<string, { total_seconds: number; entries_count: number }>();
  for (const entry of timeTotals || []) {
    const current = totalsMap.get(entry.game_id) || { total_seconds: 0, entries_count: 0 };
    current.total_seconds += entry.total_seconds;
    current.entries_count += 1;
    totalsMap.set(entry.game_id, current);
  }

  const gamesWithStats = (games || []).map((game) => {
    const stats = totalsMap.get(game.id) || { total_seconds: 0, entries_count: 0 };
    return { ...game, ...stats };
  });

  return new Response(JSON.stringify(gamesWithStats), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { name, cover_url, status } = body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return new Response(JSON.stringify({ error: 'El nombre del juego es obligatorio' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await supabase
    .from('games')
    .insert({
      name: name.trim(),
      cover_url: cover_url || null,
      status: status || 'playing',
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
