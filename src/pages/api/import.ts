import type { APIRoute } from 'astro';
import { parseXLSXBuffer } from '../../lib/xlsx-parser';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ error: 'No se enviaron archivos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let totalEntries: Array<{
      gameName: string;
      hours: number;
      minutes: number;
      seconds: number;
      playedAt: string;
      note: string;
    }> = [];
    const allSheetsParsed: string[] = [];
    const allErrors: string[] = [];
    const allGames: Set<string> = new Set();

    // Parse all files
    for (const file of files) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        allErrors.push(`"${file.name}" no es un archivo Excel válido`);
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = parseXLSXBuffer(buffer);

      totalEntries.push(...result.entries);
      allSheetsParsed.push(...result.sheetsParsed.map((s) => `${file.name} → ${s}`));
      allErrors.push(...result.errors);
      result.games.forEach((g) => allGames.add(g));
    }

    if (totalEntries.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No se encontraron entradas de tiempo válidas en los archivos',
          sheetsParsed: allSheetsParsed,
          errors: allErrors,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a preview request or actual import
    const action = formData.get('action') as string;

    if (action === 'preview') {
      // Just return what would be imported
      const summary = new Map<string, { totalHours: number; totalMinutes: number; entries: number }>();
      for (const entry of totalEntries) {
        const current = summary.get(entry.gameName) || { totalHours: 0, totalMinutes: 0, entries: 0 };
        current.totalHours += entry.hours;
        current.totalMinutes += entry.minutes;
        current.entries += 1;
        summary.set(entry.gameName, current);
      }

      const gameSummaries = Array.from(summary.entries()).map(([name, stats]) => {
        const totalMins = stats.totalHours * 60 + stats.totalMinutes;
        return {
          name,
          totalHours: Math.floor(totalMins / 60),
          totalMinutes: totalMins % 60,
          entriesCount: stats.entries,
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          preview: true,
          totalEntries: totalEntries.length,
          games: gameSummaries,
          sheetsParsed: allSheetsParsed,
          errors: allErrors,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ACTUAL IMPORT
    // Step 1: Get or create games
    const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

    const { data: existingGames } = await supabase.from('games').select('id, name');
    const gameMap = new Map<string, string>(); // normalized name -> id

    for (const game of existingGames || []) {
      gameMap.set(normalize(game.name), game.id);
    }

    // Create missing games (deduplicated by normalized name)
    const seenNormalized = new Set<string>();
    const gamesToCreate: string[] = [];
    for (const name of allGames) {
      const key = normalize(name);
      if (!gameMap.has(key) && !seenNormalized.has(key)) {
        seenNormalized.add(key);
        gamesToCreate.push(name);
      }
    }

    if (gamesToCreate.length > 0) {
      const { data: newGames, error: createError } = await supabase
        .from('games')
        .insert(gamesToCreate.map((name) => ({ name, status: 'playing' })))
        .select('id, name');

      if (createError) {
        return new Response(
          JSON.stringify({ error: `Error creando juegos: ${createError.message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      for (const game of newGames || []) {
        gameMap.set(normalize(game.name), game.id);
      }
    }

    // Step 2: Insert time entries in batches
    const timeEntries = totalEntries.map((entry) => ({
      game_id: gameMap.get(normalize(entry.gameName)),
      hours: entry.hours,
      minutes: entry.minutes,
      seconds: entry.seconds,
      played_at: entry.playedAt,
      note: entry.note,
    })).filter((e) => e.game_id); // Filter out entries without a matching game

    let insertedCount = 0;
    const batchSize = 100;
    const insertErrors: string[] = [];

    for (let i = 0; i < timeEntries.length; i += batchSize) {
      const batch = timeEntries.slice(i, i + batchSize);
      const { error } = await supabase.from('time_entries').insert(batch);

      if (error) {
        insertErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        insertedCount += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        preview: false,
        totalEntries: totalEntries.length,
        insertedEntries: insertedCount,
        gamesCreated: gamesToCreate.length,
        sheetsParsed: allSheetsParsed,
        errors: [...allErrors, ...insertErrors],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `Error procesando archivos: ${err instanceof Error ? err.message : String(err)}`,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
