import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;

  const { error } = await supabase.from('time_entries').delete().eq('id', id);

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
