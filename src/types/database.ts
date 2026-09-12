export interface Game {
  id: string;
  name: string;
  cover_url: string | null;
  status: 'playing' | 'completed' | 'paused' | 'dropped';
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  game_id: string;
  hours: number;
  minutes: number;
  seconds: number;
  total_seconds: number;
  played_at: string;
  note: string | null;
  created_at: string;
}

export interface GameWithStats extends Game {
  total_seconds: number;
  entries_count: number;
  last_played_at?: string | null;
}

export interface TimeStats {
  today: number;
  week: number;
  month: number;
  all_time: number;
}

export function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export function formatTimeShort(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export const STATUS_LABELS: Record<Game['status'], string> = {
  playing: 'Jugando',
  completed: 'Completado',
  paused: 'Pausado',
  dropped: 'Abandonado',
};

export const STATUS_COLORS: Record<Game['status'], string> = {
  playing: 'var(--color-accent)',
  completed: 'var(--color-success)',
  paused: 'var(--color-warning)',
  dropped: 'var(--color-muted)',
};

export function getLocalDateStr(d: Date = new Date(), timeZone?: string): string {
  let tz = timeZone;
  if (!tz) {
    if (typeof process !== 'undefined' && process.env?.APP_TIMEZONE) {
      tz = process.env.APP_TIMEZONE;
    } else if (typeof window !== 'undefined' && typeof Intl !== 'undefined') {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';
    } else {
      tz = 'America/Bogota';
    }
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d);
  } catch {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
