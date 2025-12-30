import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { Logger } from '../../services/logger';

function formatLocal(d?: string, t?: string): string | null {
  if (!d) return null;
  const m = String(d).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  let hh = '00', mm = '00', ss = '00';
  if (t) {
    const tt = String(t).trim().replace(/Z$/i, '');
    const parts = tt.split(':');
    if (parts.length >= 1) hh = parts[0].padStart(2, '0');
    if (parts.length >= 2) mm = parts[1].padStart(2, '0');
    if (parts.length >= 3) ss = parts[2].split('.')[0].padStart(2, '0');
  }
  return `${m[1]}${m[2]}${m[3]}T${hh}${mm}${ss}`;
}

export async function calendarHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const requestId = context.invocationId || '';
  const logger = new Logger(requestId, context.invocationId);
  try {
    const q = request.query;
    const name = q.get('name') || '';
    const startDate = q.get('startDate') || '';
    const endDate = q.get('endDate') || '';
    const startTime = q.get('startTime') || '';
    const endTime = q.get('endTime') || '';
    const description = q.get('description') || '';
    const location = q.get('location') || '';

    const dtStart = formatLocal(startDate, startTime);
    const dtEnd = formatLocal(endDate || startDate, endTime || startTime) || dtStart;

    const orgName = 'Event';
    const uid = `${Date.now()}@calendar`;
    const now = new Date();
    const pad = (v: number) => String(v).padStart(2, '0');
    const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//${orgName}//Event//EN`,
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
    ];
    if (dtStart) lines.push(`DTSTART:${dtStart}`);
    if (dtEnd) lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${(name || '').replace(/\n/g, '\\n')}`);
    if (description) lines.push(`DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`);
    if (location) lines.push(`LOCATION:${(location || '').replace(/\n/g, '\\n')}`);
    lines.push('END:VEVENT','END:VCALENDAR');

    const ics = lines.join('\r\n');
    return {
      status: 200,
      body: ics,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="event.ics"'
      }
    };
  } catch (e: any) {
    logger.error('Failed to generate calendar ICS', e, { errorMessage: e?.message });
    return { status: 500, body: 'Failed to generate calendar file' };
  }
}

app.http('calendar', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'calendar',
  handler: calendarHandler
});
