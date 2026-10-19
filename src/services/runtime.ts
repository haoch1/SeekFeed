import type { SchedulerService } from './scheduler';

let scheduler: SchedulerService | undefined;

export function setScheduler(service: SchedulerService): void {
    scheduler = service;
}

export function getScheduler(): SchedulerService | undefined {
    return scheduler;
}
