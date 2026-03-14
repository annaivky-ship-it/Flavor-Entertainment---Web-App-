import { allServices } from '../data/mockData';
import { DEPOSIT_PERCENTAGE } from '../constants';

export const calculateBookingCost = (durationHours: number, serviceIds: string[], numPerformers: number, serviceDurations?: Record<string, number>) => {
    if (!serviceIds || serviceIds.length === 0 || numPerformers === 0) return { totalCost: 0, depositAmount: 0 };

    const durationNum = durationHours || 0;
    let hourlyCost = 0;
    let flatCost = 0;

    serviceIds.forEach(serviceId => {
        const service = allServices.find(s => s.id === serviceId);
        if (!service) return;

        if (service.rate_type === 'flat') {
            flatCost += service.rate;
        } else if (service.rate_type === 'per_hour') {
            const perServiceDuration = serviceDurations?.[serviceId];
            const hours = perServiceDuration != null
                ? Math.max(perServiceDuration, service.min_duration_hours || 0)
                : Math.max(durationNum, service.min_duration_hours || 0);
            hourlyCost += service.rate * hours;
        }
    });

    const totalCost = (hourlyCost * numPerformers) + flatCost;
    const depositAmount = totalCost * DEPOSIT_PERCENTAGE;
    return { totalCost, depositAmount };
};


// New helper function to format duration
export const formatMinutesToHoursAndMinutes = (totalMinutes: number): string => {
    if (totalMinutes <= 0) return 'N/A';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    let result = '';
    if (hours > 0) {
        result += `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    if (minutes > 0) {
        if (hours > 0) result += ' ';
        result += `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return result.trim();
};


// New function to get detailed duration info
export const getBookingDurationInfo = (durationHours: number, serviceIds: string[], serviceDurations?: Record<string, number>) => {
    const selectedServiceObjects = allServices.filter(s => (serviceIds || []).includes(s.id));

    const hasHourlyService = selectedServiceObjects.some(s => s.rate_type === 'per_hour');
    const showDurationMinutes = selectedServiceObjects
        .filter(s => s.rate_type === 'flat' && s.duration_minutes)
        .reduce((sum, s) => sum + s.duration_minutes!, 0);

    // Sum up per-service hourly durations
    let baseDurationMinutes = 0;
    if (hasHourlyService) {
        if (serviceDurations && Object.keys(serviceDurations).length > 0) {
            // Use per-service durations — take the max since services run concurrently
            const maxHours = Math.max(
                ...selectedServiceObjects
                    .filter(s => s.rate_type === 'per_hour')
                    .map(s => {
                        const d = serviceDurations[s.id];
                        return d != null ? Math.max(d, s.min_duration_hours || 0) : (durationHours || 0);
                    })
            );
            baseDurationMinutes = maxHours * 60;
        } else {
            baseDurationMinutes = (durationHours || 0) * 60;
        }
    }

    const totalDurationMinutes = baseDurationMinutes + showDurationMinutes;

    return {
        totalDurationMinutes,
        formattedTotalDuration: formatMinutesToHoursAndMinutes(totalDurationMinutes),
        hasHourlyService,
        showDurationMinutes,
        baseDurationMinutes,
    };
};
