
export interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status: string;
}

export async function fetchUpcomingEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=10&singleEvents=true&orderBy=startTime`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (res.status === 401) {
    console.warn('Google Calendar token expired or invalid.');
    return [];
  }

  if (!res.ok) {
    if (res.status === 403) {
      const errorBody = await res.json().catch(() => ({}));
      if (errorBody.error?.message?.includes('disabled') || errorBody.error?.status === 'PERMISSION_DENIED') {
        throw new Error('CALENDAR_API_DISABLED: The Google Calendar API is not enabled in your Google Cloud Console. Please enabled it for this project.');
      }
      throw new Error(`API_FORBIDDEN: ${errorBody.error?.message || 'Access denied'}`);
    }
    const errorBody = await res.text();
    console.error('Calendar API Error:', errorBody);
    return [];
  }

  const data = await res.json();
  return data.items || [];
}

export function findCurrentEvent(events: CalendarEvent[]): CalendarEvent | null {
  const now = new Date();
  return events.find(event => {
    const startStr = event.start.dateTime || event.start.date;
    const endStr = event.end.dateTime || event.end.date;
    if (!startStr || !endStr) return false;
    
    const start = new Date(startStr);
    const end = new Date(endStr);
    return now >= start && now <= end;
  }) || null;
}
