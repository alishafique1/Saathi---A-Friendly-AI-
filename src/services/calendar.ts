
export interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  status: string;
}

export async function fetchUpcomingEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  try {
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
        throw new Error('API_DISABLED');
      }
      const errorBody = await res.text();
      console.error('Calendar API Error:', errorBody);
      return [];
    }

    const data = await res.json();
    return data.items || [];
  } catch (error) {
    console.error('Network error fetching calendar:', error);
    return [];
  }
}

export function findCurrentEvent(events: CalendarEvent[]): CalendarEvent | null {
  const now = new Date();
  return events.find(event => {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    return now >= start && now <= end;
  }) || null;
}
