import { allServices } from '../data/mockData';
import { DEPOSIT_PERCENTAGE } from '../constants';

export const getServiceDurationsFromBooking = (booking: any): Record<string, number> => {
    if (booking.service_durations) return booking.service_durations;
    if (booking.serviceDurations) return booking.serviceDurations; // Handle frontend formState spread
    
    // Legacy fallback
    const durations: Record<string, number> = {};
    (booking.services_requested || []).forEach((id: string) => {
        const s = allServices.find(srv => srv.id === id);
        durations[id] = s?.rate_type === 'per_hour' ? booking.duration_hours : 0;
    });
    return durations;
};

export const calculateBookingCost = (serviceDurations: Record<string, number>, numPerformers: number) => {
    if (!serviceDurations || Object.keys(serviceDurations).length === 0 || numPerformers === 0) return { totalCost: 0, depositAmount: 0 };
        
    let hourlyCost = 0;
    let flatCost = 0;

    Object.entries(serviceDurations).forEach(([serviceId, duration]) => {
        const service = allServices.find(s => s.id === serviceId);
        if (!service) return;

        if (service.rate_type === 'flat') {
            flatCost += service.rate;
        } else if (service.rate_type === 'per_hour') {
            const hours = Math.max(duration || 0, service.min_duration_hours || 0);
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
    const minutes = Math.round(totalMinutes % 60);
    
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
export const getBookingDurationInfo = (serviceDurations: Record<string, number>) => {
    const serviceIds = Object.keys(serviceDurations);
    const selectedServiceObjects = allServices.filter(s => serviceIds.includes(s.id));
    
    let totalDurationMinutes = 0;
    let hasHourlyService = false;

    selectedServiceObjects.forEach(s => {
        if (s.rate_type === 'per_hour') {
            hasHourlyService = true;
            const durationHours = serviceDurations[s.id] || 0;
            totalDurationMinutes += durationHours * 60;
        } else if (s.rate_type === 'flat') {
            totalDurationMinutes += s.duration_minutes || 0;
        }
    });
    
    return {
        totalDurationMinutes,
        formattedTotalDuration: formatMinutesToHoursAndMinutes(totalDurationMinutes),
        hasHourlyService,
    };
};
