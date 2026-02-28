export function addWorkingDays(date: Date, days: number): Date {
    const result = new Date(date);
    let count = 0;

    while (count < days) {
        result.setDate(result.getDate() + 1);
        const day = result.getDay();
        if (day !== 0 && day !== 6) {
            count++;
        }
    }

    return result;
}

export function getNextWorkingDay(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    if (day === 6) {
        result.setDate(result.getDate() + 2);
    } else if (day === 0) {
        result.setDate(result.getDate() + 1);
    }
    return result;
}
