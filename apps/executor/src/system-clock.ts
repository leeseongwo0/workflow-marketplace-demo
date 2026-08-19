import type { Clock } from "./contracts.js";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
