import { allServices } from '../data/mockData';
import {
    DEPOSIT_PERCENTAGE, TRAVEL_FEE_THRESHOLD_KM, TRAVEL_FEE_RATE_PER_KM,
    ASAP_SURCHARGE_PERCENT,
} from '../constants';
import { calculateTravelFee, getSuburbDistance } from '../data/suburbs';

export const calculateBookingCost = (
    durationHours: number,
    serviceIds: string[],
    numPerformers: number,
    suburbName?: string,
    isAsap: boolean = false,
) => {
    if (!serviceIds || serviceIds.length === 0 || numPerformers === 0) {
        return { totalCost: 0, depositAmount: 0, travelFee: 0, asapSurcharge: 0 };
    }

    const durationNum = durationHours || 0;
    let hourlyCost = 0;
    let flatCost = 0;

    serviceIds.forEach(serviceId => {
        const service = allServices.find(s => s.id === serviceId);
        if (!service) return;

        if (service.rate_type === 'flat') {
            flatCost += service.rate;
        } else if (service.rate_type === 'per_hour') {
            const hours = Math.max(durationNum, service.min_duration_hours || 0);
            hourlyCost += service.rate * hours;
        }
    });

    const distanceKm = suburbName ? getSuburbDistance(suburbName) : null;
    const travelFee = distanceKm !== null ? calculateTravelFee(distanceKm, TRAVEL_FEE_THRESHOLD_KM, TRAVEL_FEE_RATE_PER_KM) : 0;

    const subtotal = (hourlyCost * numPerformers) + flatCost + travelFee;
    const asapSurcharge = isAsap ? subtotal * ASAP_SURCHARGE_PERCENT : 0;
    const totalCost = subtotal + asapSurcharge;
    const depositAmount = totalCost * DEPOSIT_PERCENTAGE;
    return { totalCost, depositAmount, travelFee, asapSurcharge };
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
export const getBookingDurationInfo = (durationHours: number, serviceIds: string[]) => {
    const selectedServiceObjects = allServices.filter(s => (serviceIds || []).includes(s.id));
    
    const hasHourlyService = selectedServiceObjects.some(s => s.rate_type === 'per_hour');
    const showDurationMinutes = selectedServiceObjects
        .filter(s => s.rate_type === 'flat' && s.duration_minutes)
        .reduce((sum, s) => sum + s.duration_minutes!, 0);

    // Base duration only applies if an hourly service is selected.
    const baseDurationMinutes = hasHourlyService ? (durationHours || 0) * 60 : 0;
    
    const totalDurationMinutes = baseDurationMinutes + showDurationMinutes;
    
    return {
        totalDurationMinutes,
        formattedTotalDuration: formatMinutesToHoursAndMinutes(totalDurationMinutes),
        hasHourlyService,
        showDurationMinutes,
        baseDurationMinutes,
    };
};