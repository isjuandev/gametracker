import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { getLocalDateStr } from '../../../types/database';

export const GET: APIRoute = async ({ url }) => {
  const gameId = url.searchParams.get('game_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let query = supabase
    .from('time_entries')
    .select('*, games(name)')
    .order('played_at', { ascending: false });

  if (gameId) {
    query = query.eq('game_id', gameId);
  }
  if (from) {
    query = query.gte('played_at', from);
  }
  if (to) {
    query = query.lte('played_at', to);
  }

  const { data, error } = await query;

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

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { game_id, hours, minutes, seconds, played_at, note } = body;

  if (!game_id) {
    return new Response(JSON.stringify({ error: 'game_id es obligatorio' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const todayStr = getLocalDateStr(new Date());
  const entryDate = played_at || todayStr;

  if (entryDate > todayStr) {
    return new Response(JSON.stringify({ error: 'No se permiten registrar fechas futuras' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const h = Math.max(0, parseInt(hours) || 0);
  const m = Math.max(0, Math.min(59, parseInt(minutes) || 0));
  const s = Math.max(0, Math.min(59, parseInt(seconds) || 0));

  if (h === 0 && m === 0 && s === 0) {
    return new Response(JSON.stringify({ error: 'El tiempo debe ser mayor a 0' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      game_id,
      hours: h,
      minutes: m,
      seconds: s,
      played_at: entryDate,
      note: note || null,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update the game's updated_at timestamp
  await supabase
    .from('games')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', game_id);

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
