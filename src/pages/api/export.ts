import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async () => {
  try {
    const { data: games } = await supabase.from('games').select('*').order('name');
    const { data: entries } = await supabase.from('time_entries').select('*').order('played_at', { ascending: false });

    return new Response(
      JSON.stringify({
        exported_at: new Date().toISOString(),
        total_games: games?.length || 0,
        total_entries: entries?.length || 0,
        games: games || [],
        time_entries: entries || [],
      }, null, 2),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="gametracker_backup_${new Date().toISOString().split('T')[0]}.json"`,
        },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error al exportar datos' }), { status: 500 });
  }
};
