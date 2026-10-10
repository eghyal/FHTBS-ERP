/**
 * Central Work-Shift & Factory Calendar Engine
 * Accurate production scheduling factoring in:
 * - Daily shift operational hours (e.g. 8h/day from 08:00 - 17:00)
 * - Lunch/Rest breaks (12:00 - 13:00)
 * - Factory non-working days (Weekends: Saturday & Sunday)
 * - Standard national / factory maintenance holidays
 */

// Known Factory Holidays (YYYY-MM-DD)
export const DEFAULT_FACTORY_HOLIDAYS = [
  "2026-01-01", // New Year
  "2026-03-20", // Hari Raya Idul Fitri Day 1
  "2026-03-21", // Hari Raya Idul Fitri Day 2
  "2026-05-01", // Labour Day
  "2026-05-14", // Ascension Day
  "2026-06-01", // Pancasila Day
  "2026-08-17", // Independence Day
  "2026-12-25", // Christmas Day
];

export interface ShiftConfig {
  hoursPerDay: number;      // e.g. 8 hours
  shiftStartHour: number;   // e.g. 8 (08:00)
  shiftEndHour: number;     // e.g. 17 (17:00 with 1h lunch)
  lunchStartHour: number;   // e.g. 12 (12:00)
  lunchEndHour: number;     // e.g. 13 (13:00)
  workOnSaturday: boolean;  // default false
  holidays?: string[];      // list of YYYY-MM-DD
}

export const DEFAULT_SHIFT_CONFIG: ShiftConfig = {
  hoursPerDay: 8,
  shiftStartHour: 8,
  shiftEndHour: 17,
  lunchStartHour: 12,
  lunchEndHour: 13,
  workOnSaturday: false,
  holidays: DEFAULT_FACTORY_HOLIDAYS,
};

/**
 * Checks if a given date is a working day (not weekend or holiday)
 */
export function isWorkingDay(date: Date, config: ShiftConfig = DEFAULT_SHIFT_CONFIG): boolean {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0) return false;
  if (dayOfWeek === 6 && !config.workOnSaturday) return false;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const holidays = config.holidays || DEFAULT_FACTORY_HOLIDAYS;
  if (holidays.includes(dateStr)) return false;

  return true;
}

/**
 * Moves date to the beginning of the next valid working shift if currently in non-working time
 */
export function normalizeToWorkShift(date: Date, config: ShiftConfig = DEFAULT_SHIFT_CONFIG): Date {
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  let curr = isNaN(time) ? new Date() : new Date(time);

  // Step 1: Ensure date is on a working day (max 30 days lookup to prevent infinite loop)
  let daySafety = 0;
  while (!isWorkingDay(curr, config) && daySafety < 30) {
    daySafety++;
    curr.setDate(curr.getDate() + 1);
    curr.setHours(config.shiftStartHour, 0, 0, 0);
  }

  const hour = curr.getHours() + curr.getMinutes() / 60;

  // If before shift starts, jump to shift start
  if (hour < config.shiftStartHour) {
    curr.setHours(config.shiftStartHour, 0, 0, 0);
  }
  // If in lunch break, jump to end of lunch break
  else if (hour >= config.lunchStartHour && hour < config.lunchEndHour) {
    curr.setHours(config.lunchEndHour, 0, 0, 0);
  }
  // If after shift ends, jump to next working day morning
  else if (hour >= config.shiftEndHour) {
    curr.setDate(curr.getDate() + 1);
    curr.setHours(config.shiftStartHour, 0, 0, 0);
    // Move forward without unbounded recursion
    let nextDaySafety = 0;
    while (!isWorkingDay(curr, config) && nextDaySafety < 30) {
      nextDaySafety++;
      curr.setDate(curr.getDate() + 1);
      curr.setHours(config.shiftStartHour, 0, 0, 0);
    }
  }

  return curr;
}

/**
 * Calculates the exact forward calendar Date when a job requiring `workHoursNeeded`
 * productive working hours will finish, respecting shifts, lunch breaks, and weekends.
 */
export function calculateShiftCompletionDate(
  startDateInput: Date | string,
  workHoursNeeded: number,
  config: ShiftConfig = DEFAULT_SHIFT_CONFIG
): Date {
  const parsedStart = new Date(startDateInput);
  const validStart = isNaN(parsedStart.getTime()) ? new Date() : parsedStart;

  if (!Number.isFinite(workHoursNeeded) || workHoursNeeded <= 0) {
    return validStart;
  }

  let current = normalizeToWorkShift(validStart, config);
  let remainingHours = Math.min(workHoursNeeded, 10000); // Guard maximum 10,000 work hours

  let safetyLoops = 0;
  const MAX_LOOPS = 2000;

  while (remainingHours > 0.0001 && safetyLoops < MAX_LOOPS) {
    safetyLoops++;
    const currentHour = current.getHours() + current.getMinutes() / 60 + current.getSeconds() / 3600;

    // Available hours before lunch
    if (currentHour < config.lunchStartHour) {
      const hoursUntilLunch = Math.max(0, config.lunchStartHour - currentHour);
      if (hoursUntilLunch > 0 && remainingHours <= hoursUntilLunch) {
        const msToAdd = remainingHours * 60 * 60 * 1000;
        return new Date(current.getTime() + msToAdd);
      } else {
        remainingHours -= hoursUntilLunch;
        // Jump past lunch break
        current.setHours(config.lunchEndHour, 0, 0, 0);
      }
    }
    // Available hours after lunch until shift end
    else if (currentHour < config.shiftEndHour) {
      const hoursUntilShiftEnd = Math.max(0, config.shiftEndHour - currentHour);
      if (hoursUntilShiftEnd > 0 && remainingHours <= hoursUntilShiftEnd) {
        const msToAdd = remainingHours * 60 * 60 * 1000;
        return new Date(current.getTime() + msToAdd);
      } else {
        remainingHours -= hoursUntilShiftEnd;
        // Move to next working day morning
        current.setDate(current.getDate() + 1);
        current.setHours(config.shiftStartHour, 0, 0, 0);
        current = normalizeToWorkShift(current, config);
      }
    } else {
      // Past shift end, advance to next working day
      current.setDate(current.getDate() + 1);
      current.setHours(config.shiftStartHour, 0, 0, 0);
      current = normalizeToWorkShift(current, config);
    }
  }

  return current;
}

/**
 * Checks if the required work duration has actually elapsed in real working time
 */
export function isWorkHoursElapsed(
  startDateInput: Date | string,
  workHoursNeeded: number,
  config: ShiftConfig = DEFAULT_SHIFT_CONFIG,
  currentTime: Date = new Date()
): boolean {
  const completionDate = calculateShiftCompletionDate(startDateInput, workHoursNeeded, config);
  return currentTime.getTime() >= completionDate.getTime();
}

/**
 * Formats a friendly working duration info string
 */
export function formatShiftDurationInfo(workHours: number, config: ShiftConfig = DEFAULT_SHIFT_CONFIG): string {
  const days = Math.floor(workHours / config.hoursPerDay);
  const remainingHours = Math.round((workHours % config.hoursPerDay) * 10) / 10;

  const parts = [];
  if (days > 0) parts.push(`${days} Work Day${days > 1 ? "s" : ""}`);
  if (remainingHours > 0 || days === 0) parts.push(`${remainingHours}h`);

  return parts.join(" ");
}
