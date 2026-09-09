import XLSX from 'xlsx';

export interface ParsedTimeEntry {
  gameName: string;
  hours: number;
  minutes: number;
  seconds: number;
  playedAt: string; // YYYY-MM-DD
  note: string;
}

/**
 * Normalize a game name: trim, collapse multiple spaces, title-case consistency.
 * This ensures "Warzone ", "Warzone", "Spiderman  Miles Morales" all match.
 */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Parse a time string like "3 Horas 5 Minutos", "30 Minutos", "1 Hora", "2 Hora 10 Minutos"
 * Returns { hours, minutes } or null if time is not applicable
 */
function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  if (!timeStr || typeof timeStr !== 'string') return null;

  const cleaned = timeStr.trim();

  // Skip non-time entries
  if (
    cleaned === '' ||
    cleaned === 'NO APLICA' ||
    cleaned === 'NO' ||
    cleaned === 'DESCANSO' ||
    cleaned === 'VACACIONES' ||
    cleaned === 'NO APLICA ' ||
    cleaned.toUpperCase() === 'NO APLICA'
  ) {
    return null;
  }

  let hours = 0;
  let minutes = 0;

  // Match hours: "3 Horas", "1 Hora", "2 Hora"
  const hoursMatch = cleaned.match(/(\d+)\s*Horas?/i);
  if (hoursMatch) {
    hours = parseInt(hoursMatch[1], 10);
  }

  // Match minutes: "5 Minutos", "30 minutos"
  const minutesMatch = cleaned.match(/(\d+)\s*Minutos?/i);
  if (minutesMatch) {
    minutes = parseInt(minutesMatch[1], 10);
  }

  // If neither matched, it's not a valid time
  if (hours === 0 && minutes === 0) return null;

  return { hours, minutes };
}

/**
 * Convert Excel serial date number to YYYY-MM-DD string
 * Excel dates are days since 1899-12-30 (with the Lotus 1-2-3 bug)
 */
function excelDateToISO(serial: number): string {
  // Excel's epoch is Jan 0, 1900 (which is Dec 30, 1899)
  // Also account for the Lotus 1-2-3 bug where Feb 29, 1900 is treated as valid
  const utcDays = serial - 25569; // Days from Unix epoch (Jan 1, 1970)
  const date = new Date(utcDays * 86400000);
  return date.toISOString().split('T')[0];
}

/**
 * Parse "Anexo" column which contains additional games and times
 * Format: "Juego / Tiempo" or "Juego/Tiempo"
 * Examples: "Spiderman 1 / 3 Horas ", "Futbol/1 Hora 20 Minutos"
 */
function parseAnexo(
  anexo: string,
  date: string
): ParsedTimeEntry[] {
  if (!anexo || typeof anexo !== 'string') return [];

  const cleaned = anexo.trim();
  if (
    cleaned === '' ||
    cleaned === 'NO APLICA' ||
    cleaned === 'DESCANSO' ||
    cleaned === 'VACACIONES' ||
    cleaned.toUpperCase() === 'NO APLICA'
  ) {
    return [];
  }

  const entries: ParsedTimeEntry[] = [];

  // Split by newline or multiple entries in same cell (unlikely but handle)
  // The format is "GameName / Time" or "GameName/Time"
  // There might be multiple separated by newlines
  const lines = cleaned.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    // Try to split on "/" to get game name and time
    const slashIdx = line.indexOf('/');
    if (slashIdx === -1) continue;

    const gameName = line.substring(0, slashIdx).trim();
    const timeStr = line.substring(slashIdx + 1).trim();

    if (!gameName || gameName.toUpperCase() === 'NO APLICA') continue;

    const normalized = normalizeName(gameName);

    const time = parseTimeString(timeStr);
    if (time) {
      entries.push({
        gameName: normalized,
        hours: time.hours,
        minutes: time.minutes,
        seconds: 0,
        playedAt: date,
        note: 'Importado desde anexo XLSX',
      });
    }
  }

  return entries;
}

/**
 * Parse a "Cronograma" sheet from the XLSX file.
 * Structure: groups of 5 columns repeated 3 times across:
 *   [Fecha, Juego, Tiempo, Completado, Anexo]
 * Dates are in column 0, 5, 10 as Excel serial numbers.
 * When date is empty, the entry belongs to the last seen date.
 */
function parseCronogramaSheet(
  sheet: XLSX.WorkSheet,
  _sheetName: string
): ParsedTimeEntry[] {
  const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  });
  const entries: ParsedTimeEntry[] = [];

  // Process 3 column groups: [0-4], [5-9], [10-14]
  const groups = [
    { dateCol: 0, gameCol: 1, timeCol: 2, anexoCol: 4 },
    { dateCol: 5, gameCol: 6, timeCol: 7, anexoCol: 9 },
    { dateCol: 10, gameCol: 11, timeCol: 12, anexoCol: 14 },
  ];

  for (const group of groups) {
    let currentDate = '';

    // Start from row 2 (skip header row 0 and empty row 1)
    for (let rowIdx = 2; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      if (!row || row.length === 0) continue;

      // Check for date in this group
      const dateCell = row[group.dateCol];
      if (dateCell && typeof dateCell === 'number' && dateCell > 40000) {
        currentDate = excelDateToISO(dateCell);
      }

      if (!currentDate) continue;

      // Get game name
      const rawGameName = String(row[group.gameCol] || '').trim();
      if (
        !rawGameName ||
        rawGameName === 'NO APLICA' ||
        rawGameName === 'DESCANSO' ||
        rawGameName === 'VACACIONES' ||
        rawGameName.toUpperCase() === 'NO APLICA'
      ) {
        // Still check anexo even if main game is not applicable
        const anexoStr = String(row[group.anexoCol] || '').trim();
        if (anexoStr && currentDate) {
          entries.push(...parseAnexo(anexoStr, currentDate));
        }
        continue;
      }

      const gameName = normalizeName(rawGameName);

      // Parse time
      const timeStr = String(row[group.timeCol] || '').trim();
      const time = parseTimeString(timeStr);

      if (time) {
        entries.push({
          gameName,
          hours: time.hours,
          minutes: time.minutes,
          seconds: 0,
          playedAt: currentDate,
          note: 'Importado desde XLSX',
        });
      }

      // Parse anexo column for additional entries
      const anexoStr = String(row[group.anexoCol] || '').trim();
      if (anexoStr && currentDate) {
        entries.push(...parseAnexo(anexoStr, currentDate));
      }
    }
  }

  return entries;
}

/**
 * Parse an XLSX file buffer and extract all time entries from Cronograma sheets.
 */
export function parseXLSXBuffer(buffer: Buffer): {
  entries: ParsedTimeEntry[];
  games: string[];
  sheetsParsed: string[];
  errors: string[];
} {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const allEntries: ParsedTimeEntry[] = [];
  const sheetsParsed: string[] = [];
  const errors: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    // Only parse Cronograma sheets (they contain the detailed entries)
    // Skip "Tiempo" summary sheets
    if (!sheetName.toLowerCase().startsWith('cronograma')) {
      continue;
    }

    try {
      const sheet = workbook.Sheets[sheetName];
      const entries = parseCronogramaSheet(sheet, sheetName);
      allEntries.push(...entries);
      sheetsParsed.push(sheetName);
    } catch (err) {
      errors.push(`Error parsing "${sheetName}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Collect unique game names
  const gameSet = new Set<string>();
  for (const entry of allEntries) {
    gameSet.add(entry.gameName);
  }

  return {
    entries: allEntries,
    games: Array.from(gameSet).sort(),
    sheetsParsed,
    errors,
  };
}
