export function nowIso(clock: () => Date = () => new Date()): string {
  return dateToIso(clock());
}

export function dateToIso(value: Date): string {
  const timestamp = value.getTime();

  if (Number.isNaN(timestamp)) {
    throw new Error("Invalid date cannot be converted to ISO string.");
  }

  return value.toISOString();
}

export function assertIsoDateTime(value: string): string {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid ISO date-time string: ${value}`);
  }

  return value;
}
