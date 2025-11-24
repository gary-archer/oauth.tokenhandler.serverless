/*
 * A utility to measure the performance of an API request
 */
export class PerformanceBreakdown {

    private startTime!: [number, number];
    private millisecondsTaken: number;

    public constructor() {
        this.millisecondsTaken = 0;
    }

    /*
     * Start a performance measurement after creation
     */
    public start(): void {
        this.startTime = process.hrtime();
    }

    /*
     * Stop the timer and finish the measurement, converting nanoseconds to milliseconds
     */
    public [Symbol.dispose](): void {

        const endTime = process.hrtime(this.startTime);
        this.millisecondsTaken = Math.floor((endTime[0] * 1000000000 + endTime[1]) / 1000000);
    }

    /*
     * Return the time taken
     */
    public getMillisecondsTaken(): number {
        return this.millisecondsTaken;
    }
}
