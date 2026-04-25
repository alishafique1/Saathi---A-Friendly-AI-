
export interface GoogleTask {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  notes?: string;
  due?: string;
}

export async function createGoogleTask(token: string, title: string, notes?: string) {
  try {
    // Get default task list first
    const listRes = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const lists = await listRes.json();
    const defaultList = lists.items?.[0]?.id || '@default';

    const res = await fetch(`https://www.googleapis.com/tasks/v1/lists/${defaultList}/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        notes: notes || 'Added by Saathi',
        status: 'needsAction',
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('Google Tasks API Error:', err);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('Network error creating Google Task:', error);
    return null;
  }
}
