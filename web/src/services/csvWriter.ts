export interface RecordedSample {
  timestamp: number;        // seconds from recording start
  serialNumber: number | null;
  channels: Float32Array;   // 8 raw µV values (unfiltered)
  /** Hardware event byte (TLV Tag 7), 1..255 when set; undefined when no event in this sample. */
  hardwareEvent?: number;
  /**
   * Unix ms wallclock of the trigger on the source device.
   * When present, used as `Event Date` in the CSV (Option B source-wallclock alignment).
   * When absent, falls back to `startTime + timestamp * 1000` (legacy behaviour).
   */
  hardwareEventWallclock?: number;
  /** Software marker numeric ID as string (e.g. "1101"). Comes from BroadcastChannel marker. */
  softwareMarkerId?: string;
  /** Software marker label string (e.g. "stim_target"). Comes from BroadcastChannel marker. */
  softwareMarkerName?: string;
  /**
   * Source wallclock (Unix ms) of the software marker — set by the sender (e.g. THEMynd) at
   * trigger fire time. Used for CSV Event Date (Option B). When absent, falls back to
   * startTime + timestamp * 1000.
   */
  softwareMarkerWallclock?: number;
}

const pad2 = (n: number) => n.toString().padStart(2, '0');
const pad3 = (n: number) => n.toString().padStart(3, '0');

function formatDatetime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`
  );
}

export function generateCsv(
  samples: RecordedSample[],
  startTime: Date,
  deviceId: string,
  filterDesc: string,
  notchDesc: string,
): string {
  const lines: string[] = [];

  // Header block — exactly 10 lines matching Cygnus CSV format
  lines.push('Cygnus version: 0.28.0.7,File version: 2021.11');
  lines.push('Operative system: Browser');
  lines.push(`Record datetime: ${formatDatetime(startTime)}`);
  lines.push(`Device ID: ${deviceId || 'STEEG_UNKNOWN'}`);
  lines.push('Device version: ');
  lines.push('Device bandwidth: DC to 131 Hz');
  lines.push('Device sampling rate: 1000 samples/second');
  lines.push('Data type / unit: EEG / micro-volt (uV)');
  lines.push(`Bandpass filter: ${filterDesc}`);
  lines.push(`Notch filter: ${notchDesc}`);

  // Column headers (line 11 — must not be shifted by extra rows)
  lines.push(
    'Timestamp,Serial Number,Fp1,Fp2,T7,T8,O1,O2,Fz,Pz,Event Id,Event Date,Event Duration,Software Marker,Software Marker Name',
  );

  // Data rows
  for (const sample of samples) {
    const ts = sample.timestamp.toFixed(3);
    const sn = sample.serialNumber !== null ? sample.serialNumber.toString() : '';
    const ch = Array.from({ length: 8 }, (_, i) =>
      sample.channels[i] !== undefined ? sample.channels[i]!.toFixed(4) : '0.0000',
    ).join(',');

    const hwEvent = sample.hardwareEvent != null ? String(sample.hardwareEvent) : '';
    let eventDate = '';
    if (sample.hardwareEvent != null) {
      // Hardware takes precedence: use source wallclock (Option B) or fallback.
      eventDate = formatDatetime(
        sample.hardwareEventWallclock != null
          ? new Date(sample.hardwareEventWallclock)
          : new Date(startTime.getTime() + sample.timestamp * 1000),
      );
    } else if (sample.softwareMarkerId != null) {
      // Software marker: use source wallclock or fallback.
      eventDate = formatDatetime(
        sample.softwareMarkerWallclock != null
          ? new Date(sample.softwareMarkerWallclock)
          : new Date(startTime.getTime() + sample.timestamp * 1000),
      );
    }
    const swMarker = sample.softwareMarkerId ?? '';
    const swMarkerName = sample.softwareMarkerName ?? '';

    lines.push(`${ts},${sn},${ch},${hwEvent},${eventDate},,${swMarker},${swMarkerName}`);
  }

  return lines.join('\r\n') + '\r\n';
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildCsvFilename(subjectId: string, startTime: Date): string {
  const y = startTime.getFullYear();
  const mo = pad2(startTime.getMonth() + 1);
  const d = pad2(startTime.getDate());
  const h = pad2(startTime.getHours());
  const mi = pad2(startTime.getMinutes());
  const s = pad2(startTime.getSeconds());
  const id = subjectId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'subject';
  return `${id}_${y}${mo}${d}_${h}${mi}${s}.csv`;
}
