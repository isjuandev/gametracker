import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', id)
    .single();

  if (gameError) {
    return new Response(JSON.stringify({ error: 'Juego no encontrado' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get time entries for this game
  const { data: entries, error: entriesError } = await supabase
    .from('time_entries')
    .select('*')
    .eq('game_id', id)
    .order('played_at', { ascending: false });

  if (entriesError) {
    return new Response(JSON.stringify({ error: entriesError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const totalSeconds = (entries || []).reduce((sum, e) => sum + e.total_seconds, 0);

  return new Response(
    JSON.stringify({
      ...game,
      total_seconds: totalSeconds,
      entries_count: (entries || []).length,
      entries: entries || [],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

export const PUT: APIRoute = async ({ params, request }) => {
  const { id } = params;
  const body = await request.json();
  const { name, cover_url, status } = body;

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updateData.name = name.trim();
  if (cover_url !== undefined) updateData.cover_url = cover_url || null;
  if (status !== undefined) updateData.status = status;

  const { data, error } = await supabase
    .from('games')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;

  const { error } = await supabase.from('games').delete().eq('id', id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
